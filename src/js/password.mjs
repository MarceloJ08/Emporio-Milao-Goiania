import { newPasswordError } from './signup.mjs';

const retry = 'Não foi possível atualizar a senha agora. Tente novamente.';
const freshLink = 'Solicite um novo link e abra-o no navegador em que pediu a recuperação.';
const wait = 'Muitas solicitações. Aguarde antes de tentar novamente.';

export function stagingAuthProject(config, origin) {
  if (!config || config.origin !== origin) return null;
  const host = new URL(origin).hostname;
  if (host === 'emporio-milao-goiania.vercel.app') return null;
  try {
    const url = new URL(config.supabaseUrl);
    if (url.origin !== 'https://uzldbiahraeqnhzxqfoz.supabase.co'
      || config.supabaseUrl !== url.origin
      || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey)) return null;
    return [url.origin, config.publishableKey];
  } catch {
    return null;
  }
}

export function readRecoveryReturn(url) {
  if (url.searchParams.get('senha') !== 'recuperar') return null;
  const fragment = new URLSearchParams(url.hash.slice(1));
  const tokens = fragment.getAll('token_hash');
  if (tokens.length || url.searchParams.has('token_hash')) {
    // Only accept the fragment format from the staging template. A query
    // parameter would already have reached the host in the HTTP request.
    const token = tokens[0];
    const valid = tokens.length === 1 && token && !/\s/.test(token)
      && token.length <= 512 && !url.searchParams.has('token_hash')
      && !url.searchParams.has('code') && !fragment.has('access_token');
    return { kind: 'token', token: valid ? token : null };
  }
  return { kind: 'pkce', code: url.searchParams.get('code') };
}

export function confirmRecoveryToken(token, getAuth) {
  // Hold the credential only in memory and consume it only on confirmation.
  return async () => {
    if (!token) return null;
    const tokenHash = token;
    token = null;
    try {
      const auth = getAuth();
      const { data, error } = await auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
      if (!error && data?.session?.user?.id) return auth;
    } catch {
      // Don't expose SDK errors or the credential.
    }
    return null;
  };
}

// Persist the SDK's PKCE verifier across pages. Keep the recovery session itself
// in memory, separate from the regular storefront account.
export function recoveryStorage(storage, sessionKey) {
  const memory = new Map();
  return {
    getItem: key => key === sessionKey ? memory.get(key) ?? null : storage.getItem(key),
    setItem: (key, value) => key === sessionKey ? memory.set(key, value) : storage.setItem(key, value),
    removeItem: key => key === sessionKey ? memory.delete(key) : storage.removeItem(key),
  };
}

export async function exchangeRecoveryLink(auth, code) {
  if (!code) return null;
  try {
    const { data, error } = await auth.exchangeCodeForSession(code);
    if (!error && data?.redirectType === 'recovery') return data.session;
  } catch {
    // Invalid or unavailable callback. Offer a fresh link.
  }
  return null;
}

function errorMessage(error, recovery) {
  switch (error.code) {
    case 'current_password_required':
      return recovery ? freshLink : 'Informe a senha atual.';
    case 'current_password_mismatch':
      return 'A senha atual está incorreta.';
    case 'reauthentication_not_valid':
    case 'otp_expired':
      return 'Código inválido ou expirado. Solicite outro e tente novamente.';
    case 'same_password':
      return 'Escolha uma nova senha diferente da anterior.';
    case 'weak_password':
      return error.reasons?.includes('pwned')
        ? 'Essa senha apareceu em vazamentos conhecidos. Escolha outra.'
        : 'O serviço recusou a senha. Escolha uma senha mais forte.';
    case 'session_not_found':
    case 'session_expired':
    case 'bad_jwt':
      return recovery ? freshLink : 'Sua sessão expirou. Entre novamente para trocar a senha.';
    case 'insufficient_aal':
      return 'Confirme a autenticação em dois fatores da sua conta antes de trocar a senha.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return wait;
    default:
      if (error.name === 'AuthSessionMissingError') {
        return recovery ? freshLink : 'Entre na sua conta novamente para trocar a senha.';
      }
      return error.status === 429 ? wait : retry;
  }
}

export function bindPasswordForm(form, { getAuth, recovery = false, onSuccess }) {
  const current = form.querySelector('[autocomplete="current-password"]');
  const password = form.querySelector('[autocomplete="new-password"]');
  const confirm = form.querySelector('[data-password-confirm]');
  const challenge = form.querySelector('[data-password-challenge]');
  const nonce = challenge.querySelector('[autocomplete="one-time-code"]');
  const send = challenge.querySelector('button');
  const submit = form.querySelector('[type="submit"]');
  const status = form.querySelector('[role="status"]');
  let busy = false;

  async function run(action) {
    if (busy) return;
    const auth = getAuth();
    if (!auth) {
      status.textContent = recovery ? freshLink : 'Entre na sua conta novamente.';
      return;
    }
    busy = true;
    submit.disabled = send.disabled = true;
    try {
      await action(auth);
    } catch {
      status.textContent = retry;
    } finally {
      busy = false;
      submit.disabled = send.disabled = false;
    }
  }

  send.onclick = () => run(async auth => {
    nonce.value = '';
    const { error } = await auth.reauthenticate();
    status.textContent = error ? errorMessage(error, recovery) : 'Digite o código enviado ao seu e-mail.';
    if (!error) nonce.focus();
  });

  form.onsubmit = event => {
    event.preventDefault();
    return run(async auth => {
      const validation = newPasswordError(password.value)
        || (confirm && password.value !== confirm.value ? 'As senhas não coincidem.' : '');
      if (validation || (current && !current.value)) {
        status.textContent = validation || 'Informe a senha atual.';
        return;
      }
      const code = nonce.value.trim();
      if (!challenge.hidden && !code) {
        status.textContent = 'Solicite o código, se necessário, e informe-o para continuar.';
        return;
      }
      const { error } = await auth.updateUser({
        password: password.value,
        ...(current ? { current_password: current.value } : {}),
        ...(code && !challenge.hidden ? { nonce: code } : {}),
      });
      if (error) {
        if (error.code === 'reauthentication_needed') {
          challenge.hidden = false;
          status.textContent = 'Solicite um código de segurança para confirmar a troca.';
          send.focus();
          return;
        }
        status.textContent = errorMessage(error, recovery);
        return;
      }
      reset();
      status.textContent = 'Senha atualizada com sucesso.';
      await onSuccess(auth);
    });
  };

  function reset() {
    form.reset();
    challenge.hidden = true;
    status.textContent = '';
  }
  return reset;
}
