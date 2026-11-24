import assert from 'node:assert/strict';
import test from 'node:test';
import { confirmRecoveryToken, readRecoveryReturn, stagingAuthProject } from '../src/js/password.mjs';

const origin = 'https://staging.example.test';
const callback = origin + '/?senha=recuperar';
const staging = {
  origin, supabaseUrl: 'https://uzldbiahraeqnhzxqfoz.supabase.co', publishableKey: 'sb_publishable_ficticia',
};

test('experimento exige origem exata, chave pública e Supabase separado', () => {
  assert.equal(stagingAuthProject(null, origin), null);
  assert.deepEqual(stagingAuthProject(staging, origin), [staging.supabaseUrl, staging.publishableKey]);
  assert.equal(stagingAuthProject(staging, 'https://outro.example.test'), null);
  assert.equal(stagingAuthProject({ ...staging, supabaseUrl: 'https://wrong-project.supabase.co' }, origin), null);
  const published = 'https://emporio-milao-goiania.vercel.app';
  assert.equal(stagingAuthProject({ ...staging, origin: published }, published), null);
  assert.equal(stagingAuthProject({ ...staging, publishableKey: 'privada' }, origin), null);
});

test('reconhece o fragmento de recuperação e preserva o retorno PKCE existente', () => {
  assert.deepEqual(readRecoveryReturn(new URL(callback + '#token_hash=ficticio&type=signup')), {
    kind: 'token', token: 'ficticio',
  });
  assert.deepEqual(readRecoveryReturn(new URL(callback + '&code=ficticio')), { kind: 'pkce', code: 'ficticio' });
  assert.equal(readRecoveryReturn(new URL(origin + '/?cadastro=confirmacao#token_hash=ficticio')), null);
  for (const suffix of [
    '&token_hash=ficticio', '#token_hash=', '#token_hash=a&token_hash=b',
    '&code=ficticio#token_hash=ficticio', '#token_hash=ficticio&access_token=ficticio',
  ]) assert.deepEqual(readRecoveryReturn(new URL(callback + suffix)), { kind: 'token', token: null });
});

test('não verifica na abertura e consome no máximo uma vez, com tipo recovery fixo', async () => {
  const calls = [];
  const auth = { verifyOtp: async args => { calls.push(args); return { data: { session: { user: { id: 'teste' } } } }; } };
  const confirm = confirmRecoveryToken('ficticio', () => auth);
  assert.deepEqual(calls, []);
  const [first, second] = await Promise.all([confirm(), confirm()]);
  assert.equal(first, auth);
  assert.equal(second, null);
  assert.deepEqual(calls, [{ token_hash: 'ficticio', type: 'recovery' }]);
});

test('links recusados, reutilizados, expirados ou sem sessão não liberam a redefinição', async () => {
  for (const error of ['otp_expired', 'validation_failed', 'otp_expired']) {
    const confirm = confirmRecoveryToken('ficticio', () => ({ verifyOtp: async () => ({ error: { code: error } }) }));
    assert.equal(await confirm(), null);
  }
  assert.equal(await confirmRecoveryToken('ficticio', () => ({ verifyOtp: async () => ({ data: {} }) }))(), null);
  assert.equal(await confirmRecoveryToken('ficticio', () => { throw new Error('SDK unavailable'); })(), null);
});
