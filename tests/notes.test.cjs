const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { LibraryStore } = require('../src/storage.cjs');
const { editNote } = require('../src/notes.cjs');
const { portableBackup } = require('../src/backups.cjs');
const { search } = require('../renderer/library-tools.js');

async function fixture(t, audio = true) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aftertaste-edit-test-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new LibraryStore(root), asset = audio ? await store.saveAsset('local', Buffer.from('Synthetic voice attachment'), 'audio/wav') : '';
  await store.update('local', d => {
    d.materials = [{ id: 'book', type: 'book', title: 'Synthetic book', notes: [{ id: 'note', text: 'Original thought', createdAt: '2025-01-02T03:04:05Z', audioAsset: asset }, { id: 'other', text: 'Another note' }] }];
    d.sources = [{ id: 'source', title: 'Chosen context', body: 'Synthetic context' }]; d.recommendations = [{ title: 'An existing recommendation' }];
  });
  return { root, store, asset };
}
test('editing persists across restart and preserves note identity, creation date, audio and other context', async t => {
  const { root, store, asset } = await fixture(t); const before = await store.read('local');
  await editNote(store, 'local', { storyId: 'book', id: 'note', expectedText: 'Original thought', text: 'A revised thought about the ending' });
  const after = await new LibraryStore(root).read('local'), note = after.materials[0].notes[0];
  assert.equal(note.id, 'note'); assert.equal(note.createdAt, before.materials[0].notes[0].createdAt); assert.equal(note.audioAsset, asset); assert.ok(note.updatedAt);
  assert.equal(note.text, 'A revised thought about the ending'); assert.deepEqual(after.materials[0].notes[1], before.materials[0].notes[1]); assert.deepEqual(after.sources, before.sources);
  assert.deepEqual(after.recommendations, before.recommendations); assert.equal(after.recommendationsStale, true);
  assert.equal(search(after.materials, 'revised', 'all').notes.length, 1); assert.equal(search(after.materials, 'Original', 'all').notes.length, 0);
  const backup = await portableBackup(store, 'local'); assert.equal(Buffer.from(backup.assets[asset], 'base64').toString(), 'Synthetic voice attachment'); assert.equal(backup.library.materials[0].notes[0].updatedAt, note.updatedAt);
});
test('stale or missing notes cannot overwrite a newer note or another account shelf', async t => {
  const { store } = await fixture(t); const before = await store.read('local');
  for (const input of [{ id: 'missing', expectedText: '' }, { id: 'note', expectedText: 'Outdated text' }]) await assert.rejects(editNote(store, 'local', { storyId: 'book', text: 'Overwrite', ...input }), /no longer exists|changed/);
  await assert.rejects(editNote(store, 'a'.repeat(64), { storyId: 'book', id: 'note', expectedText: 'Original thought', text: 'Overwrite' }), /no longer exists/);
  assert.deepEqual(await store.read('local'), before);
});
test('blank text is rejected without audio and an audio note can keep its recording with an empty caption', async t => {
  const { store, asset } = await fixture(t);
  await editNote(store, 'local', { storyId: 'book', id: 'note', expectedText: 'Original thought', text: '' });
  assert.equal((await store.read('local')).materials[0].notes[0].audioAsset, asset);
  const { store: textOnly } = await fixture(t, false), before = await textOnly.read('local');
  await assert.rejects(editNote(textOnly, 'local', { storyId: 'book', id: 'note', expectedText: 'Original thought', text: '  ' }), /Leave a thought/);
  assert.deepEqual(await textOnly.read('local'), before);
});
