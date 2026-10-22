const { test } = require('node:test');
const assert = require('node:assert/strict');
const { complete, models } = require('../src/inference.cjs');
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
