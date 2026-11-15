import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const code = readFileSync(new URL('../scripts/service-worker.js', import.meta.url), 'utf8').replace('__BUILD_ID__', '"test-build"').replace('__PRECACHE__', JSON.stringify(['/', '/_next/static/app.js', '/brand/cgs-logo.png']));
function worker() {
  const handlers = {}, deleted = [], stored = [];
  const shell = new Response('offline shell');
  const assets = new Map([['/', shell], ['/_next/static/app.js', new Response('app code')]]);
  const cache = { addAll: async urls => stored.push(...urls), match: async path => assets.get(path) };
  const context = {
    self: { location: { origin: 'https://cgs.test' }, clients: { claim: async () => {} }, addEventListener: (name, handler) => { handlers[name] = handler; } },
    caches: { open: async () => cache, match: async key => assets.get(key), keys: async () => ['unrelated-cache', 'cgs-shell-old', 'cgs-shell-test-build'], delete: async key => deleted.push(key) },
    fetch: async () => { throw new Error('Offline'); }, URL, Response
  };
  vm.runInNewContext(code, context);
  return { handlers, deleted, stored, shell };
}
it('prepares the shell and cleans only obsolete CGS app caches', async () => {
  const state = worker(); let pending;
  state.handlers.install({ waitUntil: promise => { pending = promise; } }); await pending;
  assert.deepEqual(state.stored, ['/', '/_next/static/app.js', '/brand/cgs-logo.png']);
  state.handlers.activate({ waitUntil: promise => { pending = promise; } }); await pending;
  assert.deepEqual(state.deleted, ['cgs-shell-old']);
});
it('reopens offline and serves downloaded code without the network', async () => {
  const state = worker(); let response;
  state.handlers.fetch({ request: { method: 'GET', url: 'https://cgs.test/', mode: 'navigate' }, respondWith: value => { response = value; } });
  assert.equal(await (await response).text(), 'offline shell');
  state.handlers.fetch({ request: { method: 'GET', url: 'https://cgs.test/_next/static/app.js' }, respondWith: value => { response = value; } });
  assert.equal(await (await response).text(), 'app code');
});
it('does not intercept map tiles, imagery, APIs or POST requests', () => {
  const state = worker(); let intercepted = false;
  for (const request of [
    { method: 'GET', url: 'https://api.maptiler.com/tiles/1/2/3.jpg' },
    { method: 'GET', url: 'https://gibs.earthdata.nasa.gov/image.png' },
    { method: 'GET', url: 'https://cgs.test/api/nasa/overview?lat=42&lng=21' },
    { method: 'POST', url: 'https://cgs.test/api/recommendations' }
  ]) state.handlers.fetch({ request, respondWith: () => { intercepted = true; } });
  assert.equal(intercepted, false);
});
