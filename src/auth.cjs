const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs/promises');
const { randomBytes, randomUUID, createHash, createPublicKey, verify, timingSafeEqual } = require('node:crypto');
const { atomicWrite, readJSON, accountKey } = require('./storage.cjs');

const ISSUER = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
const TOKEN_ENDPOINT = `${ISSUER}/api/accounts/oauth/token`;
const PLAN_SCOPE = 'chatgpt.tokens.use.direct';
const SCOPES = `openid profile email offline_access resource.invoke ${PLAN_SCOPE}`;
const USAGE_URL = 'https://chatgpt.com/#settings/Usage';
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const random = () => randomBytes(32).toString('base64url');
function authorization({ host, redirect, state, nonce, verifier, account }) {
  const params = new URLSearchParams({
    client_id: account?.client_id || 'dynamic_agent_client', ext_agent_host_id: host,
    response_type: 'code', redirect_uri: redirect, scope: SCOPES, resource: RESOURCE,
    state, nonce, code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url')
  });
  if (account) {
    if (account.tokens?.id_token) params.set('id_token_hint', account.tokens.id_token);
    if (account.email) params.set('login_hint', account.email);
  } else params.set('agent_name_hint', 'Aftertaste');
  return `${ISSUER}/api/accounts/authorize?${params}`;
}
function validateIDToken(jwt, { clientId, nonce, jwks, now = Date.now() / 1000 }) {
  try {
    const segments = jwt.split('.');
    if (segments.length !== 3) throw new Error();
    const header = JSON.parse(Buffer.from(segments[0], 'base64url'));
    const body = JSON.parse(Buffer.from(segments[1], 'base64url'));
    if (header.alg !== 'RS256' || header.crit) throw new Error();
    const key = jwks.keys?.find(k => k.kid === header.kid && k.kty === 'RSA' && (!k.use || k.use === 'sig') && (!k.alg || k.alg === 'RS256'));
    if (!key || !verify('RSA-SHA256', Buffer.from(segments.slice(0, 2).join('.')), createPublicKey({ key, format: 'jwk' }), Buffer.from(segments[2], 'base64url'))) throw new Error();
    const audience = Array.isArray(body.aud) ? body.aud : [body.aud];
    if (body.iss !== ISSUER || !audience.includes(clientId) || (audience.length > 1 && body.azp !== clientId) || !Number.isFinite(body.exp) || body.exp <= now || (body.iat && body.iat > now + 60) || (body.nbf && body.nbf > now + 30) || !equal(body.nonce, nonce) || typeof body.sub !== 'string' || !body.sub) throw new Error();
    return { subject: body.sub, email: typeof body.email === 'string' ? body.email : '', name: typeof body.name === 'string' ? body.name : '' };
  } catch { throw new Error('ChatGPT identity could not be verified. Please sign in again.'); }
}
async function tokenRequest(params, fetcher = fetch) {
  const res = await fetcher(TOKEN_ENDPOINT, { method: 'POST', body: new URLSearchParams(params), signal: AbortSignal.timeout(30000) });
  if (!res.ok) {
    let code = ''; try { code = (await res.json()).error; } catch {}
    const error = new Error(code === 'invalid_grant' ? 'This ChatGPT session expired. Please sign in again.' : 'ChatGPT sign-in could not be completed. Please try again.');
    error.reauthorize = code === 'invalid_grant'; throw error;
  }
  const result = await res.json();
  if (!result.access_token || result.token_type?.toLowerCase() !== 'bearer' || !Number.isFinite(result.expires_in)) throw new Error('ChatGPT returned an incomplete session. Please sign in again.');
  return result;
}
class AuthManager {
  constructor({ root, codec, openBrowser, fetcher = fetch, changed = () => {} }) {
    Object.assign(this, { root, codec, openBrowser, fetcher, changed });
    this.data = { accounts: [], active: null }; this.refreshes = new Map(); this.writeQueue = Promise.resolve(); this.pending = null; this.locked = false;
  }
  async init() {
    const hostFile = path.join(this.root, 'host.json');
    const host = await readJSON(hostFile, null);
    this.host = host?.id || `urn:uuid:${randomUUID()}`;
    if (!host) await atomicWrite(hostFile, JSON.stringify({ id: this.host }));
    try { this.data = JSON.parse(await this.codec.decrypt(await fs.readFile(path.join(this.root, 'credentials.enc')))); }
    catch (e) { if (e.code !== 'ENOENT') { this.locked = true; throw new Error('Your saved ChatGPT connection could not be unlocked. Open the system keychain and restart Aftertaste.'); } }
  }
  save() {
    const run = this.writeQueue.then(async () => atomicWrite(path.join(this.root, 'credentials.enc'), await this.codec.encrypt(JSON.stringify(this.data))));
    this.writeQueue = run.catch(() => {}); return run;
  }
  current() { return this.data.accounts.find(a => a.key === this.data.active) || null; }
  libraryKey() { return this.current()?.key || 'local'; }
  status() {
    const active = this.current();
    return { active: active?.key || null, email: active?.email || '', connected: !!active?.tokens?.access_token, planEnabled: !!active?.tokens?.scopes?.includes(PLAN_SCOPE), welcome: !!active?.welcome,
      accounts: this.data.accounts.map(a => ({ key: a.key, email: a.email, label: a.label, connected: !!a.tokens?.access_token })), usageUrl: USAGE_URL };
  }
  async acknowledge() { const a = this.current(); if (a) { a.welcome = false; await this.save(); } return this.status(); }
  async select(key) {
    if (this.pending) throw new Error('Finish or cancel the current sign-in first.');
    if (key !== 'local' && !this.data.accounts.some(a => a.key === key)) throw new Error('Account not found.');
    this.data.active = key === 'local' ? null : key; await this.save(); this.changed(); return this.status();
  }
  async connect(key) {
    if (this.locked) throw new Error('Unlock your system keychain and restart Aftertaste before reconnecting.');
    if (this.pending) throw new Error('A sign-in window is already open.');
    const account = key && key !== 'new' ? this.data.accounts.find(a => a.key === key) : null;
    if (key && key !== 'new' && !account) throw new Error('Account not found.');
    const state = random(), nonce = random(), verifier = random();
    let finish, fail;
    const result = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
    // Install a rejection handler before opening the browser; errors still reach the caller below.
    result.catch(() => {});
    let consumed = false, cancelled = false;
    const server = http.createServer(async (req, res) => {
      res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      const url = new URL(req.url, 'http://127.0.0.1');
      if (req.method !== 'GET' || url.pathname !== '/auth/callback' || req.headers.host !== `127.0.0.1:${server.address()?.port}`) { res.writeHead(404).end('Not found.'); return; }
      if (!equal(url.searchParams.get('state'), state) || consumed) { res.writeHead(400).end('Invalid sign-in attempt. Return to Aftertaste.'); return; }
      consumed = true;
      try {
        if (url.searchParams.has('error')) throw new Error('ChatGPT sign-in was cancelled or declined.');
        const callbackClient = url.searchParams.get('client_id');
        const clientId = account?.client_id || callbackClient;
        if (!clientId || clientId === 'dynamic_agent_client' || clientId.length > 200 || (account && callbackClient && callbackClient !== account.client_id)) throw new Error('ChatGPT registration was incomplete. Please sign in again.');
        const code = url.searchParams.get('code');
        if (!code) throw new Error('The sign-in callback was incomplete.');
        const tokens = await tokenRequest({ grant_type: 'authorization_code', client_id: clientId, code, code_verifier: verifier, redirect_uri: redirect, resource: RESOURCE }, this.fetcher);
        const jwksRes = await this.fetcher(`${ISSUER}/.well-known/jwks.json`, { signal: AbortSignal.timeout(15000) });
        if (!jwksRes.ok) throw new Error('ChatGPT identity verification is unavailable.');
        const identity = validateIDToken(tokens.id_token, { clientId, nonce, jwks: await jwksRes.json() });
        if (account && identity.subject !== account.subject) throw new Error('This is a different ChatGPT account. Add it as a new account instead.');
        if (cancelled) throw new Error('Sign-in cancelled.');
        const key = accountKey({ client_id: clientId, subject: identity.subject });
        const existing = this.data.accounts.find(a => a.key === key);
        const record = { ...existing, ...identity, key, client_id: clientId, label: existing?.label || `Account ${this.data.accounts.length + 1}`, tokens: this.pack(tokens), welcome: existing?.welcomed ? false : true, welcomed: true };
        if (existing) this.data.accounts[this.data.accounts.indexOf(existing)] = record; else this.data.accounts.push(record);
        this.data.active = key; await this.save(); this.changed();
        res.end('Connected to Aftertaste. You can close this tab and return to the app.'); finish(this.status());
      } catch (e) { res.writeHead(400).end('Sign-in could not be completed. Return to Aftertaste for details.'); fail(e); }
      finally { server.close(); }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const redirect = `http://127.0.0.1:${server.address().port}/auth/callback`;
    const timer = setTimeout(() => { cancelled = true; fail(new Error('Sign-in timed out. Please try again.')); server.close(); }, 5 * 60 * 1000);
    timer.unref();
    this.pending = { cancel: () => { cancelled = true; fail(new Error('Sign-in cancelled.')); server.close(); } };
    try { await this.openBrowser(authorization({ host: this.host, redirect, state, nonce, verifier, account })); return await result; }
    finally { clearTimeout(timer); server.close(); this.pending = null; }
  }
  cancel() { this.pending?.cancel(); }
  pack(tokens, previous = {}) {
    return { access_token: tokens.access_token, refresh_token: tokens.refresh_token || previous.refresh_token, id_token: tokens.id_token || previous.id_token,
      scopes: typeof tokens.scope === 'string' ? tokens.scope.split(/\s+/) : previous.scopes || [], expires_at: Date.now() + tokens.expires_in * 1000 };
  }
  async access(key = this.libraryKey()) {
    const account = this.data.accounts.find(a => a.key === key);
    if (!account?.tokens?.access_token) throw new Error('Continue with ChatGPT to get recommendations.');
    if (!account.tokens.scopes.includes(PLAN_SCOPE)) throw new Error('ChatGPT plan usage was not enabled. Sign in again and review the permission.');
    if (account.tokens.expires_at > Date.now() + 60000) return account.tokens.access_token;
    if (this.refreshes.has(key)) return this.refreshes.get(key);
    const refreshing = (async () => {
      try {
        if (!account.tokens.refresh_token) throw Object.assign(new Error('Please sign in to ChatGPT again.'), { reauthorize: true });
        const tokens = await tokenRequest({ grant_type: 'refresh_token', client_id: account.client_id, refresh_token: account.tokens.refresh_token, resource: RESOURCE }, this.fetcher);
        account.tokens = this.pack(tokens, account.tokens); await this.save();
        if (!account.tokens.scopes.includes(PLAN_SCOPE)) throw new Error('ChatGPT plan usage is no longer enabled. Sign in again.');
        return account.tokens.access_token;
      } catch (e) { if (e.reauthorize) { account.tokens = null; await this.save(); this.changed(); } throw e; }
      finally { this.refreshes.delete(key); }
    })();
    this.refreshes.set(key, refreshing); return refreshing;
  }
  async disconnect() {
    this.cancel();
    const account = this.current(); let revoked = true;
    if (account?.tokens?.refresh_token) {
      revoked = false;
      try {
        const conf = await this.fetcher(`${ISSUER}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(10000) }).then(r => r.json());
        const endpoint = new URL(conf.revocation_endpoint);
        if (endpoint.origin !== ISSUER) throw new Error();
        for (let attempt = 0; attempt < 2; attempt++) {
          const res = await this.fetcher(endpoint, { method: 'POST', body: new URLSearchParams({ token: account.tokens.refresh_token, token_type_hint: 'refresh_token', client_id: account.client_id }), signal: AbortSignal.timeout(10000) });
          if (res.status === 200) { revoked = true; break; }
          if (res.status < 500) break;
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch {}
    }
    if (account) { account.tokens = null; await this.save(); }
    this.changed();
    return { ...this.status(), warning: revoked ? '' : 'Signed out locally. Remote revocation was not confirmed; disconnect Aftertaste in ChatGPT settings.' };
  }
}
module.exports = { AuthManager, authorization, validateIDToken, tokenRequest, PLAN_SCOPE, USAGE_URL, ISSUER };
