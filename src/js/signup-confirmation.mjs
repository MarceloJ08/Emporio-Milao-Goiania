import { bindEmailFeedback, emailErrorKind } from './email-requests.mjs';

const storageKey = 'emporio:signup-pending';
const pendingLifetime = 24 * 60 * 60 * 1000;
const pendingCopy = 'Acesse sua caixa de entrada e confirme seu endereço de e-mail para concluir o cadastro.';
const normalize = value => String(value || '').trim().toLowerCase();

export function signupReturnFrom(url) {
  const params = new URLSearchParams(url.hash.slice(1));
  const type = params.get('type') || url.searchParams.get('type');
  const error = params.get('error_code') || url.searchParams.get('error_code');
  return {
    token: type === 'signup' && !error ? params.get('access_token') : null,
    explicit: type === 'signup',
    expired: error === 'otp_expired' && (!type || type === 'signup'),
  };
}

export function setupSignupConfirmation({ auth, policy, callback, recovery }) {
  const modal = document.getElementById('accountModal');
  const panel = document.getElementById('signupConfirmation');
  const title = document.getElementById('signupConfirmationTitle');
  const address = document.getElementById('signupConfirmationAddress');
  const status = document.getElementById('signupConfirmationStatus');
  const instruction = document.getElementById('signupConfirmationInstruction');
  const form = document.getElementById('resendSignupForm');
  const landingForm = document.getElementById('registerForm');
  const resend = bindEmailFeedback(form, policy, 'confirmation');
  let pending = null;
  let busy = false;

  function save(value) {
    pending = value;
    try {
      if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
      else sessionStorage.removeItem(storageKey);
    } catch { /* The pending screen still works in memory. */ }
    landingForm.hidden = Boolean(value);
  }

  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    if (typeof saved?.email === 'string' && saved.email && saved.until > Date.now() && saved.until <= Date.now() + pendingLifetime) save(saved);
    else if (saved) save(null);
  } catch { /* An invalid or inaccessible entry is ignored. */ }

  function display(state, message = '') {
    if (recovery) return;
    const confirmed = state === 'confirmed';
    panel.dataset.state = state;
    panel.hidden = false;
    modal.classList.add('open', 'confirmation-open');
    title.textContent = confirmed ? 'E-mail confirmado com sucesso!' : !pending && callback.expired ? 'Link expirado' : 'Confirme seu e-mail';
    address.hidden = !pending;
    address.textContent = pending?.email || '';
    instruction.textContent = confirmed ? 'Sua conta está pronta. Você será levado para a loja.'
      : pending ? pendingCopy : 'Os links de confirmação têm validade limitada.';
    status.textContent = message || (confirmed ? 'Confirmação concluída.' : 'Aguardando confirmação…');
    form.hidden = confirmed || !pending;
    title.focus();
  }

  function returnToLogin(focus = true) {
    const pendingAddress = pending?.email;
    save(null);
    callback.token = null;
    callback.explicit = false;
    callback.expired = false;
    panel.hidden = true;
    modal.classList.remove('confirmation-open');
    if (focus) {
      const login = document.getElementById('loginEmail');
      if (pendingAddress) login.value = pendingAddress;
      login.focus();
    }
  }

  document.getElementById('signupConfirmationLogin').onclick = () => returnToLogin();
  form.onsubmit = async event => {
    event.preventDefault();
    if (!pending || panel.dataset.state === 'confirmed') return;
    const { email } = pending;
    await resend(async () => {
      const { error } = await auth.resend({ type: 'signup', email, options: { emailRedirectTo: location.origin } });
      if (error && !['user_not_found', 'user_already_exists', 'email_already_confirmed'].includes(error.code)) {
        return { kind: emailErrorKind(error) };
      }
      return { kind: 'ok', message: 'Se a confirmação ainda estiver pendente, você receberá um novo link. Confira também o spam.' };
    }, 'Não foi possível solicitar o reenvio agora. Tente novamente mais tarde.');
  };

  async function check(session) {
    if (recovery || busy || !session?.access_token) return;
    // A callback may be opened in a new browser, but it must match the
    // session the SDK just established. A pending tab may also learn of a
    // matching confirmed login through the SDK's same-origin auth events.
    const expected = pending;
    const fromLink = callback.token === session.access_token;
    const matchesPending = expected && normalize(session.user?.email) === expected.email;
    if (!fromLink && (callback.explicit || callback.expired || !matchesPending)) return;
    busy = true;
    try {
      const { data, error } = await auth.getUser(session.access_token);
      if (error || !data?.user?.email_confirmed_at || data.user.id !== session.user?.id
        || (matchesPending && !fromLink && normalize(data.user.email) !== expected.email)) return;
      // If the user dismissed this panel while validation was in flight,
      // let the explicit navigation win.
      if (!fromLink && pending !== expected) return;
      if (fromLink && callback.token !== session.access_token) return;
      callback.token = null;
      callback.explicit = false;
      save(null);
      display('confirmed');
      setTimeout(async () => {
        if (panel.hidden || !modal.classList.contains('open') || panel.dataset.state !== 'confirmed') return;
        try {
          const { data: current } = await auth.getSession();
          if (current?.session?.user?.id === data.user.id) {
            returnToLogin(false);
            if (location.pathname === '/' && !location.search && !location.hash) modal.classList.remove('open');
            else location.replace('/');
            return;
          }
        } catch { /* Use the login fallback when the session is unavailable. */ }
        returnToLogin();
      }, 1600);
    } catch {
      // Leave the pending state available when Auth cannot be reached.
    } finally {
      busy = false;
    }
  }

  return {
    start(email) {
      save({ email: normalize(email), until: Date.now() + pendingLifetime });
      policy.startCooldown('confirmation');
      display('pending');
    },
    showIfPending() {
      if (!pending || recovery) return false;
      display('pending');
      return true;
    },
    async initial() {
      if (recovery || (!pending && !callback.explicit && !callback.expired)) return;
      if (callback.expired) {
        display('pending', 'O link expirou ou já foi usado. ' + (pending ? 'Solicite outro abaixo.' : 'Volte ao login para continuar.'));
        return;
      }
      if (pending) display('pending');
      else display('pending', 'Verificando a confirmação…');
      const { data } = await auth.getSession();
      await check(data?.session);
      if (callback.explicit && !busy && panel.dataset.state !== 'confirmed' && !callback.expired) {
        display('pending', 'Não foi possível validar o link. ' + (pending ? 'Solicite outro abaixo.' : 'Volte ao login para continuar.'));
      }
    },
    check,
  };
}
