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
  function videoThumbnail(item) {
    if (item.type !== 'video') return '';
    try {
      const url = new URL(item.sourceUrl);
      if (url.protocol !== 'https:' || url.username || url.password || url.port) return '';
      let id = '';
      if (['youtu.be', 'www.youtu.be'].includes(url.hostname)) id = url.pathname.slice(1);
      else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(url.hostname)) {
        if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
        else id = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)\/?$/)?.[1] || '';
      }
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '';
    } catch { return ''; }
  }
  function catalogCoverURL(value) {
    try {
      const u = new URL(value);
      if (u.protocol !== 'https:' || u.username || u.password || u.port || u.href.length > 1500) return '';
      if (u.hostname === 'covers.openlibrary.org' && /^\/b\/(?:id\/[1-9]\d*|isbn\/[\dXx-]+|olid\/OL\d+M)-(?:S|M|L)\.jpg$/.test(u.pathname)) return u.href;
      if (['books.google.com', 'books.googleusercontent.com'].includes(u.hostname) && u.pathname.startsWith('/books/')) return u.href;
    } catch {}
    return '';
  }
  return { normalize, configure, autoTags, search, excerpt, videoThumbnail, catalogCoverURL };
});
