import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { bindPasswordForm, exchangeRecoveryLink, recoveryStorage } from '../src/js/password.mjs';

const newPassword = 'Nova senha 7!';
const oldPassword = ' senha atual fictícia ';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function setup({ recovery = false, response = () => ({}), reauth = {} } = {}) {
  const calls = [];
  const field = value => ({ value, focus() {} });
  const current = recovery ? null : field(oldPassword);
  const password = field(newPassword), confirm = recovery ? field(newPassword) : null;
  const nonce = field(''), send = {}, submit = {}, status = {};
  const challenge = {
    hidden: true,
    querySelector: key => key === 'button' ? send : nonce,
  };
  const selectors = {
    '[autocomplete="current-password"]': current,
    '[autocomplete="new-password"]': password,
    '[data-password-confirm]': confirm,
    '[data-password-challenge]': challenge,
    '[type="submit"]': submit,
    '[role="status"]': status,
  };
  const form = {
    querySelector: key => selectors[key],
    reset() {
      for (const input of [current, password, confirm, nonce].filter(Boolean)) input.value = '';
    },
  };
  let available = true;
  const auth = {
    updateUser: async args => { calls.push(args); return response(args); },
    reauthenticate: async () => { calls.push('reauthenticate'); return reauth; },
  };
  const reset = bindPasswordForm(form, {
    recovery,
    getAuth: () => available ? auth : null,
    onSuccess: () => calls.push('success'),
  });
  return { calls, current, password, confirm, nonce, send, status, challenge, reset,
    submit: () => form.onsubmit({ preventDefault() {} }),
    expire: () => { available = false; },
  };
}

test('a senha atual só é solicitada no formulário de alteração', () => {
  const form = id => html.match(new RegExp(`<form id="${id}"[^>]*>[\\s\\S]*?</form>`))[0];
  assert.match(form('passwordForm'), /autocomplete="current-password" required/);
  assert.doesNotMatch(form('setNewPasswordForm'), /autocomplete="current-password"/);
  for (const id of ['passwordForm', 'setNewPasswordForm']) {
    assert.match(form(id), /autocomplete="one-time-code"/);
    assert.doesNotMatch(form(id), /<input[^>]+\sname=/);
  }
});

test('sessão recente envia a senha atual e não solicita código', async () => {
  const flow = setup();
  await flow.submit();
  assert.deepEqual(flow.calls, [{ password: newPassword, current_password: oldPassword }, 'success']);
  assert.equal(flow.current.value, '');
});

test('sessão antiga solicita um código e envia nonce junto com a senha atual', async () => {
  const flow = setup({
    response: args => args.nonce ? {} : { error: { code: 'reauthentication_needed' } },
  });
  await flow.submit();
  assert.equal(flow.challenge.hidden, false);
  assert.equal(flow.calls.length, 1);
  await flow.submit();
  assert.equal(flow.calls.length, 1);
  await flow.send.onclick();
  flow.nonce.value = ' 012345 ';
  await flow.submit();
  assert.deepEqual(flow.calls, [
    { password: newPassword, current_password: oldPassword }, 'reauthenticate',
    { password: newPassword, current_password: oldPassword, nonce: '012345' }, 'success',
  ]);
  assert.equal(flow.challenge.hidden, true);
});

test('recuperação envia só a nova senha e valida a confirmação', async () => {
  const flow = setup({ recovery: true });
  flow.confirm.value = 'diferente';
  await flow.submit();
  assert.match(flow.status.textContent, /não coincidem/);
  flow.confirm.value = newPassword;
  await flow.submit();
  assert.deepEqual(flow.calls, [{ password: newPassword }, 'success']);
});

test('a atualização exige contexto de sessão, senha atual na troca e nova senha válida', async () => {
  const flow = setup();
  flow.current.value = '';
  await flow.submit();
  assert.match(flow.status.textContent, /senha atual/);
  flow.current.value = oldPassword;
  flow.password.value = 'x';
  await flow.submit();
  assert.match(flow.status.textContent, /12 caracteres/);
  assert.deepEqual(flow.calls, []);
  const recovery = setup({ recovery: true });
  recovery.expire();
  await recovery.submit();
  assert.match(recovery.status.textContent, /novo link/);
  assert.deepEqual(recovery.calls, []);
});

test('erros reconhecidos são tratados sem exibir a mensagem bruta', async () => {
  for (const [code, expected] of [
    ['current_password_required', /senha atual/], ['current_password_mismatch', /incorreta/],
    ['reauthentication_not_valid', /Código inválido ou expirado/], ['same_password', /diferente/],
    ['weak_password', /vazamentos/], ['session_expired', /sessão expirou/],
    ['insufficient_aal', /dois fatores/], ['unknown', /Não foi possível atualizar/],
  ]) {
    const flow = setup({ response: () => ({ error: { code, reasons: ['pwned'], message: 'detalhe interno' } }) });
    await flow.submit();
    assert.match(flow.status.textContent, expected);
    assert.doesNotMatch(flow.status.textContent, /detalhe interno/);
  }
  const mismatch = setup({ recovery: true, response: () => ({ error: { code: 'current_password_required' } }) });
  await mismatch.submit();
  assert.match(mismatch.status.textContent, /novo link/);
  const limited = setup({ reauth: { error: { status: 429 } } });
  await limited.send.onclick();
  assert.match(limited.status.textContent, /Aguarde/);
});

test('callback só aceita troca de código do tipo recovery com sessão', async () => {
  const auth = { exchangeCodeForSession: async () => ({ data: { redirectType: 'recovery', session: {} } }) };
  assert.deepEqual(await exchangeRecoveryLink(auth, 'teste'), {});
  assert.equal(await exchangeRecoveryLink(auth, null), null);
  assert.equal(await exchangeRecoveryLink({ exchangeCodeForSession: async () => ({ error: {} }) }, 'teste'), null);
  assert.equal(await exchangeRecoveryLink({
    exchangeCodeForSession: async () => ({ data: { redirectType: 'signup', session: {} } }),
  }, 'teste'), null);
});

test('verificador PKCE sobrevive à navegação e a sessão fica em memória', () => {
  const disk = new Map();
  const browserStorage = { getItem: key => disk.get(key), setItem: (key, value) => disk.set(key, value), removeItem: key => disk.delete(key) };
  const initial = recoveryStorage(browserStorage, 'recovery');
  initial.setItem('recovery-code-verifier', 'verificador');
  initial.setItem('recovery', 'sessão');
  const next = recoveryStorage(browserStorage, 'recovery');
  assert.equal(next.getItem('recovery-code-verifier'), 'verificador');
  assert.equal(next.getItem('recovery'), null);
  assert.equal(disk.has('recovery'), false);
});
