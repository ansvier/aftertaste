const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { PassThrough } = require('node:stream');
const { ChatBridge, socketPath } = require('../src/chat-bridge.cjs');
const { call, mcp } = require('../agent/aftertaste.cjs');
const { LibraryStore, atomicWrite } = require('../src/storage.cjs');

async function fixture(t, runRecommendation = async () => ({ generatedAt: new Date().toISOString(), picks: [] })) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'at-chat-'));
  const store = new LibraryStore(root); let active = 'local', busy = false;
  const bridge = new ChatBridge({ root, store, activeKey: () => active, assertIdle: () => { if (busy) throw new Error('Selection busy.'); }, runRecommendation, cancel: () => {}, changed: () => {}, version: 'test' });
  t.after(async () => { await bridge.close(); await bridge.work; await fs.rm(root, { recursive: true, force: true }); });
  await bridge.init();
  return { root, store, bridge, switchTo: key => { active = key; }, setBusy: value => { busy = value; } };
}
test('local chat access is opt-in, token protected, owner-only and removable', async t => {
  const { root, bridge } = await fixture(t);
  await assert.rejects(call('status', {}, root), /enable Settings/i);
  await bridge.setEnabled(true);
  assert.equal((await call('status', {}, root)).paired, true);
  if (process.platform !== 'win32') {
    assert.equal((await fs.stat(socketPath(root))).mode & 0o777, 0o600);
    assert.equal((await fs.stat(path.join(root, 'chat-bridge.json'))).mode & 0o777, 0o600);
  }
  const denied = await new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath(root)); let output = '';
    socket.on('error', reject); socket.setEncoding('utf8');
    socket.on('connect', () => socket.write(`${JSON.stringify({ action: 'status', token: 'wrong-token' })}\n`));
    socket.on('data', chunk => { output += chunk; }); socket.on('end', () => resolve(JSON.parse(output)));
  });
  assert.equal(denied.ok, false); assert.match(denied.error, /not authorized/);
  await bridge.setEnabled(false);
  await assert.rejects(call('status', {}, root), /Enable Settings/);
  if (process.platform !== 'win32') await assert.rejects(fs.stat(socketPath(root)), { code: 'ENOENT' });
});
test('context merges preserve library and imports, enforce revisions, and retry without duplicates', async t => {
  const { root, store, bridge } = await fixture(t);
  await store.update('local', d => {
    d.materials = [{ id: 'story', title: 'Synthetic story', notes: [{ id: 'note', text: 'A synthetic impression.' }] }];
    d.sources = [{ id: 'imported', title: 'Chosen import', body: 'Original evidence.', enabled: true }, { id: 'disabled', title: 'Disabled import', body: 'Do not send this.', enabled: false }];
    d.recommendations = [{ title: 'Previous selection' }];
  });
  await bridge.setEnabled(true);
  const before = await call('status', {}, root);
  const p = { accountKey: 'local', expectedRevision: before.revision, requestId: 'synthetic-update-01', documents: [{ key: 'reading-moment', title: 'Chosen chat evidence', body: 'User statement: I want a quiet fictional world. Source: chosen synthetic chat.' }] };
  const result = await call('update_context', p, root);
  assert.equal(result.added, 1); assert.notEqual(result.revision, before.revision);
  const data = await store.read('local');
  assert.equal(data.materials[0].notes[0].text, 'A synthetic impression.'); assert.equal(data.sources[0].body, 'Original evidence.');
  assert.equal(data.recommendations[0].title, 'Previous selection'); assert.equal(data.recommendationsStale, true);
  const replay = await call('update_context', p, root);
  assert.equal(replay.alreadyApplied, true); assert.equal(replay.revision, result.revision);
  await assert.rejects(call('update_context', { ...p, documents: [{ ...p.documents[0], body: 'Different.' }] }, root), /different update/);
  await assert.rejects(call('update_context', { ...p, requestId: 'synthetic-update-02' }, root), /library changed/);
  await assert.rejects(call('update_context', { ...p, requestId: 'synthetic-invalid-01', documents: [{ ...p.documents[0], body: 'a'.repeat(20001) }] }, root), /Invalid document body/);
  await store.update('local', d => { d.sources.find(s => s.chatBridgeKey).enabled = false; });
  const status = await call('status', {}, root);
  await call('update_context', { ...p, requestId: 'synthetic-update-03', expectedRevision: status.revision }, root);
  assert.equal((await store.read('local')).sources.find(s => s.chatBridgeKey).enabled, false);
  const context = await call('read_context', { accountKey: 'local' }, root);
  assert.equal(context.context.some(s => /Do not send|quiet fictional/.test(s.text)), false);
  assert.equal(context.context.some(s => s.text === 'A synthetic impression.'), true);
  const backups = await fs.readdir(path.join(root, 'backups', 'chat-updates'));
  assert.equal(backups.length, 2);
  const saved = JSON.parse(await fs.readFile(path.join(root, 'backups', 'chat-updates', backups.sort()[0]), 'utf8'));
  assert.equal(saved.library.sources.length, 2); assert.equal(saved.library.materials.length, 1);
});
test('switching shelves pauses access and rejects writes to another account', async t => {
  const { root, bridge, switchTo, setBusy } = await fixture(t);
  await bridge.setEnabled(true);
  const status = await call('status', {}, root);
  await assert.rejects(call('read_context', { accountKey: 'a'.repeat(64) }, root), /different shelf/);
  setBusy(true);
  await assert.rejects(call('update_context', { accountKey: 'local' }, root), /busy/);
  setBusy(false); switchTo('a'.repeat(64));
  const paused = await call('status', {}, root);
  assert.equal(paused.paired, false); assert.equal(paused.revision, undefined);
  await assert.rejects(call('refresh_recommendations', { accountKey: 'local', expectedRevision: status.revision, requestId: 'synthetic-reco-01' }, root), /paired shelf/);
  await assert.rejects(call('read_context', { accountKey: 'local' }, root), /paired shelf/);
});
test('an update outside the inference context budget is rejected without changing the library', async t => {
  const { root, store, bridge } = await fixture(t);
  await store.update('local', d => { d.sources = Array.from({ length: 120 }, (_, i) => ({ id: `source-${i}`, title: `Synthetic evidence ${i}`, body: 'Chosen synthetic evidence.', enabled: true })); });
  await bridge.setEnabled(true); const before = await call('status', {}, root);
  await assert.rejects(call('update_context', { accountKey: 'local', expectedRevision: before.revision, requestId: 'synthetic-over-budget', documents: [{ key: 'new-evidence', title: 'Latest wishes', body: 'This must be included, not silently omitted.' }] }, root), /context is full/);
  const after = await call('status', {}, root);
  assert.equal(after.revision, before.revision); assert.equal(after.counts.sources, 120);
});
test('recommendation receipts survive reconnects and restart never repeats inference', async t => {
  let calls = 0, finish;
  const work = new Promise(resolve => { finish = resolve; });
  const { root, bridge } = await fixture(t, () => { calls++; return work; });
  await bridge.setEnabled(true); const status = await call('status', {}, root);
  const p = { accountKey: 'local', expectedRevision: status.revision, requestId: 'synthetic-reco-01', format: 'book' };
  const started = await call('refresh_recommendations', p, root);
  assert.equal(started.status, 'running'); assert.equal(calls, 1);
  assert.equal((await call('refresh_recommendations', p, root)).status, 'running'); assert.equal(calls, 1);
  await assert.rejects(call('refresh_recommendations', { ...p, query: 'Different request.' }, root), /different selection/);
  finish({ generatedAt: 'synthetic-time', picks: [{ title: 'Synthetic recommendation' }] }); await bridge.work;
  assert.equal((await call('status', {}, root)).latestJob.status, 'completed');
  await bridge.close();
  const jobs = JSON.parse(await fs.readFile(path.join(root, 'chat-jobs.json'), 'utf8')); jobs[0].status = 'running';
  await atomicWrite(path.join(root, 'chat-jobs.json'), JSON.stringify(jobs));
  await bridge.init();
  assert.equal((await call('refresh_recommendations', p, root)).status, 'interrupted'); assert.equal(calls, 1);
});
test('stdio MCP discovers scoped tools and sends only protocol messages', async () => {
  const input = new PassThrough(), output = new PassThrough(); let raw = '';
  output.on('data', chunk => { raw += chunk.toString(); });
  await mcp(input, output, async action => { if (action === 'status') return { paired: true }; throw new Error('Synthetic denial.'); });
  for (const message of [
    { id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } },
    { method: 'notifications/initialized' },
    { id: 2, method: 'tools/list' },
    { id: 3, method: 'tools/call', params: { name: 'aftertaste_status', arguments: {} } },
    { id: 4, method: 'tools/call', params: { name: 'aftertaste_update_context', arguments: {} } }
  ]) input.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
  await new Promise(resolve => setImmediate(resolve)); input.end();
  const messages = raw.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(messages.length, 4); assert.equal(messages.find(m => m.id === 2).result.tools.length, 4);
  assert.equal(messages.find(m => m.id === 3).result.isError, false); assert.equal(messages.find(m => m.id === 4).result.isError, true);
  assert.equal(/token|credential/i.test(JSON.stringify(messages.find(m => m.id === 3))), false);
});
