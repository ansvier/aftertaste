const { randomUUID } = require('node:crypto');
const text = (value, max = 2000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
function httpsURL(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; } catch { return ''; }
}
function material(input) {
  if (!input || typeof input !== 'object') throw new Error('Invalid story.');
  const title = text(input.title, 300);
  if (!title) throw new Error('Add a title first.');
  return {
    id: text(input.id, 50) || randomUUID(), title, creator: text(input.creator, 300),
    type: ['book', 'manga', 'game', 'video', 'film', 'article', 'podcast'].includes(input.type) ? input.type : 'book',
    status: ['want', 'active', 'finished', 'paused'].includes(input.status) ? input.status : 'want',
    year: text(input.year, 10), description: text(input.description, 3000),
    cover: httpsURL(input.cover), sourceUrl: httpsURL(input.sourceUrl),
    coverAsset: /^[a-f0-9-]{36}\.(png|jpg|webp)$/.test(input.coverAsset) ? input.coverAsset : '',
    tags: Array.isArray(input.tags) ? input.tags.map(t => text(t, 70)).filter(Boolean).slice(0, 16) : [],
    addedAt: new Date().toISOString()
  };
}
const fingerprint = data => require('node:crypto').createHash('sha256').update(JSON.stringify(data)).digest('hex');
module.exports = { text, httpsURL, material, fingerprint };
