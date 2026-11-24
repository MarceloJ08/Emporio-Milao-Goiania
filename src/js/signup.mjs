const pending = 'Se for possível prosseguir, você receberá as instruções no e-mail informado. Confira também o spam.';
const invalidEmail = 'Informe um e-mail válido de até 254 caracteres.';
const passwordRules = 'Use pelo menos 12 caracteres, com maiúscula, minúscula, número e um símbolo como !, @ ou #.';
const symbols = "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~";
const neutralCodes = new Set(['user_already_exists', 'email_exists', 'user_not_found', 'email_already_confirmed']);

export function newPasswordError(password) {
  if (new TextEncoder().encode(password).length > 72) {
    return 'A senha ultrapassa o limite de 72 bytes. Acentos e emojis podem ocupar mais de um byte.';
  }
  if ([...password].length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password)
    || !/[0-9]/.test(password) || ![...password].some(character => symbols.includes(character))) {
    return passwordRules;
  }
  return '';
}

export function confirmationLinkState(url) {
  if (url.searchParams.get('cadastro') !== 'confirmacao') return null;
  const fragment = new URLSearchParams(url.hash.slice(1));
  const error = fragment.get('error_code') || url.searchParams.get('error_code');
  if (error === 'otp_expired') return 'O link de confirmação expirou ou já foi usado. Solicite outro abaixo.';
  if (!error && !fragment.has('error') && !url.searchParams.has('error')
    && fragment.get('type') === 'signup' && fragment.has('access_token')) return '';
  return 'Não foi possível validar este link de confirmação. Solicite outro abaixo.';
}

function signupError(error) {
  if (!error || neutralCodes.has(error.code)) return pending;
  if (error.status === 429 || ['over_email_send_rate_limit', 'over_request_rate_limit'].includes(error.code)) {
    return 'Muitas solicitações em pouco tempo. Aguarde e tente novamente.';
  }
  if (error.code === 'weak_password') {
    return error.reasons?.includes('pwned')
      ? 'Essa senha apareceu em vazamentos conhecidos. Escolha outra senha exclusiva.'
      : 'A senha foi recusada pelo serviço de cadastro. ' + passwordRules;
  }
  if (error.code === 'email_address_invalid') return invalidEmail;
  return 'Não foi possível processar a solicitação agora. Tente novamente mais tarde.';
}

export function bindSignup({ auth, forms, origin }) {
  const redirect = new URL('/?cadastro=confirmacao', origin).href;
  let busy = false;
  let creating = false;

  for (const form of forms) {
    const nameField = form.querySelector('[autocomplete="name"]');
    const emailField = form.querySelector('[type="email"]');
    const passwordField = form.querySelector('[autocomplete="new-password"]');
    const submit = form.querySelector('[type="submit"]');
    const resend = form.querySelector('[data-signup-resend]');
    const status = form.querySelector('[data-signup-status]');

    async function request(resending) {
      if (busy) return;
      const email = emailField.value.trim();
      if (new TextEncoder().encode(email).length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        status.textContent = invalidEmail;
        emailField.focus();
        return;
      }

      const fullName = nameField.value.trim();
      const password = resending ? '' : passwordField.value;
      if (!resending) {
        const nameLength = [...fullName].length;
        if (nameLength < 2 || nameLength > 120) {
          status.textContent = 'Informe um nome com 2 a 120 caracteres.';
          nameField.focus();
          return;
        }
        const passwordError = newPasswordError(password);
        if (passwordError) {
          status.textContent = passwordError;
          passwordField.focus();
          return;
        }
      }

      busy = true;
      creating = !resending;
      submit.disabled = true;
      resend.disabled = true;
      status.textContent = resending ? 'Solicitando outro link…' : 'Enviando cadastro…';
      try {
        const result = resending
          ? await auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirect } })
          : await auth.signUp({ email, password, options: { emailRedirectTo: redirect, data: { full_name: fullName } } });

        if (!resending && result.data?.session) {
          await auth.signOut({ scope: 'local' });
          status.textContent = 'Não foi possível exigir a confirmação do e-mail. Tente novamente mais tarde.';
          return;
        }
        status.textContent = signupError(result.error);
        if (!resending && (!result.error || neutralCodes.has(result.error.code))) passwordField.value = '';
      } catch {
        status.textContent = 'Não foi possível processar a solicitação agora. Tente novamente mais tarde.';
      } finally {
        busy = false;
        creating = false;
        submit.disabled = false;
        resend.disabled = false;
      }
    }

    form.onsubmit = event => {
      event.preventDefault();
      return request(false);
    };
    resend.onclick = () => request(true);
  }
  return () => creating;
}
