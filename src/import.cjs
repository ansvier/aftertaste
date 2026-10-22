const { createHash } = require('node:crypto');
const { text } = require('./validation.cjs');
function source(title, body, kind) {
  body = text(body, 160000);
  return { id: createHash('sha256').update(`${title}\0${body}`).digest('hex').slice(0, 24), title: text(title, 200), body, kind, importedAt: new Date().toISOString() };
}
function parseImport(name, contents) {
  if (typeof contents !== 'string' || Buffer.byteLength(contents) > 100 * 1024 * 1024) throw new Error('Choose a text export smaller than 100 MB.');
  if (/\.json$/i.test(name)) {
    let data;
    try { data = JSON.parse(contents); } catch { throw new Error('This JSON file could not be read.'); }
    if (!Array.isArray(data)) throw new Error('Choose conversations.json from your ChatGPT export, or a text / Markdown file.');
    return data.slice(0, 5000).filter(c => c && typeof c.mapping === 'object').map(c => {
      const mapping = c.mapping;
      const chain = []; const seen = new Set(); let current = c.current_node;
      while (current && mapping[current] && !seen.has(current)) {
        seen.add(current); chain.unshift(mapping[current]); current = mapping[current].parent;
      }
      const nodes = chain.length ? chain : Object.values(mapping).sort((a, b) => (a.message?.create_time || 0) - (b.message?.create_time || 0));
      // Only the user's own messages are evidence about them. Replies and tool data are excluded.
      const ownWords = nodes.filter(n => n?.message?.author?.role === 'user').map(n => (n.message.content?.parts || []).filter(p => typeof p === 'string').join('\n')).filter(Boolean).join('\n\n---\n\n');
      return source(c.title || 'Untitled conversation', ownWords, 'chat');
    }).filter(s => s.body);
  }
  if (!/\.(txt|md|markdown)$/i.test(name)) throw new Error('Choose a .txt, .md, or conversations.json file.');
  const item = source(name, contents, 'document');
  return item.body ? [item] : [];
}
module.exports = { parseImport };
