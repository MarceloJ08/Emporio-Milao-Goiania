const productionSiteKey = '0x4AAAAAAGRv14pzRHaUFhMf';
const localTestSiteKey = '1x00000000000000000000AA';
const turnstileUrl = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const verificationFailed = 'Não foi possível validar a verificação de segurança. Tente novamente.';
const verificationExpired = 'A verificação de segurança expirou. Tente novamente.';
const loadFailed = 'Não foi possível carregar a verificação de segurança. Confira a conexão e tente novamente.';

class TurnstileError extends Error {}

let loading;
function loadTurnstile() {
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = turnstileUrl;
      script.async = true;
      const fail = () => {
        clearTimeout(timer);
        script.remove();
        reject(new TurnstileError(loadFailed));
      };
      const timer = setTimeout(fail, 12_000);
      script.onerror = fail;
      script.onload = () => {
        if (!window.turnstile?.ready) return fail();
        window.turnstile.ready(() => {
          clearTimeout(timer);
          resolve(window.turnstile);
        });
      };
      document.head.append(script);
    }).catch(error => {
      loading = undefined;
      throw error;
    });
  }
  return loading;
}

export function captchaErrorMessage(error) {
  if (error instanceof TurnstileError) return error.message;
  if (error?.code === 'captcha_failed') return verificationFailed;
  return '';
}

export async function requestCaptcha(form, action) {
  const turnstile = await loadTurnstile();
  const slot = document.createElement('div');
  form.querySelector('[type="submit"]').before(slot);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const sitekey = local ? localTestSiteKey : productionSiteKey;
  let widget;
  let timer;

  try {
    return await new Promise((resolve, reject) => {
      const fail = (message = verificationFailed) => reject(new TurnstileError(message));
      timer = setTimeout(() => fail(verificationExpired), 90_000);
      widget = turnstile.render(slot, {
        sitekey,
        action,
        appearance: 'interaction-only',
        execution: 'execute',
        size: form.clientWidth < 310 ? 'compact' : 'flexible',
        language: 'pt-BR',
        'response-field': false,
        retry: 'never',
        'refresh-expired': 'never',
        'refresh-timeout': 'never',
        callback: token => typeof token === 'string' && token ? resolve(token) : fail(),
        'expired-callback': () => fail(verificationExpired),
        'timeout-callback': () => fail(verificationExpired),
        'error-callback': () => {
          fail();
          return true;
        },
        'unsupported-callback': () => fail('Este navegador não conseguiu executar a verificação de segurança. Tente outro navegador.'),
      });
      if (!widget) return fail();
      turnstile.execute(widget);
    });
  } catch (error) {
    throw error instanceof TurnstileError ? error : new TurnstileError(verificationFailed);
  } finally {
    clearTimeout(timer);
    if (widget) turnstile.remove(widget);
    slot.remove();
  }
}
