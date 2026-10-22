const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, sign, createHash } = require('node:crypto');
const { mkdtemp, rm, readFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { authorization, validateIDToken, AuthManager } = require('../src/auth.cjs');
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwks = { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'test-key', use: 'sig' }] };
function jwt(overrides = {}) {
  const head = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ iss: 'https://auth.openai.com', sub: 'synthetic-user', aud: 'oaiapp_test', nonce: 'test-nonce', exp: Date.now() / 1000 + 3600, email: 'reader@example.test', ...overrides })).toString('base64url');
  return `${head}.${body}.${sign('RSA-SHA256', Buffer.from(`${head}.${body}`), privateKey).toString('base64url')}`;
}
test('OIDC rejects tampering, wrong nonce, issuer, audience and expiry', () => {
  const opts = { clientId: 'oaiapp_test', nonce: 'test-nonce', jwks };
  assert.equal(validateIDToken(jwt(), opts).subject, 'synthetic-user');
  for (const patch of [{ iss: 'https://invalid.example' }, { aud: 'other' }, { nonce: 'other' }, { exp: 1 }, { aud: ['oaiapp_test', 'other'], azp: 'other' }]) assert.throws(() => validateIDToken(jwt(patch), opts));
  const broken = jwt().split('.'); broken[1] = Buffer.from(JSON.stringify({ sub: 'attacker' })).toString('base64url');
  assert.throws(() => validateIDToken(broken.join('.'), opts));
});
test('dynamic registration sends PKCE and a stable host, returning login reuses issued client', () => {
  const input = { host: 'urn:uuid:synthetic', redirect: 'http://127.0.0.1:4000/auth/callback', state: 'state', nonce: 'nonce', verifier: 'verifier' };
  const first = new URL(authorization(input));
  assert.equal(first.searchParams.get('client_id'), 'dynamic_agent_client');
  assert.equal(first.searchParams.get('agent_name_hint'), 'Aftertaste');
  assert.equal(first.searchParams.get('code_challenge'), createHash('sha256').update('verifier').digest('base64url'));
  assert.match(first.searchParams.get('scope'), /chatgpt.tokens.use.direct/);
  const again = new URL(authorization({ ...input, account: { client_id: 'oaiapp_saved', tokens: { id_token: 'synthetic-id-hint' } } }));
  assert.equal(again.searchParams.get('client_id'), 'oaiapp_saved');
  assert.equal(again.searchParams.has('agent_name_hint'), false);
});
test('callback validates state, uses issued client and exact redirect, persists only encrypted credentials, refreshes once', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aftertaste-auth-test-')); t.after(() => rm(root, { recursive: true, force: true }));
  let nonce, redirect, refreshes = 0, requestedGrant;
  const codec = { encrypt: async v => Buffer.from(v).map(x => x ^ 171), decrypt: async b => Buffer.from(b).map(x => x ^ 171).toString() };
  const fetcher = async (url, opts) => {
    if (url.endsWith('jwks.json')) return Response.json(jwks);
    const p = opts.body;
    if (p.get('grant_type') === 'refresh_token') { refreshes++; return Response.json({ access_token: 'synthetic-rotated', refresh_token: 'synthetic-new-refresh', token_type: 'Bearer', expires_in: 3600 }); }
    requestedGrant = Object.fromEntries(p); assert.equal(p.get('redirect_uri'), redirect);
    return Response.json({ access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', id_token: jwt({ nonce }), scope: 'openid chatgpt.tokens.use.direct', token_type: 'Bearer', expires_in: 0 });
  };
  const auth = new AuthManager({ root, codec, fetcher, openBrowser: async url => {
    const u = new URL(url); nonce = u.searchParams.get('nonce'); redirect = u.searchParams.get('redirect_uri');
    const wrong = new URL(redirect); wrong.searchParams.set('state', 'wrong');
    assert.equal((await fetch(wrong)).status, 400);
    const callback = new URL(redirect); callback.search = new URLSearchParams({ state: u.searchParams.get('state'), code: 'synthetic-code', client_id: 'oaiapp_test' });
    assert.equal((await fetch(callback)).status, 200);
  } });
  await auth.init(); const host = auth.host;
  const status = await auth.connect();
  assert.equal(requestedGrant.client_id, 'oaiapp_test'); assert.equal(status.connected, true); assert.equal(status.planEnabled, true);
  assert.equal(JSON.stringify(status).includes('synthetic-access'), false);
  const raw = await readFile(path.join(root, 'credentials.enc')); assert.equal(raw.toString().includes('synthetic-access'), false);
  const [a, b] = await Promise.all([auth.access(), auth.access()]); assert.equal(a, 'synthetic-rotated'); assert.equal(a, b); assert.equal(refreshes, 1);
  const restarted = new AuthManager({ root, codec }); await restarted.init(); assert.equal(restarted.host, host); assert.equal(restarted.status().email, 'reader@example.test');
});
