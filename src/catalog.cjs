const { text, httpsURL } = require('./validation.cjs');
const HEADERS = { 'User-Agent': 'Aftertaste/0.1 (open-source personal library; https://github.com/ansvier/aftertaste)' };
const clean = value => text(String(value || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' '), 2500);
async function json(url, fetcher) {
  const res = await fetcher(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('The catalog is unavailable. Please try again or add the story manually.');
  return res.json();
}
function unique(items) {
  const seen = new Set();
  return items.filter(item => { const k = `${item.title}:${item.creator}`.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''); if (seen.has(k)) return false; seen.add(k); return true; });
}
async function search(type, query, fetcher = fetch) {
  query = text(query, 200);
  if (query.length < 2) throw new Error('Enter at least two characters.');
  if (type === 'manga') {
    const p = new URLSearchParams({ title: query, limit: '16', 'order[relevance]': 'desc' });
    p.append('includes[]', 'cover_art'); p.append('includes[]', 'author'); p.append('contentRating[]', 'safe'); p.append('contentRating[]', 'suggestive');
    const data = await json(`https://api.mangadex.org/manga?${p}`, fetcher);
    return (data.data || []).map(m => {
      const cover = m.relationships?.find(r => r.type === 'cover_art')?.attributes?.fileName;
      return { externalId: `md:${m.id}`, type: 'manga', title: m.attributes.title.en || Object.values(m.attributes.title)[0], creator: m.relationships?.filter(r => r.type === 'author').map(r => r.attributes?.name).filter(Boolean).join(', ') || '',
        year: String(m.attributes.year || ''), cover: cover ? `https://uploads.mangadex.org/covers/${m.id}/${cover}.256.jpg` : '', sourceUrl: `https://mangadex.org/title/${m.id}`, description: clean(m.attributes.description.en), tags: (m.attributes.tags || []).map(t => t.attributes.name.en).slice(0, 12) };
    });
  }
  if (type === 'game') {
    const data = await json(`https://store.steampowered.com/api/storesearch/?${new URLSearchParams({ term: query, l: 'english', cc: 'US' })}`, fetcher);
    return (data.items || []).filter(g => g.type === 'app' && !/soundtrack|dlc|artbook|season pass/i.test(g.name)).slice(0, 16).map(g => ({ externalId: `steam:${g.id}`, type: 'game', title: g.name, creator: '', year: '', cover: `https://cdn.akamai.steamstatic.com/steam/apps/${g.id}/library_600x900.jpg`, sourceUrl: `https://store.steampowered.com/app/${g.id}/`, description: '', tags: [] }));
  }
  const settled = await Promise.allSettled([
    json(`https://openlibrary.org/search.json?${new URLSearchParams({ q: query, lang: 'en', limit: '14', fields: 'key,title,author_name,first_publish_year,cover_i,first_sentence,subject,editions,editions.title' })}`, fetcher).then(d => (d.docs || []).map(b => ({ externalId: `ol:${b.key}`, type: 'book', title: b.editions?.docs?.[0]?.title || b.title, creator: (b.author_name || []).slice(0, 1).join(', '), year: String(b.first_publish_year || ''), cover: b.cover_i ? `https://covers.openlibrary.org/b/id/${b.cover_i}-L.jpg` : '', sourceUrl: `https://openlibrary.org${b.key}`, description: clean((b.first_sentence || []).join(' ')), tags: (b.subject || []).slice(0, 12) }))),
    json(`https://www.googleapis.com/books/v1/volumes?${new URLSearchParams({ q: query, maxResults: '10', printType: 'books', langRestrict: 'en' })}`, fetcher).then(d => (d.items || []).filter(b => b.volumeInfo?.title).map(({ id, volumeInfo: b }) => ({ externalId: `gb:${id}`, type: 'book', title: b.title, creator: (b.authors || []).join(', '), year: b.publishedDate?.slice(0, 4) || '', cover: httpsURL(b.imageLinks?.thumbnail?.replace(/^http:/, 'https:')), sourceUrl: httpsURL(b.infoLink?.replace(/^http:/, 'https:')), description: clean(b.description), tags: b.categories || [] })))
  ]);
  if (settled.every(r => r.status === 'rejected')) throw new Error('Book catalogs are unavailable. Please try again or add a book manually.');
  return unique(settled.flatMap(r => r.status === 'fulfilled' ? r.value : []));
}
module.exports = { search, unique };
