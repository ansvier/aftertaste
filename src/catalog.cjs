const { text, httpsURL } = require('./validation.cjs');
const HEADERS = { 'User-Agent': 'Aftertaste/0.1 (open-source personal library; https://github.com/ansvier/aftertaste)' };
const clean = value => text(String(value || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' '), 2500);
const cooldowns = new WeakMap();
async function json(url, fetcher) {
  const host = new URL(url).hostname;
  let blocked = cooldowns.get(fetcher);
  if (!blocked) { blocked = new Map(); cooldowns.set(fetcher, blocked); }
  if ((blocked.get(host) || 0) > Date.now()) throw new Error('The catalog is unavailable. Please try again later.');
  const res = await fetcher(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
  if (res.status === 429) {
    const retry = res.headers?.get('retry-after');
    const delay = /^\d+$/.test(retry || '') ? Number(retry) * 1000 : Date.parse(retry) - Date.now();
    blocked.set(host, Date.now() + Math.max(60000, Number.isFinite(delay) ? delay : 60000));
  }
  if (!res.ok) throw new Error('The catalog is unavailable. Please try again or add the story manually.', { cause: new Error(`${host}: HTTP ${res.status}`) });
  const data = await res.json();
  if (data.error) throw new Error('The catalog is unavailable. Please try again later.', { cause: new Error(`${host}: ${data.error.code || 'API error'}`) });
  return data;
}
function unique(items) {
  const seen = new Set(), identifiers = new Set();
  return items.filter(item => { const k = `${item.title}:${item.creator}`.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''); if (seen.has(k) || (item.externalId && identifiers.has(item.externalId))) return false; seen.add(k); if (item.externalId) identifiers.add(item.externalId); return true; });
}
function bookFromWork(work, creator, title = work.title) {
  if (!/^\/works\/OL\d+W$/.test(work.key || '') || !work.title || !title) return null;
  const cover = work.covers?.find(id => Number.isInteger(id) && id > 0);
  return { externalId: `ol:${work.key}`, type: 'book', title: text(title, 300), creator: text(creator, 300), year: String(work.first_publish_date || '').match(/\d{4}/)?.[0] || '',
    cover: cover ? `https://covers.openlibrary.org/b/id/${cover}-L.jpg` : '', sourceUrl: `https://openlibrary.org${work.key}`, description: clean(work.description?.value || work.description || ''), tags: (work.subjects || []).slice(0, 12).map(clean) };
}
async function libraryRecord(key, fetcher) {
  const kind = key.startsWith('/works/') ? 'works' : 'authors', visited = new Set();
  for (let hops = 0; hops < 5; hops++) {
    if (!(kind === 'works' ? /^\/works\/OL\d+W$/ : /^\/authors\/OL\d+A$/).test(key) || visited.has(key)) break;
    visited.add(key);
    const record = await json(`https://openlibrary.org${key}.json`, fetcher);
    if (record.type?.key !== '/type/redirect') return record;
    key = record.location;
  }
  throw new Error('The catalog is unavailable. Please try again later.');
}
// Resolve translated names through public identifiers, then load actual catalog records.
// This is a fallback for empty searches, not a generated or predefined book list.
async function translatedBooks(query, language, fetcher) {
  const base = 'https://www.wikidata.org/w/api.php?';
  const found = await json(base + new URLSearchParams({ action: 'wbsearchentities', search: query, language, uselang: language, type: 'item', limit: '5', format: 'json' }), fetcher);
  const ids = (found.search || []).map(e => e.id).filter(id => /^Q\d+$/.test(id)).slice(0, 5);
  if (!ids.length) return [];
  const data = await json(base + new URLSearchParams({ action: 'wbgetentities', ids: ids.join('|'), props: 'labels|claims', languages: `${language}|en`, format: 'json' }), fetcher);
  const results = []; let failure, candidates = 0;
  for (const id of ids) {
    const entity = data.entities?.[id];
    const links = (entity?.claims?.P648 || []).filter(c => c.rank !== 'deprecated').map(c => c.mainsnak?.datavalue?.value).filter(value => /^OL\d+[WA]$/.test(value || '')).slice(0, 2);
    if (!links.length) continue;
    if (candidates++ === 2) break;
    for (const link of links) {
      try {
        if (link.endsWith('A')) {
          const author = await libraryRecord(`/authors/${link}`, fetcher);
          if (!/^\/authors\/OL\d+A$/.test(author.key || '')) continue;
          const works = await json(`https://openlibrary.org${author.key}/works.json?limit=14`, fetcher);
          results.push(...(works.entries || []).map(w => bookFromWork(w, entity.labels?.[language]?.value || author.name)).filter(Boolean));
        } else {
          const work = await libraryRecord(`/works/${link}`, fetcher);
          if (!/^\/works\/OL\d+W$/.test(work.key || '')) continue;
          const authorKeys = (work.authors || []).map(a => a.author?.key).filter(key => /^\/authors\/OL\d+A$/.test(key || '')).slice(0, 2);
          const authors = await Promise.allSettled(authorKeys.map(key => libraryRecord(key, fetcher)));
          const creator = authors.filter(a => a.status === 'fulfilled').map(a => a.value.name).filter(Boolean).join(', ');
          const book = bookFromWork(work, creator, entity.labels?.[language]?.value || work.title);
          const publicationYears = (entity.claims?.P577 || []).filter(c => c.rank !== 'deprecated').map(c => c.mainsnak?.datavalue?.value?.time?.match(/^\+(\d{4})-/)?.[1]).filter(Boolean).sort();
          if (book && publicationYears.length) book.year = publicationYears[0];
          results.push(book);
        }
        break;
      } catch (e) { failure = e; }
    }
    if (results.length >= 14) break;
  }
  if (!results.length && failure) throw failure;
  return unique(results.filter(Boolean)).slice(0, 14);
}
async function search(type, query, fetcher = fetch, language = 'en') {
  query = text(query, 200);
  if (query.length < 2) throw new Error('Enter at least two characters.');
  language = /\p{Script=Cyrillic}/u.test(query) ? 'ru' : ['en', 'ru', 'fr'].includes(language) ? language : 'en';
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
  // Cyrillic titles are often indexed only as romanized editions. Start resolution
  // alongside the regular catalogs so their network delays do not add up.
  const resolving = /\p{Script=Cyrillic}/u.test(query) ? Promise.allSettled([translatedBooks(query, language, fetcher)]) : null;
  const settled = await Promise.allSettled([
    json(`https://openlibrary.org/search.json?${new URLSearchParams({ q: query, lang: language, limit: '14', fields: 'key,title,author_name,first_publish_year,cover_i,first_sentence,subject,editions,editions.title,editions.cover_i' })}`, fetcher).then(d => (d.docs || []).map(b => {
      const edition = b.editions?.docs?.[0], cover = edition?.cover_i || b.cover_i;
      return { externalId: `ol:${b.key}`, type: 'book', title: edition?.title || b.title, creator: (b.author_name || []).slice(0, 1).join(', '), year: String(b.first_publish_year || ''), cover: cover ? `https://covers.openlibrary.org/b/id/${cover}-L.jpg` : '', sourceUrl: `https://openlibrary.org${b.key}`, description: clean((b.first_sentence || []).join(' ')), tags: (b.subject || []).slice(0, 12) };
    })),
    json(`https://www.googleapis.com/books/v1/volumes?${new URLSearchParams({ q: query, maxResults: '10', printType: 'books' })}`, fetcher).then(d => (d.items || []).filter(b => b.volumeInfo?.title).map(({ id, volumeInfo: b }) => ({ externalId: `gb:${id}`, type: 'book', title: b.title, creator: (b.authors || []).join(', '), year: b.publishedDate?.slice(0, 4) || '', cover: httpsURL(b.imageLinks?.thumbnail?.replace(/^http:/, 'https:')), sourceUrl: httpsURL(b.infoLink?.replace(/^http:/, 'https:')), description: clean(b.description), tags: b.categories || [] })))
  ]);
  const items = unique(settled.flatMap(r => r.status === 'fulfilled' ? r.value : []));
  if (items.length && !resolving) return items;
  const fallback = await (resolving || Promise.allSettled([translatedBooks(query, language, fetcher)]));
  const combined = unique([...(fallback[0].status === 'fulfilled' ? fallback[0].value : []), ...items]);
  if (combined.length) return combined;
  if ([...settled, ...fallback].some(r => r.status === 'rejected')) throw new Error('Book catalogs are temporarily unavailable. Please try again later.', { cause: fallback[0].reason || settled.find(r => r.status === 'rejected')?.reason });
  return [];
}
module.exports = { search, unique };
