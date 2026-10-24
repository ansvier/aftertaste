const net = require('node:net');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes, randomUUID, createHash, timingSafeEqual } = require('node:crypto');
const { atomicWrite, readJSON } = require('./storage.cjs');
const { fingerprint } = require('./validation.cjs');
const { contextFor } = require('./inference.cjs');

const MAX_MESSAGE = 1024 * 1024;
function socketPath(root) {
  return process.platform === 'win32' ? `\\\\.\\pipe\\aftertaste-${createHash('sha256').update(root).digest('hex').slice(0, 24)}` : path.join(root, 'chat.sock');
}
function strictText(value, max, name) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`Invalid ${name}.`);
  return value.trim();
}
function requestId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(value)) throw new Error('Use a stable request ID of 8 to 100 letters, digits, underscores or hyphens.');
  return value;
}
function documents(input) {
  if (!Array.isArray(input) || !input.length || input.length > 40) throw new Error('Send 1 to 40 context documents.');
  const seen = new Set(); let size = 0;
  return input.map(s => {
    const key = strictText(s?.key, 100, 'document key');
    if (!/^[a-zA-Z0-9_-]+$/.test(key) || seen.has(key)) throw new Error('Document keys must be unique letters, digits, underscores or hyphens.');
    seen.add(key);
    const title = strictText(s.title, 200, 'document title'), body = strictText(s.body, 20000, 'document body');
    size += body.length; if (size > 100000) throw new Error('Send up to 100,000 characters per update.');
    return { key, title, body };
  });
}
class ChatBridge {
  constructor({ root, store, activeKey, assertIdle, runRecommendation, cancel, changed, version }) {
    Object.assign(this, { root, store, activeKey, assertIdle, runRecommendation, cancel, changed, version });
    this.config = { enabled: false }; this.jobs = []; this.queue = Promise.resolve(); this.connections = new Set();
  }
  async init() {
    this.config = await readJSON(path.join(this.root, 'chat-bridge.json'), { enabled: false });
    if (this.config.enabled && (!/^(local|[a-f0-9]{64})$/.test(this.config.accountKey) || !/^[a-f0-9]{64}$/.test(this.config.token))) throw new Error('The local chat connection needs to be enabled again.');
    this.jobs = await readJSON(path.join(this.root, 'chat-jobs.json'), []);
    for (const j of this.jobs) if (j.status === 'running') { j.status = 'interrupted'; j.error = 'Aftertaste stopped before this selection finished. Ask for a new selection to retry.'; }
    await this.saveJobs();
    if (this.config.enabled) await this.listen();
  }
  info() { return { enabled: !!this.config.enabled, paired: this.config.enabled && this.config.accountKey === this.activeKey(), accountKey: this.config.enabled ? this.config.accountKey : null }; }
  async setEnabled(enabled) {
    await this.close(); this.cancel();
    this.config = enabled ? { enabled: true, accountKey: this.activeKey(), token: randomBytes(32).toString('hex') } : { enabled: false };
    await atomicWrite(path.join(this.root, 'chat-bridge.json'), JSON.stringify(this.config));
    if (enabled) {
      try { await this.listen(); }
      catch (e) { this.config = { enabled: false }; await atomicWrite(path.join(this.root, 'chat-bridge.json'), JSON.stringify(this.config)); throw e; }
    }
    this.changed(); return this.info();
  }
  paired(accountKey) {
    if (!this.config.enabled || this.config.accountKey !== this.activeKey()) throw new Error('Open the paired shelf in Aftertaste, or enable the chat connection for the current shelf.');
    if (accountKey !== undefined && accountKey !== this.config.accountKey) throw new Error('This request targets a different shelf. Read status again.');
    return this.config.accountKey;
  }
  async status() {
    const info = this.info();
    if (!info.paired) return { ...info, version: this.version, message: 'The paired shelf is not active. No library data is available.' };
    const data = await this.store.read(this.paired());
    return { ...info, version: this.version, revision: fingerprint(data), counts: { stories: data.materials.length, sources: data.sources.length, notes: data.materials.reduce((n, m) => n + (m.notes || []).length, 0) }, lastContextUpdate: data.chatBridgeLastUpdate || null, recommendationsStale: !!data.recommendationsStale, generatedAt: data.generatedAt || null, recommendations: data.recommendations, latestJob: this.jobs.find(j => j.accountKey === info.accountKey) || null };
  }
  async dispatch(action, p = {}) {
    if (action === 'status') return this.status();
    const key = this.paired(strictText(p.accountKey, 64, 'account key'));
    if (action === 'read_context') {
      const data = await this.store.read(key);
      return { accountKey: key, revision: fingerprint(data), context: contextFor(data), sources: data.sources.map(s => ({ id: s.id, title: s.title, enabled: s.enabled !== false, chatBridgeKey: s.chatBridgeKey })), contextSummary: data.contextSummary };
    }
    if (action === 'update_context') {
      this.assertIdle(); const id = requestId(p.requestId), docs = documents(p.documents), digest = fingerprint(docs);
      const before = await this.store.read(key), previous = (before.chatBridgeUpdates || []).find(r => r.requestId === id);
      if (previous) {
        if (previous.digest !== digest) throw new Error('This request ID was used for a different update.');
        return { alreadyApplied: true, ...previous, revision: fingerprint(before) };
      }
      let receipt;
      const result = await this.store.update(key, async data => {
        this.paired(key); this.assertIdle();
        if (p.expectedRevision !== fingerprint(data)) throw new Error('Your library changed. Read the latest context before updating it.');
        // Preserve the complete pre-update library; assets remain in their original local folder.
        await atomicWrite(path.join(this.root, 'backups', 'chat-updates', `${Date.now()}-${randomUUID()}.json`), JSON.stringify({ application: 'aftertaste', version: 1, accountKey: key, library: data }, null, 2));
        this.paired(key); this.assertIdle();
        let added = 0, updated = 0;
        for (const doc of docs) {
          const old = data.sources.find(s => s.chatBridgeKey === doc.key);
          if (old) { Object.assign(old, { title: doc.title, body: doc.body, updatedAt: new Date().toISOString() }); updated++; }
          else { data.sources.push({ id: randomUUID(), chatBridgeKey: doc.key, title: doc.title, body: doc.body, kind: 'document', enabled: true, importedAt: new Date().toISOString() }); added++; }
        }
        const selected = new Map(contextFor(data).map(s => [s.id, s.text]));
        for (const doc of docs) {
          const source = data.sources.find(s => s.chatBridgeKey === doc.key);
          if (source.enabled !== false && selected.get(`source:${source.id}`) !== source.body) throw new Error('The enabled context is full. Disable unused sources in Aftertaste before sending this update.');
        }
        receipt = { requestId: id, digest, added, updated, at: new Date().toISOString() };
        data.chatBridgeUpdates = [receipt, ...(data.chatBridgeUpdates || [])].slice(0, 50);
        data.chatBridgeLastUpdate = receipt; data.recommendationsStale = true;
      });
      this.changed({ contextUpdated: true });
      return { ...receipt, revision: fingerprint(result) };
    }
    if (action === 'refresh_recommendations') {
      const id = requestId(p.requestId);
      const format = p.format || 'book'; if (!['book', 'manga', 'game'].includes(format)) throw new Error('Choose books, manga, or games.');
      const query = p.query === undefined ? '' : strictText(p.query, 2000, 'recommendation request');
      const model = p.model === undefined ? '' : strictText(p.model, 200, 'model');
      const digest = fingerprint({ accountKey: key, format, query, model });
      const previous = this.jobs.find(j => j.requestId === id);
      if (previous) { if (previous.digest !== digest) throw new Error('This request ID was used for a different selection.'); return previous; }
      this.assertIdle();
      if (fingerprint(await this.store.read(key)) !== p.expectedRevision) throw new Error('Your library changed. Read status before starting a selection.');
      const record = { requestId: id, accountKey: key, digest, status: 'running', startedAt: new Date().toISOString() };
      this.jobs = [record, ...this.jobs].slice(0, 30); await this.saveJobs();
      try {
        this.paired(key);
        // The main process reserves its recommendation job before its first await.
        const work = this.runRecommendation({ format, query, model, accountKey: key, expectedRevision: p.expectedRevision });
        this.work = Promise.resolve(work).then(result => { record.status = 'completed'; record.generatedAt = result.generatedAt; record.count = result.picks.length; }, e => { record.status = 'failed'; record.error = e.code ? 'The local selection could not finish.' : e.message; }).then(async () => { record.finishedAt = new Date().toISOString(); await this.saveJobs(); this.changed(); });
        this.work.catch(() => {});
      } catch (e) { record.status = 'failed'; record.error = e.message; await this.saveJobs(); }
      return { ...record };
    }
    throw new Error('Unsupported local chat action.');
  }
  saveJobs() { return atomicWrite(path.join(this.root, 'chat-jobs.json'), JSON.stringify(this.jobs)); }
  async listen() {
    const address = socketPath(this.root);
    if (process.platform !== 'win32') {
      const old = await fs.lstat(address).catch(e => { if (e.code !== 'ENOENT') throw e; });
      if (old) { if (!old.isSocket()) throw new Error('The local chat socket path is occupied.'); await fs.unlink(address); }
    }
    const server = net.createServer(socket => {
      this.connections.add(socket); socket.on('close', () => this.connections.delete(socket)); socket.on('error', () => {}); socket.setTimeout(15000, () => socket.destroy());
      let buffer = '', bytes = 0, received = false; socket.setEncoding('utf8');
      socket.on('data', chunk => {
        if (received) return; bytes += Buffer.byteLength(chunk); if (bytes > MAX_MESSAGE) return socket.destroy();
        buffer += chunk; const end = buffer.indexOf('\n'); if (end < 0) return; received = true;
        const handle = async () => {
          try {
            const request = JSON.parse(buffer.slice(0, end));
            const supplied = Buffer.from(typeof request.token === 'string' ? request.token : '');
            const expected = Buffer.from(this.config.token || '');
            if (!this.config.enabled || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error('The local chat connection is not authorized.');
            const data = await this.dispatch(request.action, request.payload);
            if (!socket.destroyed) socket.end(`${JSON.stringify({ ok: true, data })}\n`);
          } catch (e) { if (!socket.destroyed) socket.end(`${JSON.stringify({ ok: false, error: e.code ? 'The local chat action could not be completed.' : e.message })}\n`); }
        };
        const work = this.queue.then(handle); this.queue = work.catch(() => {});
      });
    });
    this.server = server;
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(address, resolve); });
    if (process.platform !== 'win32') await fs.chmod(address, 0o600);
  }
  async close() {
    const server = this.server; this.server = null;
    for (const socket of this.connections) socket.destroy();
    if (server) await new Promise(resolve => server.close(resolve));
    if (server && process.platform !== 'win32') await fs.unlink(socketPath(this.root)).catch(() => {});
  }
}
module.exports = { ChatBridge, socketPath, MAX_MESSAGE };
