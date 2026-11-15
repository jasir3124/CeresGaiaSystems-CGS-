// End-to-end check against a production server, in an isolated Chrome profile.
// Usage: node tests/pwa-browser.mjs http://localhost:3107
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const origin = process.argv[2] || 'http://localhost:3107';
const profile = await mkdtemp(join(tmpdir(), 'cgs-pwa-browser-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
let closing = false;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let log = '';
    const timer = setTimeout(() => reject(new Error('Chrome did not start')), 20000);
    chrome.on('error', reject);
    chrome.stderr.on('data', chunk => { log += chunk; const match = log.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
  });
  console.log('Chrome started');
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  const listeners = [];
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) { const task = pending.get(message.id); pending.delete(message.id); if (task) message.error ? task.reject(new Error(JSON.stringify(message.error))) : task.resolve(message.result); }
    else for (const listener of listeners) listener(message);
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const key = ++id; const timer = setTimeout(() => { pending.delete(key); reject(new Error(`CDP timeout: ${method}`)); }, 20000); timer.unref(); pending.set(key, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } }); socket.send(JSON.stringify({ id: key, method, params, ...(sessionId ? { sessionId } : {}) })); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const page = (method, params) => send(method, params, sessionId);
  const evaluate = async expression => { const result = await page('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
  const until = async (expression, label) => { const end = Date.now() + 30000; while (Date.now() < end) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 200)); } console.log(await evaluate(`JSON.stringify({url:location.href,body:document.body?.innerText.slice(0,2000),sw:'serviceWorker' in navigator})`)); throw new Error(`Timed out: ${label}`); };
  const measurement = { value: 15, date: '2026-11-10', unit: '°C' };
  const nasa = { point: [21, 42], sampledPoint: [21, 42], latestWeatherDate: '2026-11-10', temperature: measurement, humidity: { ...measurement, unit: '%' }, windSpeed: { ...measurement, unit: 'm/s' }, windDirection: { ...measurement, unit: '°' }, soilWetness: { ...measurement, value: 60, unit: '%' }, solarRadiation: { ...measurement, unit: 'MJ/m²/day' }, rainfallSevenDays: { ...measurement, unit: 'mm', daysAvailable: 7, start: '2026-11-04', end: '2026-11-10' }, daily: [{ date: '2026-11-09', precipitation: 2, temperature: 12, soilWetness: 59 }, { date: '2026-11-10', precipitation: 3, temperature: 15, soilWetness: 60 }], source: 'Test NASA fixture', note: 'Test fixture' };
  const apiRequests = [];
  listeners.push(message => {
    if (message.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = message.params;
    const url = new URL(request.url);
    apiRequests.push(url.pathname);
    let body = url.pathname.includes('overview') ? nasa : url.pathname.includes('layers') ? { layers: [] } : { configured: false };
    if (url.pathname === '/api/recommendations') { const input = JSON.parse(request.postData); body = { fieldId: input.field.id, point: input.field.point, generatedAt: new Date().toISOString(), ranked: [], current: null, gaps: [], climateNotes: [], dataErrors: [], sources: [], catalogVersion: 'test', forecastThrough: null }; }
    void page('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(body)).toString('base64') }).catch(error => { if (!closing && !error.message.includes('Invalid InterceptionId')) console.error(error); });
  });
  await page('Network.enable');
  await page('Network.setBlockedURLs', { urls: ['*api.maptiler.com*', '*gibs.earthdata.nasa.gov*'] });
  await page('Fetch.enable', { patterns: [{ urlPattern: `${origin}/api/*` }] });
  console.log('Opening production app');
  await page('Page.navigate', { url: origin });
  await until("document.querySelector('nav') && navigator.serviceWorker.controller", 'app and offline shell ready');
  console.log('Offline shell ready');
  const manifest = await evaluate("fetch('/manifest.webmanifest').then(r=>r.json())");
  assert.equal(manifest.display, 'standalone'); assert.equal(manifest.icons.length, 3);
  const fixture = { id: 'offline-field-a', name: 'Offline field A', point: [21, 42], radius: 100, cropHistory: [], soilTests: [], placeLabel: null, weather: null, nasa, savedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await evaluate(`localStorage.setItem('fieldshift.fields.v1', JSON.stringify(${JSON.stringify([fixture, { ...fixture, id: 'offline-field-b', name: 'Offline field B', point: [22, 43] }])})); localStorage.setItem('fieldshift.active-field.v1','offline-field-a')`);
  await page('Page.reload');
  await until("document.querySelector('#field-name')?.value === 'Offline field A'", 'saved field hydration');
  await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('View more data')).click()");
  await until("document.querySelector('#field-data-title') && !document.body.textContent.includes('Loading NASA observations')", 'download history');
  await evaluate("document.querySelector('[aria-label=\"Close field data\"]').click(); document.querySelector('button[title=\"Suggestions\"]').click()");
  await until("document.body.textContent.includes('Crop reference version test')", 'saved recommendations');
  await evaluate("document.querySelector('[aria-label=\"Close suggestions\"]').click()");
  const cachedUrls = await evaluate("caches.keys().then(async keys=>(await Promise.all(keys.map(async key=>(await (await caches.open(key)).keys()).map(r=>r.url)))).flat())");
  assert.ok(cachedUrls.length > 10); assert.ok(cachedUrls.every(url => new URL(url).origin === origin));
  console.log('Switching offline');
  await page('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await until("document.body.textContent.includes('You can keep using CGS offline')", 'offline message');
  assert.equal(await evaluate("document.querySelector('.maplibregl-map') === null"), true);
  await evaluate("document.querySelector('[aria-labelledby=\"offline-notice-title\"] input').click(); Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Continue offline').click()");
  await page('Page.reload');
  await until("document.querySelector('#field-name')?.value === 'Offline field A'", 'cold offline reload');
  assert.equal(await evaluate("document.querySelector('#offline-notice-title') === null"), true);
  assert.equal(await evaluate("document.querySelector('.maplibregl-map') === null"), true);
  await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('View more data')).click()");
  await until("document.body.textContent.includes('3 mm') || document.body.textContent.includes('total across 2 observed days')", 'offline history');
  await evaluate("document.querySelector('[aria-label=\"Close field data\"]').click(); document.querySelector('button[title=\"Suggestions\"]').click()");
  await until("document.body.textContent.includes('Crop reference version test')", 'offline recommendations');
  await evaluate("document.querySelector('[aria-label=\"Close suggestions\"]').click(); document.querySelector('button[title=\"Saved fields\"]').click()");
  await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.querySelector('strong')?.textContent==='Offline field B').click()");
  await until("document.querySelector('#field-name')?.value === 'Offline field B'", 'switch fields offline');
  await evaluate("const input=document.querySelector('#field-name'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Offline field B edited'); input.dispatchEvent(new Event('input',{bubbles:true}));");
  await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Update saved field')).click()");
  const saved = await evaluate("JSON.parse(localStorage.getItem('fieldshift.fields.v1'))");
  assert.equal(saved.find(field => field.id === 'offline-field-a').name, 'Offline field A');
  assert.equal(saved.find(field => field.id === 'offline-field-b').name, 'Offline field B edited');
  console.log('PASS: manifest, service-worker precache, offline reload, hidden map, never-show-again persistence, offline history/recommendations, and isolated per-field edits.');
  await page('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await until('navigator.onLine', 'reconnect');
} finally {
  closing = true;
  socket?.close();
  chrome.kill();
}
