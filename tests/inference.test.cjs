const { test } = require('node:test');
const assert = require('node:assert/strict');
const { complete, models } = require('../src/inference.cjs');
const { recommend } = require('../src/inference.cjs');
function stream(events) { return new Response(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } }); }
test('Responses uses the public endpoint, OAuth token, no storage, and required streaming', async () => {
  const result = await complete({ accessToken: 'synthetic-test-token', model: 'account-model', instructions: 'test', input: { chosen: 'synthetic' }, fetcher: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses'); assert.equal(options.headers.Authorization, 'Bearer synthetic-test-token');
    const body = JSON.parse(options.body); assert.equal(body.store, false); assert.equal(body.stream, true); assert.ok(Array.isArray(body.input));
    for (const unsupported of ['temperature', 'max_output_tokens', 'previous_response_id', 'conversation', 'metadata', 'background']) assert.equal(unsupported in body, false);
    return stream([{ type: 'response.output_text.delta', delta: '{"ok":true}' }, { type: 'response.completed' }]);
  } });
  assert.deepEqual(result, { ok: true });
});
test('partial output and a late usage-limit error never count as successful inference', async () => {
  const args = { accessToken: 'synthetic-test-token', model: 'test', instructions: '', input: {} };
  await assert.rejects(complete({ ...args, fetcher: async () => stream([{ type: 'response.output_text.delta', delta: '{"ok":true}' }]) }), /interrupted/);
  await assert.rejects(complete({ ...args, fetcher: async () => stream([{ type: 'response.output_text.delta', delta: '{"ok":true}' }, { type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } } }]) }), /usage limit/);
  await assert.rejects(complete({ ...args, fetcher: async () => stream([{ type: 'response.incomplete' }]) }), /did not complete/);
});
test('model picker preserves account catalog ordering and filters hidden models', async () => {
  const list = await models('synthetic', async () => Response.json({ models: [{ slug: 'first', display_name: 'First', visibility: 'list' }, { slug: 'hidden', visibility: 'hide' }, { slug: 'second', display_name: 'Second', visibility: 'list' }] }));
  assert.deepEqual(list.map(m => m.id), ['first', 'second']);
});
test('discovery searches live catalogs and saves only grounded, retrieved candidates', async () => {
  let turns = 0; const catalogQueries = [];
  const data = { sources: [{ id: 'chosen', title: 'Synthetic reading context', body: 'I enjoy strange, atmospheric fiction.' }], materials: [], dismissed: [] };
  const fetcher = async (url, options) => {
    if (String(url).includes('/v1/responses')) {
      turns++;
      const request = JSON.parse(options.body); assert.match(request.instructions, /in French/);
      const result = turns === 1 ? { summary: 'Atmospheric fiction for enjoyment.', titles: ['A synthetic catalog title'], queries: [] } : { intro: 'A quiet next story.', picks: [
        { candidateId: 'candidate-0', reason: 'It fits the atmospheric reading request.', experience: 'A curious imagined world.', caveat: 'Slowly paced.', evidenceIds: ['source:chosen'] },
        { candidateId: 'invented-id', reason: 'Not a real candidate.', evidenceIds: ['source:chosen'] }
      ] };
      return stream([{ type: 'response.output_text.delta', delta: JSON.stringify(result) }, { type: 'response.completed' }]);
    }
    catalogQueries.push(String(url));
    if (String(url).includes('openlibrary.org')) return Response.json({ docs: [{ key: '/works/OL_SYNTHETIC', title: 'A synthetic catalog title', author_name: ['Synthetic author'] }] });
    return Response.json({ items: [] });
  };
  const result = await recommend({ data, accessToken: 'synthetic', model: 'test', language: 'fr', fetcher });
  assert.equal(turns, 2); assert.equal(result.picks.length, 1); assert.equal(result.picks[0].title, 'A synthetic catalog title');
  assert.equal(result.picks[0].evidence[0].id, 'source:chosen');
  assert.ok(catalogQueries.length); assert.equal(catalogQueries.some(q => q.includes('atmospheric')), false);
});
