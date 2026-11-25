export async function readAssurance(auth) {
  try {
    const { data, error } = await auth.getSession();
    if (error) throw error;
    const session = data?.session;
    if (!session) return { state: 'signed-out' };

    // Passing the current JWT makes the SDK check factors against Auth
    // rather than rely on the factor list cached in the browser session.
    const { data: assurance, error: assuranceError } = await auth.mfa.getAuthenticatorAssuranceLevel(session.access_token);
    if (assuranceError) throw assuranceError;
    if (assurance?.currentLevel === 'aal2') return { state: 'ready', session, level: 'aal2' };
    if (assurance?.currentLevel === 'aal1') {
      if (assurance.nextLevel === 'aal1') return { state: 'ready', session, level: 'aal1' };
      if (assurance.nextLevel === 'aal2') return { state: 'challenge', userId: session.user.id };
    }
  } catch {
    // Network and session errors must not authorize account access.
  }
  return { state: 'unavailable' };
}

const factorSlots = ['Autenticador 1', 'Autenticador 2', 'Autenticador 3'];
const factorLimitMessage = 'Você atingiu o limite de 3 autenticadores. Remova um antes de adicionar outro.';

function availableFactorName(names) {
  const occupied = new Set(names.values());
  return factorSlots.find(name => !occupied.has(name));
}

function factorNames(factors) {
  const names = new Map(factors.filter(factor => factor.friendly_name)
    .map(factor => [factor.id, factor.friendly_name]));
  for (const factor of factors) {
    if (factor.factor_type === 'totp' && !names.has(factor.id)) {
      names.set(factor.id, availableFactorName(names) || 'Autenticador');
    }
  }
  return names;
}

const messageFor = error => {
  switch (error?.code) {
    case 'mfa_challenge_expired':
    case 'mfa_verification_failed':
      return 'Código incorreto, expirado ou já usado. Confira o código atual no aplicativo.';
    case 'too_many_enrolled_mfa_factors':
      return factorLimitMessage;
    case 'mfa_factor_name_conflict':
      return 'Outro cadastro já usou esse nome. A lista foi atualizada. Tente adicionar novamente.';
    case 'mfa_factor_not_found':
      return 'Esse autenticador não está mais disponível. Atualize a lista e tente novamente.';
    case 'mfa_totp_enroll_not_enabled':
      return 'O cadastro de autenticadores TOTP está indisponível. Fale com o suporte.';
    case 'insufficient_aal':
      return 'Confirme sua identidade com um autenticador e tente novamente.';
    case 'session_not_found':
    case 'session_expired':
      return 'Sua sessão expirou. Saia e entre novamente para continuar.';
    default:
      return error?.status === 429
        ? 'Muitas tentativas. Aguarde antes de tentar novamente.'
        : 'Não foi possível concluir a verificação. Confira a conexão e tente novamente.';
  }
};

const readCode = input => input.value.trim().replace(/\s/g, '');
const validCode = code => /^\d{6}$/.test(code);
function setFactors(select, factors, names) {
  select.replaceChildren(...factors.map(factor => new Option(names.get(factor.id), factor.id)));
}

export function setupMfaChallenge(panel) {
  const modal = panel.closest('.modal');
  const form = panel.querySelector('form');
  const factor = panel.querySelector('select');
  const input = form.querySelector('input');
  const status = panel.querySelector('[role="status"]');
  const retry = panel.querySelector('[data-mfa-retry]');
  const cancel = panel.querySelector('[data-mfa-cancel]');
  let active;
  let busy = false;

  function close(auth) {
    if (!active || (auth && active.auth !== auth)) return;
    active = null;
    input.value = '';
    factor.replaceChildren();
    status.textContent = '';
    modal.classList.remove('mfa-open');
    panel.hidden = true;
  }

  async function run(action, loading) {
    if (busy || !active) return;
    const context = active;
    busy = true;
    panel.querySelectorAll('button, input, select').forEach(element => { element.disabled = true; });
    status.textContent = loading;
    try {
      await action(context);
    } catch (error) {
      if (active === context) status.textContent = messageFor(error);
    } finally {
      busy = false;
      panel.querySelectorAll('button, input, select').forEach(element => { element.disabled = false; });
      if (active !== context && active?.userId && form.hidden) loadFactors();
    }
  }

  async function load(context) {
    const { data, error } = await context.auth.mfa.listFactors();
    if (active !== context) return;
    if (error) throw error;
    setFactors(factor, data.totp, factorNames(data.all));
    form.hidden = !data.totp.length;
    retry.hidden = Boolean(data.totp.length);
    status.textContent = data.totp.length ? '' : 'Nenhum autenticador TOTP disponível. Se você perdeu o acesso, fale com o suporte.';
  }

  async function loadFactors() {
    await run(load, 'Consultando seus autenticadores…');
    if (active && !form.hidden) input.focus();
  }

  retry.onclick = () => run(async context => {
    await context.retry();
    if (active === context && context.userId) await load(context);
  }, 'Consultando o Supabase…');
  cancel.onclick = () => run(context => context.cancel(), 'Encerrando a verificação…');
  form.onsubmit = event => {
    event.preventDefault();
    const code = readCode(input);
    if (!validCode(code)) {
      status.textContent = 'Informe os seis dígitos do aplicativo.';
      return;
    }
    run(async context => {
      const { error } = await context.auth.mfa.challengeAndVerify({ factorId: factor.value, code });
      input.value = '';
      if (error) throw error;
      if (active === context) {
        await context.verified();
        if (active === context) status.textContent = 'A sessão ainda não foi confirmada. Tente novamente.';
      }
    }, 'Verificando o código…');
  };

  return {
    close,
    isOpen: () => Boolean(active),
    show(context) {
      if (active?.auth === context.auth && active.userId === context.userId) return;
      active = context;
      input.value = '';
      factor.replaceChildren();
      form.hidden = true;
      retry.hidden = false;
      panel.hidden = false;
      modal.classList.add('open', 'mfa-open');
      panel.querySelector('h3').focus();
      if (context.userId) {
        if (busy) status.textContent = 'Consultando seus autenticadores…';
        else loadFactors();
      } else status.textContent = 'Não foi possível verificar a segurança da sessão. Tente novamente.';
    },
  };
}

export function setupMfaSettings({ auth, panel, toggle, refresh }) {
  const list = panel.querySelector('ul');
  const add = panel.querySelector('[data-mfa-add]');
  const form = panel.querySelector('form');
  const heading = form.querySelector('h4');
  const qr = form.querySelector('img');
  const secret = form.querySelector('[data-mfa-secret]');
  const setup = form.querySelector('[data-mfa-setup]');
  const selector = form.querySelector('[data-mfa-factor]');
  const select = selector.querySelector('select');
  const input = form.querySelector('input');
  const status = panel.querySelector('[role="status"]');
  let busy = false;
  let owner;
  let action;

  function clearAction() {
    action = null;
    list.hidden = false;
    form.hidden = true;
    qr.removeAttribute('src');
    secret.textContent = '';
    input.value = '';
    select.replaceChildren();
  }

  function close() {
    owner = null;
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    list.replaceChildren();
    status.textContent = '';
    add.hidden = true;
    clearAction();
  }

  async function run(task) {
    if (busy || !owner) return;
    const userId = owner;
    busy = true;
    status.textContent = 'Aguarde…';
    panel.inert = true;
    try {
      const assurance = await readAssurance(auth);
      if (owner !== userId) return;
      if (assurance.state !== 'ready' || assurance.session.user.id !== userId) {
        close();
        await refresh();
        return;
      }
      await task(assurance.level, () => owner === userId);
    } catch (error) {
      if (owner === userId) status.textContent = messageFor(error);
    } finally {
      panel.inert = false;
      busy = false;
    }
  }

  async function load(level, isCurrent, message = '', limitReached) {
    const { data, error } = await auth.mfa.listFactors();
    if (!isCurrent()) return;
    if (error) throw error;
    renderFactors(data.all, message, limitReached);
  }

  function renderFactors(all, message = '', limitReached = all.length >= factorSlots.length) {
    const names = factorNames(all);
    const factors = all.filter(f => f.factor_type === 'totp')
      .sort((a, b) => names.get(a.id).localeCompare(names.get(b.id), 'pt-BR', { numeric: true }));
    const verified = factors.filter(f => f.status === 'verified');
    const rows = factors.map(factor => {
      const item = document.createElement('li');
      const name = names.get(factor.id);
      const isVerified = factor.status === 'verified';
      const label = document.createElement('span');
      label.textContent = name + (isVerified ? ' · Verificado' : ' · Pendente');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'text-action';
      button.textContent = isVerified ? 'Remover' : 'Excluir pendente';
      button.setAttribute('aria-label', button.textContent + ': ' + name);
      button.onclick = () => {
        clearAction();
        if (isVerified) {
          action = { type: 'remove', id: factor.id };
          list.hidden = true;
          add.hidden = true;
          heading.textContent = 'Confirme a remoção de ' + name;
          status.textContent = verified.length === 1 ? 'Ao remover o último autenticador, a autenticação de dois fatores será desativada.' : '';
          setFactors(select, verified.length > 1 ? verified.filter(item => item.id !== factor.id) : verified, names);
          setup.hidden = true;
          selector.hidden = false;
          form.hidden = false;
          input.focus();
        } else run(async (currentLevel, current) => {
          const { error: removeError } = await auth.mfa.unenroll({ factorId: factor.id });
          if (removeError) throw removeError;
          await load(currentLevel, current, 'Configuração pendente excluída.');
        });
      };
      item.append(label, button);
      return item;
    });
    list.replaceChildren(...rows);
    add.hidden = false;
    add.disabled = limitReached;
    status.textContent = [message, limitReached ? factorLimitMessage : ''].filter(Boolean).join(' ')
      || (factors.length ? 'Guarde um autenticador de reserva em outro dispositivo.' : 'Nenhum autenticador configurado.');
  }

  add.onclick = () => run(async (level, isCurrent) => {
    if (action || add.disabled) return;
    let enrolled;
    for (let attempt = 0; attempt <= factorSlots.length; attempt++) {
      const { data: factors, error: listError } = await auth.mfa.listFactors();
      if (!isCurrent()) return;
      if (listError) throw listError;
      if (factors.all.length >= factorSlots.length) {
        renderFactors(factors.all);
        return;
      }
      if (attempt === factorSlots.length) {
        renderFactors(factors.all, messageFor({ code: 'mfa_factor_name_conflict' }));
        return;
      }
      const friendlyName = availableFactorName(factorNames(factors.all));
      const { data, error } = await auth.mfa.enroll({ factorType: 'totp', issuer: 'Empório Milão', friendlyName });
      if (!isCurrent()) return;
      if (error?.code === 'mfa_factor_name_conflict') continue;
      if (error?.code === 'too_many_enrolled_mfa_factors') {
        renderFactors(factors.all, '', true);
        await load(level, isCurrent, '', true);
        return;
      }
      if (error) throw error;
      enrolled = data;
      break;
    }
    action = { type: 'enroll', id: enrolled.id };
    list.hidden = true;
    heading.textContent = 'Configure o autenticador';
    if (enrolled.totp.qr_code.startsWith('data:image/svg+xml;utf-8,')) qr.src = enrolled.totp.qr_code;
    secret.textContent = enrolled.totp.secret;
    setup.hidden = false;
    selector.hidden = true;
    form.hidden = false;
    add.hidden = true;
    status.textContent = 'Configuração pendente até confirmar o primeiro código.';
  }).then(() => { if (action?.type === 'enroll') heading.focus(); });

  form.querySelector('[data-mfa-cancel]').onclick = () => run(async (level, isCurrent) => {
    if (action?.type === 'enroll') {
      const { error } = await auth.mfa.unenroll({ factorId: action.id });
      if (error && error.code !== 'mfa_factor_not_found') throw error;
    }
    clearAction();
    await load(level, isCurrent);
  });

  form.onsubmit = event => {
    event.preventDefault();
    const code = readCode(input);
    if (!validCode(code)) {
      status.textContent = 'Informe os seis dígitos do aplicativo.';
      return;
    }
    run(async (level, isCurrent) => {
      if (!action) return;
      const { id, type } = action;
      const { error } = await auth.mfa.challengeAndVerify({ factorId: type === 'remove' ? select.value : id, code });
      input.value = '';
      if (error) throw error;
      if (!isCurrent()) return;
      if (type === 'remove') {
        const { error: removalError } = await auth.mfa.unenroll({ factorId: id });
        if (removalError) throw removalError;
        if (!isCurrent()) return;
        clearAction();
        // Auth may downgrade sessions associated with the removed factor.
        const { error: refreshError } = await auth.refreshSession();
        if (refreshError) {
          if (isCurrent()) status.textContent = 'Autenticador removido. Saia e entre novamente para atualizar a sessão.';
          return;
        }
      }
      if (!isCurrent()) return;
      clearAction();
      await load(level, isCurrent, type === 'remove' ? 'Autenticador removido.' : 'Autenticador verificado com sucesso.');
      await refresh();
    });
  };

  return {
    close,
    retain(userId) { if (owner && owner !== userId) close(); },
    open(userId) {
      if (owner) return close();
      if (busy) return;
      owner = userId;
      toggle.setAttribute('aria-expanded', 'true');
      panel.hidden = false;
      run(load);
    },
  };
}
