const { test } = require('node:test');
const assert = require('node:assert/strict');
const { search } = require('../src/catalog.cjs');
const russianTitle = '\u041f\u043e\u0432\u0435\u043b\u0438\u0442\u0435\u043b\u044c \u043c\u0443\u0445';
const claim = value => ({ mainsnak: { datavalue: { value } } });

test('Russian queries are not restricted to English and edition covers match the displayed edition', async () => {
  const calls = [];
  const result = await search('book', russianTitle, async input => {
    const url = new URL(input); calls.push(url);
    if (url.hostname === 'www.wikidata.org') return Response.json({ search: [] });
    if (url.hostname === 'openlibrary.org') {
      assert.equal(url.searchParams.get('lang'), 'ru');
      return Response.json({ docs: [
        { key: '/works/OL100W', title: 'Original title', cover_i: 1, editions: { docs: [{ title: russianTitle, cover_i: 2 }] } },
        { key: '/works/OL100W', title: 'An alternate catalog label', cover_i: 1 }
      ] });
    }
    assert.equal(url.searchParams.has('langRestrict'), false);
    return Response.json({ items: [] });
  }, 'en');
  assert.equal(calls.length, 3); assert.equal(result.length, 1); assert.equal(result[0].title, russianTitle); assert.match(result[0].cover, /\/2-L.jpg$/);
});

test('French UI language is passed as a preference without filtering other languages', async () => {
  const result = await search('book', 'The Little Prince', async input => {
    const url = new URL(input);
    if (url.hostname === 'openlibrary.org') { assert.equal(url.searchParams.get('lang'), 'fr'); return Response.json({ docs: [] }); }
    assert.equal(url.searchParams.has('langRestrict'), false);
    return Response.json({ items: [{ id: 'synthetic', volumeInfo: { title: 'Le Petit Prince', authors: ['Synthetic author'] } }] });
  }, 'fr');
  assert.equal(result[0].title, 'Le Petit Prince');
});

test('translated-title fallback follows verified work records when Google is rate limited', async () => {
  const calls = [];
  const result = await search('book', russianTitle, async input => {
    const url = new URL(input); calls.push(url);
    if (url.hostname === 'www.googleapis.com') return Response.json({ error: { message: 'Quota exceeded' } }, { status: 429 });
    if (url.pathname === '/search.json') return Response.json({ docs: [] });
    if (url.searchParams.get('action') === 'wbsearchentities') {
      assert.equal(url.searchParams.get('search'), russianTitle); assert.equal(url.searchParams.get('language'), 'ru');
      return Response.json({ search: [{ id: 'Q1' }, { id: 'Q2' }] });
    }
    if (url.searchParams.get('action') === 'wbgetentities') return Response.json({ entities: {
      Q1: { labels: { ru: { value: russianTitle } }, claims: { P648: [claim('OL100W')], P577: [claim({ time: '+1954-09-17T00:00:00Z' })] } },
      Q2: { labels: { ru: { value: 'Synthetic film' } }, claims: {} }
    } });
    if (url.pathname === '/works/OL100W.json') return Response.json({ key: '/works/OL100W', type: { key: '/type/redirect' }, location: '/works/OL200W' });
    if (url.pathname === '/works/OL200W.json') return Response.json({ key: '/works/OL200W', title: 'Original title', authors: [{ author: { key: '/authors/OL10A' } }], covers: [123], first_publish_date: '2006' });
    if (url.pathname === '/authors/OL10A.json') return Response.json({ name: 'Synthetic author' });
    throw new Error(`Unexpected catalog request: ${url}`);
  }, 'en');
  assert.equal(result.length, 1); assert.equal(result[0].title, russianTitle); assert.equal(result[0].creator, 'Synthetic author');
  assert.equal(result[0].sourceUrl, 'https://openlibrary.org/works/OL200W'); assert.match(result[0].cover, /\/123-L.jpg$/);
  assert.equal(result[0].year, '1954');
  assert.equal(calls.filter(u => u.pathname.startsWith('/works/')).length, 2);
});

test('translated author names can retrieve books from the canonical author catalog', async () => {
  const result = await search('book', 'Synthetic translated author', async input => {
    const url = new URL(input);
    if (url.pathname === '/search.json') return Response.json({ docs: [] });
    if (url.hostname === 'www.googleapis.com') return Response.json({ items: [] });
    if (url.searchParams.get('action') === 'wbsearchentities') return Response.json({ search: [{ id: 'Q10' }] });
    if (url.searchParams.get('action') === 'wbgetentities') return Response.json({ entities: { Q10: { labels: { fr: { value: 'Synthetic author' } }, claims: { P648: [claim('OL10A')] } } } });
    if (url.pathname === '/authors/OL10A.json') return Response.json({ key: '/authors/OL20A', name: 'Canonical author' });
    if (url.pathname === '/authors/OL20A/works.json') return Response.json({ entries: [{ key: '/works/OL100W', title: 'A real catalog record' }] });
    throw new Error('Unexpected request');
  }, 'fr');
  assert.equal(result[0].creator, 'Synthetic author'); assert.equal(result[0].title, 'A real catalog record');
});

test('an empty successful search differs from an unavailable catalog and rate limits back off', async () => {
  const empty = async input => new URL(input).hostname === 'www.wikidata.org' ? Response.json({ search: [] }) : Response.json({ docs: [], items: [] });
  assert.deepEqual(await search('book', 'Synthetic missing book', empty), []);
  let googleCalls = 0;
  const limited = async input => {
    const url = new URL(input);
    if (url.hostname === 'www.googleapis.com') { googleCalls++; return Response.json({ error: {} }, { status: 429, headers: { 'Retry-After': '120' } }); }
    return empty(input);
  };
  await assert.rejects(search('book', 'Synthetic missing book', limited), /temporarily unavailable/);
  await assert.rejects(search('book', 'Another missing book', limited), /temporarily unavailable/);
  assert.equal(googleCalls, 1);
});

test('untrusted external identifiers cannot become requests to arbitrary URLs', async () => {
  const calls = [];
  const result = await search('book', 'Synthetic unsafe metadata', async input => {
    const url = new URL(input); calls.push(url);
    if (url.hostname === 'www.wikidata.org') {
      if (url.searchParams.get('action') === 'wbsearchentities') return Response.json({ search: [{ id: 'Q1' }, { id: '../../private' }] });
      return Response.json({ entities: { Q1: { claims: { P648: [claim('https://evil.test/'), claim('../private'), claim('OL1W/../../private')] } } } });
    }
    return Response.json({ docs: [], items: [] });
  });
  assert.deepEqual(result, []); assert.equal(calls.length, 4);
  assert.equal(calls.every(u => ['openlibrary.org', 'www.googleapis.com', 'www.wikidata.org'].includes(u.hostname)), true);
});

test('catalog redirect loops and unsafe redirect locations stop without fetching them', async () => {
  for (const location of ['/works/OL100W', 'https://evil.test/private']) {
    const calls = [];
    await assert.rejects(search('book', 'Synthetic redirected work', async input => {
      const url = new URL(input); calls.push(url);
      if (url.hostname === 'www.wikidata.org') {
        if (url.searchParams.get('action') === 'wbsearchentities') return Response.json({ search: [{ id: 'Q1' }] });
        return Response.json({ entities: { Q1: { claims: { P648: [claim('OL100W')] } } } });
      }
      if (url.pathname === '/works/OL100W.json') return Response.json({ type: { key: '/type/redirect' }, location });
      return Response.json({ docs: [], items: [] });
    }), /temporarily unavailable/);
    assert.equal(calls.filter(u => u.pathname.startsWith('/works/')).length, 1);
    assert.equal(calls.every(u => u.protocol === 'https:' && ['openlibrary.org', 'www.googleapis.com', 'www.wikidata.org'].includes(u.hostname)), true);
  }
});
