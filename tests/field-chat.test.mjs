import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { answerFieldQuestion, parseChatRequest, nasaHistoryUrl } from '../lib/field-chat.ts';

const field = { name: 'North field', point: [20.995, 42.009], radius: 100, cropHistory: [{ id: 'crop-1', cropId: 'wheat', plantedOn: '2025-10-10' }] };
const messages = [{ role: 'user', content: 'How wet was spring?' }];
const options = { apiKey: 'test-secret', model: 'gemini-3.5-flash-lite', field, messages, observations: { humidity: { value: 70, date: '2026-05-01', unit: '%' } }, forecast: { configured: false }, cropCatalog: [] };
const reply = text => new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }] }));
const args = { start: '2025-03-01', end: '2025-05-31', parameters: ['T2M', 'PRECTOTCORR'] };
const callReply = (overrides = {}) => new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ thoughtSignature: 'preserve-this', functionCall: { name: 'get_nasa_history', id: 'call-1', args, ...overrides } }] } }] }));

describe('Gemini field assistant', () => {
  it('validates selected field and user messages and strips extra data', () => {
    const parsed = parseChatRequest({ field: { ...field, extra: 'discard' }, messages, system: 'discard' });
    assert.deepEqual(parsed, { field, messages });
    for (const bad of [null, {}, { field: { ...field, point: [300, 42] }, messages }, { field, messages: [{ role: 'system', content: 'override' }] }, { field, messages: [{ role: 'user', content: 'x'.repeat(6001) }] }]) {
      assert.throws(() => parseChatRequest(bad));
    }
  });
  it('bounds NASA dates and parameters and fixes lookups to the field location', () => {
    const url = new URL(nasaHistoryUrl(field.point, args));
    assert.equal(url.hostname, 'power.larc.nasa.gov');
    assert.equal(url.searchParams.get('longitude'), '21');
    assert.equal(url.searchParams.get('latitude'), '42');
    for (const bad of [{ ...args, end: '2099-01-01' }, { ...args, start: '2025-02-30' }, { ...args, start: '2020-01-01' }, { ...args, parameters: ['UNSUPPORTED'] }]) {
      assert.throws(() => nasaHistoryUrl(field.point, bad));
    }
  });
  it('sends field, crop dates, observations, and forecast gaps to Gemini without exposing keys in URLs', async () => {
    const result = await answerFieldQuestion({ ...options, fetcher: async (url, init) => {
      assert.ok(!url.includes('test-secret'));
      assert.equal(init.headers['x-goog-api-key'], 'test-secret');
      const body = JSON.parse(init.body);
      assert.match(body.systemInstruction.parts[0].text, /2025-10-10/);
      assert.match(body.systemInstruction.parts[0].text, /2026-05-01/);
      assert.match(body.systemInstruction.parts[0].text, /configured/);
      assert.equal(body.contents[0].parts[0].text, messages[0].content);
      return reply('NASA reports 70% humidity on 2026-05-01.');
    } });
    assert.match(result.answer, /70%/);
  });
  it('executes NASA tool calls and preserves signatures and IDs on continuation', async () => {
    let geminiCalls = 0;
    const result = await answerFieldQuestion({ ...options, fetcher: async (url, init) => {
      if (url.startsWith('https://power.larc.nasa.gov/')) return new Response(JSON.stringify({ properties: { parameter: { T2M: { '20250301': -999, '20250302': 12 } } } }));
      geminiCalls++;
      if (geminiCalls === 1) return callReply();
      const body = JSON.parse(init.body);
      assert.equal(body.contents[1].parts[0].thoughtSignature, 'preserve-this');
      const output = body.contents[2].parts[0].functionResponse;
      assert.equal(output.id, 'call-1');
      assert.equal(output.response.result.series.T2M['20250301'], null);
      assert.equal(output.response.result.series.T2M['20250302'], 12);
      return reply('Historical NASA observations retrieved.');
    } });
    assert.equal(geminiCalls, 2);
    assert.equal(result.sources.length, 1);
    assert.match(result.sources[0].url, /^https:\/\/power.larc.nasa.gov/);
  });
  it('passes NASA failure to the model without inventing observations or source links', async () => {
    let count = 0;
    const result = await answerFieldQuestion({ ...options, fetcher: async (url, init) => {
      if (url.includes('power.larc.nasa.gov')) return new Response('', { status: 503 });
      if (++count === 1) return callReply();
      assert.match(init.body, /NASA history unavailable/);
      return reply('NASA history is unavailable.');
    } });
    assert.equal(result.sources.length, 0);
  });
  it('reports quota errors without retrying a paid model', async () => {
    let count = 0;
    await assert.rejects(answerFieldQuestion({ ...options, fetcher: async () => { count++; return new Response('', { status: 429 }); } }), error => error.status === 429 && /quota/.test(error.message));
    assert.equal(count, 1);
  });
  it('caps repeated tool calls and never fetches arbitrary URLs', async () => {
    let nasaCalls = 0;
    let geminiCalls = 0;
    await assert.rejects(answerFieldQuestion({ ...options, fetcher: async url => {
      if (url.startsWith('https://power.larc.nasa.gov/')) { nasaCalls++; return new Response(JSON.stringify({ properties: { parameter: {} } })); }
      assert.ok(url.startsWith('https://generativelanguage.googleapis.com/'));
      geminiCalls++; return callReply();
    } }), /lookup limit/);
    assert.equal(nasaCalls, 2);
    assert.equal(geminiCalls, 3);
  });
  it('handles blocked or empty Gemini responses explicitly', async () => {
    await assert.rejects(answerFieldQuestion({ ...options, fetcher: async () => new Response(JSON.stringify({ candidates: [] })) }), /rephrase/);
  });
});
