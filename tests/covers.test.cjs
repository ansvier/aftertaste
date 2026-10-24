const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { CoverCache } = require('../src/covers.cjs');
const { catalogCoverURL } = require('../renderer/library-tools.js');
const { LibraryStore } = require('../src/storage.cjs');
const { portableBackup } = require('../src/backups.cjs');
const jpeg = Buffer.from([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 255, 217]);
const url = 'https://covers.openlibrary.org/b/id/100-L.jpg';
const image = bytes => new Response(bytes || jpeg, { headers: { 'Content-Type': 'image/jpeg' } });
async function folder(t) { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aftertaste-cover-test-')); t.after(() => fs.rm(root, { recursive: true, force: true })); return root; }

test('catalog covers are downloaded once, cached for offline use and can be included in a portable backup', async t => {
  const root = await folder(t); let calls = 0;
  const cache = new CoverCache(root, async (_url, options) => { calls++; assert.equal(options.redirect, 'manual'); assert.equal(options.credentials, 'omit'); return image(); });
  const [a, b] = await Promise.all([cache.get(url), cache.get(url)]); assert.deepEqual(a.bytes, b.bytes); assert.equal(calls, 1);
  const offline = await new CoverCache(root, async () => { throw new Error('Offline'); }).get(url); assert.deepEqual(offline.bytes, jpeg);
  const store = new LibraryStore(root), coverAsset = await store.saveAsset('local', a.bytes, a.mime);
  await store.update('local', d => { d.materials.push({ id: 'book', title: 'Synthetic book', coverAsset, notes: [] }); });
  assert.deepEqual(Buffer.from((await portableBackup(store, 'local')).assets[coverAsset], 'base64'), jpeg);
});
test('an unavailable image can use another actual cover of the same work', async t => {
  const calls = [], cache = new CoverCache(await folder(t), async input => {
    const u = new URL(input); calls.push(u);
    if (u.hostname === 'covers.openlibrary.org') return u.pathname.includes('/id/200-') ? image() : new Response('', { status: 404 });
    if (u.pathname === '/works/OL1W.json') return Response.json({ key: '/works/OL1W', covers: [100, 200] });
    if (u.pathname === '/works/OL1W/editions.json') return Response.json({ entries: [{ covers: [300] }] });
    throw new Error('Unexpected URL');
  });
  assert.deepEqual((await cache.get(url, 'https://openlibrary.org/works/OL1W')).bytes, jpeg);
  assert.equal(calls.filter(u => u.hostname === 'covers.openlibrary.org').length, 2);
});
test('cover downloads reject private hosts, credentials and unsafe redirects without fetching their destinations', async t => {
  let calls = 0; const cache = new CoverCache(await folder(t), async () => { calls++; return new Response(null, { status: 302, headers: { Location: 'https://127.0.0.1/private' } }); });
  for (const bad of ['https://127.0.0.1/x.jpg', 'http://covers.openlibrary.org/b/id/100-L.jpg', 'https://user:password@covers.openlibrary.org/b/id/100-L.jpg', 'https://covers.openlibrary.org.evil.test/b/id/100-L.jpg', 'https://covers.openlibrary.org:1234/b/id/100-L.jpg']) {
    assert.equal(catalogCoverURL(bad), ''); await assert.rejects(cache.get(bad));
  }
  assert.equal(calls, 0); await assert.rejects(cache.get(url)); assert.equal(calls, 1);
});
test('HTML, invalid image data and oversized responses are rejected rather than cached', async t => {
  for (const response of [new Response('<html>Not an image</html>', { headers: { 'Content-Type': 'text/html' } }), new Response('Not a JPEG', { headers: { 'Content-Type': 'image/jpeg' } }), new Response(jpeg, { headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(9 * 1024 * 1024) } })]) {
    const root = await folder(t), cache = new CoverCache(root, async () => response);
    await assert.rejects(cache.get(url)); assert.deepEqual(await fs.readdir(path.join(root, 'cover-cache')).catch(() => []), []);
  }
});

test('rate-limited image hosts are backed off without retrying other images immediately', async t => {
  let calls = 0;
  const cache = new CoverCache(await folder(t), async () => { calls++; return new Response(null, { status: 429, headers: { 'Retry-After': '120' } }); });
  await assert.rejects(cache.get(url), /temporarily unavailable/);
  await assert.rejects(cache.get('https://covers.openlibrary.org/b/id/200-L.jpg'), /temporarily unavailable/);
  assert.equal(calls, 1);
});
