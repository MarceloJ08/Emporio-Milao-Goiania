import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { bindSignup, confirmationLinkState } from '../src/js/signup.mjs';

const origin = 'https://loja.example.test';
const email = 'cliente@example.test';
const password = 'Senha fictícia 7!';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const selectors = [
  '[autocomplete="name"]', '[type="email"]', '[autocomplete="new-password"]',
  '[type="submit"]', '[data-signup-resend]', '[data-signup-status]',
];

function setup(auth = {}) {
  const calls = [];
  const forms = ['registerForm', 'modalRegisterForm'].map(id => {
    const markup = html.match(new RegExp(`<form[^>]*id="${id}"[^>]*>[\\s\\S]*?</form>`))[0];
    const fields = Object.fromEntries(selectors.map(selector => {
      assert.ok(markup.includes(selector.slice(1, -1)), selector);
      return [selector, { focus() { this.focused = true; } }];
    }));
    const [name, address, secret, submit, resend, status] = selectors.map(key => fields[key]);
    name.value = "  Érica D'Ávila-Souza  ";
    address.value = ` ${email} `;
    secret.value = password;
    const form = { querySelector: key => fields[key] };
    return { form, name, address, secret, submit, resend, status,
      send: () => form.onsubmit({ preventDefault() {} }) };
  });
  const creating = bindSignup({
    auth: {
      signUp: async args => { calls.push(args); return { data: { session: null } }; },
      resend: async args => { calls.push(args); return { data: {} }; },
      ...auth,
    },
    forms: forms.map(({ form }) => form),
    origin,
  });
  return { forms, calls, creating };
}

test('os dois formulários informam os mesmos requisitos e não expõem campos em um GET sem JavaScript', () => {
  const labels = ['registerPassword', 'modalRegisterPassword'].map(id =>
    html.match(new RegExp(`<label for="${id}">([^<]+)</label>`))[1]);
  assert.equal(labels[0], labels[1]);
  for (const id of ['registerForm', 'modalRegisterForm']) {
    const form = html.match(new RegExp(`<form[^>]*id="${id}"[^>]*>[\\s\\S]*?</form>`))[0];
    assert.doesNotMatch(form, /<input[^>]+\sname=/);
    assert.match(form, /maxlength="120"/);
    assert.match(form, /maxlength="254"/);
    assert.match(form, /href="\/privacidade-cadastro.html"/);
  }
});

for (const index of [0, 1]) {
  test(`formulário ${index + 1} envia cadastro válido sem papel ou permissão no payload`, async () => {
    const { forms, calls } = setup();
    const form = forms[index];
    await form.send();
    assert.deepEqual(calls, [{
      email, password, options: { emailRedirectTo: `${origin}/?cadastro=confirmacao`, data: { full_name: "Érica D'Ávila-Souza" } },
    }]);
    assert.match(form.status.textContent, /^Se for possível/);
    assert.equal(form.secret.value, '');
  });
}

for (const [field, value, message] of [
  ['name', '   ', /nome/],
  ['name', 'x'.repeat(121), /120/],
  ['address', 'email-invalido', /e-mail válido/],
  ['address', `${'a'.repeat(247)}@example.test`, /e-mail válido/],
  ['secret', 'Curta7!', /12 caracteres/],
  ['secret', 'Longa sem símbolo 7', /símbolo/],
  ['secret', `Aa7!${'é'.repeat(35)}`, /72 bytes/],
]) {
  test(`validação local rejeita ${field} inválido: ${message}`, async () => {
    const { forms, calls } = setup();
    for (const form of forms) {
      form[field].value = value;
      await form.send();
      assert.match(form.status.textContent, message);
      assert.equal(form[field].focused, true);
    }
    assert.equal(calls.length, 0);
  });
}

test('aceita 72 bytes e preserva espaços na senha', async () => {
  const { forms: [form], calls } = setup();
  const longPassword = ` Aa7!${'y'.repeat(66)} `;
  form.secret.value = longPassword;
  await form.send();
  assert.equal(calls[0].password, longPassword);
  assert.equal(new TextEncoder().encode(calls[0].password).length, 72);
});

test('resposta pública de duplicidade é igual à resposta de envio', async () => {
  const { forms: [normal] } = setup();
  const { forms: [duplicate] } = setup({ signUp: async () => ({ error: { code: 'user_already_exists' } }) });
  await normal.send();
  await duplicate.send();
  assert.equal(duplicate.status.textContent, normal.status.textContent);
});

test('diferencia senha vazada, limite e falha operacional', async () => {
  for (const [error, message] of [
    [{ code: 'weak_password', reasons: ['pwned'] }, /vazamentos conhecidos/],
    [{ code: 'weak_password', reasons: ['length'] }, /senha foi recusada/],
    [{ code: 'over_email_send_rate_limit', status: 429 }, /Aguarde/],
    [{ status: 500 }, /Não foi possível processar/],
  ]) {
    const { forms: [form] } = setup({ signUp: async () => ({ error }) });
    await form.send();
    assert.match(form.status.textContent, message);
  }
});

test('bloqueia outro envio durante cadastro e desfaz sessão inesperada', async () => {
  let resolve;
  const signedOut = [];
  let submissions = 0;
  const { forms: [first, second], creating, calls } = setup({
    signUp: () => { submissions++; return new Promise(done => { resolve = done; }); },
    signOut: options => { signedOut.push(options); },
  });
  const completion = first.send();
  assert.equal(creating(), true);
  assert.equal(first.submit.disabled, true);
  await second.send();
  await second.resend.onclick();
  assert.equal(submissions, 1);
  assert.equal(calls.length, 0);
  resolve({ data: { session: {} } });
  await completion;
  assert.equal(creating(), false);
  assert.deepEqual(signedOut, [{ scope: 'local' }]);
  assert.match(first.status.textContent, /Não foi possível exigir a confirmação/);
  assert.equal(first.submit.disabled, false);
});

test('reenvio usa apenas o e-mail e o retorno do cadastro', async () => {
  const { forms: [form], calls } = setup();
  await form.resend.onclick();
  assert.deepEqual(calls, [{ type: 'signup', email, options: { emailRedirectTo: `${origin}/?cadastro=confirmacao` } }]);
  assert.match(form.status.textContent, /^Se for possível/);
});

test('interpreta retornos inválidos, expirados e candidatos a confirmação', () => {
  const redirect = `${origin}/?cadastro=confirmacao`;
  assert.equal(confirmationLinkState(new URL(origin)), null);
  assert.match(confirmationLinkState(new URL(redirect)), /Não foi possível validar/);
  assert.match(confirmationLinkState(new URL(redirect + '#error_code=otp_expired')), /expirou/);
  assert.match(confirmationLinkState(new URL(redirect + '&error_code=access_denied')), /Não foi possível validar/);
  assert.equal(confirmationLinkState(new URL(redirect + '#type=signup&access_token=ficticio')), '');
});
