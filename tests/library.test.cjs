const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { LibraryStore, accountKey } = require('../src/storage.cjs');
const { parseImport } = require('../src/import.cjs');
const { material, httpsURL } = require('../src/validation.cjs');
const { contextFor } = require('../src/inference.cjs');
test('new shelves are empty and account libraries stay separate across restart', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aftertaste-library-test-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new LibraryStore(root), a = accountKey({ client_id: 'account-a', subject: 'same-sub' }), b = accountKey({ client_id: 'account-b', subject: 'same-sub' });
  assert.notEqual(a, b); assert.deepEqual((await store.read(a)).materials, []);
  await Promise.all([store.update(a, d => d.materials.push(material({ title: 'Synthetic test story' }))), store.update(a, d => d.sources.push({ id: 'synthetic-source', body: 'A synthetic thought' }))]);
  assert.equal((await new LibraryStore(root).read(a)).materials.length, 1); assert.equal((await store.read(a)).sources.length, 1);
  assert.equal((await store.read(b)).materials.length, 0); assert.equal((await store.read('local')).materials.length, 0);
  await assert.rejects(store.read('../escape')); await assert.rejects(store.asset(a, '../../secret'));
});
test('ChatGPT import follows the active branch and includes only own user messages', () => {
  const chats = [{ title: 'Synthetic chat', current_node: 'u2', mapping: {
    u1: { parent: null, message: { author: { role: 'user' }, content: { parts: ['I want a strange story.'] } } },
    a1: { parent: 'u1', message: { author: { role: 'assistant' }, content: { parts: ['You must like robots.'] } } },
    u2: { parent: 'a1', message: { author: { role: 'user' }, content: { parts: ['For enjoyment, please.'] } } },
    abandoned: { parent: 'u1', message: { author: { role: 'user' }, content: { parts: ['Wrong branch.'] } } }
  } }];
  const result = parseImport('conversations.json', JSON.stringify(chats));
  assert.equal(result.length, 1); assert.match(result[0].body, /For enjoyment/); assert.doesNotMatch(result[0].body, /robots|Wrong branch/);
  assert.throws(() => parseImport('secrets.env', 'anything')); assert.throws(() => parseImport('broken.json', '{'));
});
test('only enabled sources and written impressions enter bounded AI context', () => {
  const data = { sources: [{ id: 'on', title: 'Chosen', body: 'a'.repeat(30000) }, { id: 'off', title: 'Not chosen', body: 'private', enabled: false }], materials: [{ id: 'story', title: 'A book', notes: [{ id: 'voice', audioAsset: 'audio' }, { id: 'text', text: 'My own impression' }] }] };
  const context = contextFor(data);
  assert.equal(context.find(s => s.id === 'source:on').text.length, 20000); assert.equal(context.some(s => s.id === 'source:off'), false); assert.equal(context.some(s => s.id === 'note:voice'), false); assert.equal(context.some(s => s.id === 'note:text'), true);
});
test('untrusted links cannot become executable URLs', () => {
  for (const url of ['javascript:alert(1)', 'file:///private/file', 'http://example.test', 'https://user:password@example.test']) assert.equal(httpsURL(url), '');
  assert.equal(material({ title: 'Test', cover: 'javascript:alert(1)', status: 'unknown' }).cover, '');
});

test('video previews use only validated YouTube IDs and keep manual covers separate', () => {
  const { videoThumbnail } = require('../renderer/library-tools.js');
  const id = 'N2A4-SwF27A', expected = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  for (const sourceUrl of [`https://www.youtube.com/watch?v=${id}&t=20`, `https://youtu.be/${id}?si=example`, `https://m.youtube.com/shorts/${id}`, `https://www.youtube-nocookie.com/embed/${id}`, `https://youtube.com/live/${id}/`]) {
    assert.equal(videoThumbnail({ type: 'video', sourceUrl }), expected);
  }
  for (const sourceUrl of ['https://youtube.com.evil.test/watch?v=N2A4-SwF27A', 'https://evil.test/youtube.com/watch?v=N2A4-SwF27A', 'http://youtube.com/watch?v=N2A4-SwF27A', 'https://user:pass@youtube.com/watch?v=N2A4-SwF27A', 'https://youtube.com/watch?v=../not-an-id', 'https://youtu.be/N2A4-SwF27A/extra', 'https://youtube.com/watch?v=short', 'javascript:alert(1)', 'https://youtube.com:1234/watch?v=N2A4-SwF27A']) {
    assert.equal(videoThumbnail({ type: 'video', sourceUrl }), '');
  }
  assert.equal(videoThumbnail({ type: 'book', sourceUrl: `https://youtu.be/${id}` }), '');
  assert.equal(videoThumbnail({ type: 'video' }), '');
});
