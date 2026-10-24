(function (root, factory) {
  const api = factory(); if (typeof module === 'object') module.exports = api; else root.LibraryTools = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  const normalize = s => String(s || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  let rules = [];
  function configure(input) { rules = input.map(r => ({ id: r.id, expression: new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${r.words.join('|')})`, 'iu') })); }
  function autoTags(item) {
    const value = normalize([item.title, item.description, ...(item.tags || []), ...(item.notes || []).map(n => n.text)].join(' '));
    return rules.filter(r => r.expression.test(value)).map(r => r.id).slice(0, 8);
  }
  function search(materials, query, type, label = id => id) {
    const terms = normalize(query).replace(/#/g, '').split(/\s+/).filter(Boolean);
    const matches = text => terms.every(t => normalize(text).includes(t));
    const stories = [], notes = [];
    for (const item of materials) {
      if (type !== 'all' && item.type !== type && !(type === 'video' && ['film', 'article', 'podcast'].includes(item.type))) continue;
      const tags = autoTags(item).map(label);
      if (matches([item.title, item.creator, ...(item.tags || []), ...tags, ...(item.notes || []).map(n => n.text)].join(' '))) stories.push(item);
      if (terms.length) for (const note of item.notes || []) if (note.text && matches(note.text)) notes.push({ item, note });
    }
    return { stories, notes };
  }
  function excerpt(text, query, max = 240) {
    const first = normalize(query).replace(/#/g, '').split(/\s+/).filter(Boolean)[0];
    const at = first ? normalize(text).indexOf(first) : 0, start = Math.max(0, at - 60);
    return `${start ? '…' : ''}${text.slice(start, start + max)}${text.length > start + max ? '…' : ''}`;
  }
  return { normalize, configure, autoTags, search, excerpt };
});
