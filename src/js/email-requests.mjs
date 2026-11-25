const MINUTE = 60_000;
const limits = {
  signup: { loading: 'Criando conta…' },
  confirmation: { loading: 'Solicitando confirmação…', interval: MINUTE, count: 3, window: 30 * MINUTE },
  recovery: { loading: 'Solicitando link…', interval: MINUTE, count: 3, window: 30 * MINUTE },
  emailChange: { loading: 'Solicitando alteração…' },
};
const prefix = 'emporio:email:';
const operationGroup = operation => operation === 'confirmation' ? 'signup' : operation;
const limitMessage = 'Você atingiu o número máximo de solicitações. Por segurança, tente novamente mais tarde.';
const connectionMessage = 'Não foi possível confirmar a solicitação. Verifique a conexão e a caixa de entrada antes de tentar de novo.';

export function emailErrorKind(error) {
  if (error?.status === 429 || ['over_email_send_rate_limit', 'over_request_rate_limit'].includes(error?.code)) return 'limit';
  if (error?.status === 0 || ['AuthRetryableFetchError', 'TimeoutError', 'AbortError', 'TypeError'].includes(error?.name)) return 'connection';
  return 'other';
}

export function createEmailPolicy({ storage, locks, now = Date.now } = {}) {
  const active = new Set();
  const fallback = new Map();
  const listeners = new Set();
  const changed = () => listeners.forEach(listener => listener());
  function read(operation) {
    try {
      if (storage) return JSON.parse(storage.getItem(prefix + operation) || '{}') || {};
    } catch { /* Storage may be unavailable. */ }
    return fallback.get(operation) || {};
  }

  function write(operation, record) {
    fallback.set(operation, record);
    try { storage?.setItem(prefix + operation, JSON.stringify(record)); } catch { /* Keep browser memory fallback. */ }
    changed();
  }

  function recent(record, operation) {
    const windowMs = limits[operation].window || MINUTE;
    return Array.isArray(record.times) ? record.times.filter(time =>
      Number.isFinite(time) && time <= now() && now() - time < windowMs) : [];
  }

  function state(operation) {
    const record = read(operation);
    const history = recent(record, operation);
    const { interval = 0, count = Infinity, window = 0 } = limits[operation];
    const last = history.at(-1);
    const localMaximum = history.length >= count;
    const blocked = Math.max(Number(record.blocked) || 0, localMaximum ? history[0] + window : 0);
    return {
      busy: active.has(operationGroup(operation)),
      limited: blocked > now(),
      seconds: Math.max(0, Math.ceil((Math.max(blocked, Number(record.notBefore) || 0, last === undefined ? 0 : last + interval) - now()) / 1000)),
    };
  }

  async function run(operation, task) {
    const denied = () => {
      const view = state(operation);
      return view.busy ? { kind: 'busy' } : view.seconds ? { kind: view.limited ? 'limit' : 'cooldown' } : null;
    };
    const group = operationGroup(operation);
    const execute = async () => {
      const unavailable = denied();
      if (unavailable) return unavailable;
      active.add(group);
      changed();
      try {
        let result;
        try { result = await task(); }
        catch (error) { result = { kind: emailErrorKind(error) === 'other' ? 'connection' : emailErrorKind(error) }; }
        if (limits[operation].interval && (result.kind === 'ok' || result.kind === 'connection')) {
          const record = read(operation);
          write(operation, { ...record, times: [...recent(record, operation), now()] });
        }
        return result;
      } finally {
        active.delete(group);
        changed();
      }
    };

    const unavailable = denied();
    if (unavailable) return unavailable;
    if (locks?.request) {
      return locks.request(prefix + group, { ifAvailable: true }, lock => lock ? execute() : { kind: 'busy' });
    }
    return execute();
  }

  function retryAfter(operation, header) {
    if (!header) return;
    const until = /^\d+$/.test(header.trim()) ? now() + Number(header) * 1000 : Date.parse(header);
    if (!Number.isFinite(until) || until <= now()) return;
    const record = read(operation);
    write(operation, { ...record, blocked: Math.max(Number(record.blocked) || 0, until) });
  }

  function startCooldown(operation) {
    const record = read(operation);
    write(operation, { ...record, notBefore: now() + (limits[operation].interval || 0) });
  }

  return { run, state, retryAfter, startCooldown, observe(listener) { listeners.add(listener); return () => listeners.delete(listener); } };
}

export function withEmailTimeout(policy, fetcher = fetch, timeout = 15_000) {
  return async (input, init) => {
    const url = typeof input === 'string' || input instanceof URL ? input : input.url;
    const path = new URL(url, globalThis.location?.href).pathname;
    let operation = { '/auth/v1/signup': 'signup', '/auth/v1/recover': 'recovery', '/auth/v1/resend': 'confirmation' }[path];
    if (path === '/auth/v1/user' && init?.method?.toUpperCase() === 'PUT') {
      try { if (Object.hasOwn(JSON.parse(init.body), 'email')) operation = 'emailChange'; } catch { /* Other Auth request. */ }
    }
    if (!operation) return fetcher(input, init);
    const controller = new AbortController();
    const upstream = init?.signal;
    const abort = () => controller.abort(upstream.reason);
    if (upstream?.aborted) abort();
    else upstream?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(new DOMException('Email request timeout', 'TimeoutError')), timeout);
    try {
      const response = await fetcher(input, { ...init, signal: controller.signal });
      if (response.status === 429) policy.retryAfter(operation, response.headers.get('Retry-After'));
      return response;
    } finally {
      clearTimeout(timer);
      upstream?.removeEventListener('abort', abort);
    }
  };
}

export function bindEmailFeedback(form, policy, operation) {
  const button = form.querySelector('[type="submit"]');
  const label = button.textContent;
  const feedback = document.createElement('p');
  feedback.className = 'fineprint email-request-feedback';
  feedback.setAttribute('role', 'status');
  const timer = document.createElement('p');
  timer.className = 'fineprint email-request-timer';
  form.append(feedback, timer);

  let ticking = false;
  function render() {
    const { busy, limited, seconds } = policy.state(operation);
    ticking = seconds > 0;
    button.disabled = busy || ticking;
    button.textContent = busy ? limits[operation].loading : label;
    form.setAttribute('aria-busy', String(busy));
    timer.textContent = seconds
      ? (limited ? 'Limite de solicitações atingido. ' + limitMessage + ' ' : '') + 'Tente novamente em ' + seconds + ' s.'
      : '';
    if (busy) feedback.textContent = limits[operation].loading;
    else if (feedback.textContent === limits[operation].loading) feedback.textContent = '';
  }
  policy.observe(render);
  window.addEventListener('storage', render);
  setInterval(() => { if (ticking) render(); }, 1000);
  render();

  return async (task, fallbackMessage) => {
    let result;
    try { result = await policy.run(operation, task); }
    catch { result = { kind: 'connection' }; }
    feedback.textContent = result.message || ({
      limit: 'Limite de solicitações atingido. ' + limitMessage,
      cooldown: 'Aguarde antes de solicitar outro link.',
      busy: 'Já existe uma solicitação em andamento.',
      connection: connectionMessage,
    }[result.kind] || fallbackMessage);
    return result;
  };
}
