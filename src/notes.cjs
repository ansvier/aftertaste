const { text } = require('./validation.cjs');

function editNote(store, key, input) {
  return store.update(key, data => {
    const story = data.materials.find(m => m.id === input?.storyId);
    const note = story?.notes?.find(n => n.id === input?.id);
    if (!note) throw new Error('This note no longer exists. Open your notes again.');
    if (typeof input.expectedText !== 'string' || input.expectedText !== (note.text || '')) throw new Error('This note changed. Open it again before editing.');
    const contents = text(input.text, 50000);
    if (!contents && !note.audioAsset) throw new Error('Leave a thought or record a voice impression.');
    if (contents === (note.text || '')) return;
    note.text = contents;
    note.updatedAt = new Date().toISOString();
    if (data.recommendations?.length) data.recommendationsStale = true;
  });
}

module.exports = { editNote };
