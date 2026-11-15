// Documentation capture uses the isolated browser fixtures; no user field records are read.
// End-to-end check against a production server, in an isolated Chrome profile.
// Usage: node tests/pwa-browser.mjs http://localhost:3107
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const origin = process.argv[2] || 'http://localhost:3107';
const profile = await mkdtemp(join(tmpdir(), 'cgs-pwa-browser-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
for (const name of ['crops', 'agronomy', 'climate', 'recommendations', 'crop-rotation']) {
  const source = (await readFile(new URL(`../lib/${name}.ts`, import.meta.url), 'utf8')).replace("import cropProfiles from './data/crop-agronomy.json';", `const cropProfiles = ${await readFile(new URL('../lib/data/crop-agronomy.json', import.meta.url), 'utf8')};`);
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/from ['"]\.\/([^'"]+)['"]/g, 'from "./$1.mjs"');
  await writeFile(join(profile, `${name}.mjs`), output);
}
const { generateRecommendations } = await import(pathToFileURL(join(profile, 'recommendations.mjs')));
const { generateRotationPlan } = await import(pathToFileURL(join(profile, 'crop-rotation.mjs')));
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
  const until = async (expression, label) => { const end = Date.now() + 30000; while (Date.now() < end) { if (await evaluate(`Boolean(${expression})`)) return; await new Promise(resolve => setTimeout(resolve, 200)); } console.log(await evaluate(`JSON.stringify({url:location.href,body:document.body?.innerText.slice(0,2000),sw:'serviceWorker' in navigator})`)); throw new Error(`Timed out: ${label}`); };
  const measurement = { value: 15, date: '2026-11-10', unit: '°C' };
  const nasa = { point: [21, 42], sampledPoint: [21, 42], latestWeatherDate: '2026-11-10', temperature: measurement, humidity: { ...measurement, unit: '%' }, windSpeed: { ...measurement, unit: 'm/s' }, windDirection: { ...measurement, unit: '°' }, soilWetness: { ...measurement, value: 60, unit: '%' }, solarRadiation: { ...measurement, unit: 'MJ/m²/day' }, rainfallSevenDays: { ...measurement, unit: 'mm', daysAvailable: 7, start: '2026-11-04', end: '2026-11-10' }, daily: [{ date: '2026-11-09', precipitation: 2, temperature: 12, soilWetness: 59 }, { date: '2026-11-10', precipitation: 3, temperature: 15, soilWetness: 60 }], source: 'Test NASA fixture', note: 'Test fixture' };
  const apiRequests = [];
  const suggestionInputs = [];
  const climate = { start: '2011-01-01', end: '2025-12-31', yearsRequested: 15, yearsUsable: 15, months: Array.from({ length: 12 }, (_, index) => ({ month: index + 1, years: 15, temperature: 20, minimum: 12, maximum: 28, rain: 60, humidity: 60, wind: 2, solar: 15, frostDays: 0, hotDays: 0, dryDays: 10, rainCv: 0.3, rainTrendPerDecade: -2, temperatureTrendPerDecade: 0.3 })), annual: Array.from({ length: 15 }, (_, i) => ({ year: 2011 + i, temperature: 12 + i * 0.1, rain: 700 - i * 2, hotDays: i, frostDays: 5, longestDrySpell: 10 })), trends: { temperaturePerDecade: 1, rainPerDecade: -20, hotDaysPerDecade: 10, frostDaysPerDecade: 0, drySpellDaysPerDecade: 0, solarPerDecade: 0 } };
  listeners.push(message => {
    if (message.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = message.params;
    const url = new URL(request.url);
    apiRequests.push(url.pathname);
    let body = url.pathname.includes('overview') ? nasa : url.pathname.includes('layers') ? { layers: [] } : { configured: false };
    if (url.pathname === '/api/recommendations') { const input = JSON.parse(request.postData); suggestionInputs.push(input); body = { ...generateRecommendations({ field: input.field, climate, weather: null, overview: nasa, targetMonth: input.targetMonth }), rotation: generateRotationPlan({ field: input.field, climate, targetMonth: input.targetMonth }), dataErrors: [], sources: [], catalogVersion: 'test' }; }
    void page('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(body)).toString('base64') }).catch(error => { if (!closing && !error.message.includes('Invalid InterceptionId')) console.error(error); });
  });
  await page('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1100, deviceScaleFactor: 1, mobile: false });
  await page('Network.enable');
  await page('Fetch.enable', { patterns: [{ urlPattern: `${origin}/api/*` }] });
  console.log('Opening production app');
  await page('Page.navigate', { url: origin });
  await until("document.querySelector('nav') && navigator.serviceWorker.controller", 'app and offline shell ready');
  console.log('Offline shell ready');
  const manifest = await evaluate("fetch('/manifest.webmanifest').then(r=>r.json())");
  assert.equal(manifest.display, 'standalone'); assert.equal(manifest.icons.length, 3);
  const fixture = { id: 'offline-field-a', name: 'North field', point: [21, 42], radius: 500, cropHistory: [{ id: 'crop-2023', cropId: 'maize', plantedOn: '2023-04-15' }, { id: 'crop-2024', cropId: 'wheat', plantedOn: '2024-10-01' }, { id: 'crop-2025', cropId: 'potato', plantedOn: '2025-04-10' }], soilTests: [{ id: 'lab-baseline', sampledOn: '2026-10-01', source: 'Synthetic test lab', method: 'Synthetic test method', depthCm: 20, ph: 6.2, salinityEce: 0.5, nutrients: Object.fromEntries(['nitrogen','phosphorus','potassium','calcium','magnesium','sulfur','iron','zinc','boron'].map(key => [key, { value: 10, unit: 'mg/kg', interpretation: 'sufficient' }])) }], placeLabel: null, weather: null, nasa, savedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await evaluate(`localStorage.setItem('fieldshift.fields.v1', JSON.stringify(${JSON.stringify([fixture, { ...fixture, id: 'offline-field-b', name: 'South field', point: [22, 43] }])})); localStorage.setItem('fieldshift.active-field.v1','offline-field-a')`);
  await page('Page.reload');
  await until("document.querySelector('#field-name')?.value === 'North field'", 'saved field hydration');
  await new Promise(resolve => setTimeout(resolve, 4500));
  await writeFile(new URL('../docs/images/overview.webp', import.meta.url), Buffer.from((await page('Page.captureScreenshot', { format: 'webp', quality: 86 })).data, 'base64'));
  await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('View more data')).click()");
  await until("document.querySelector('#field-data-title') && !document.body.textContent.includes('Loading NASA observations')", 'download history');
  await evaluate("document.querySelector('[aria-label=\"Close field data\"]').click(); document.querySelector('button[title=\"Suggestions\"]').click()");
  await until("document.body.textContent.includes('Crop reference version test')", 'saved recommendations');
  assert.equal(await evaluate("document.querySelector('#rotation-title').closest('section').querySelectorAll('ol')[1]?.children.length"), 3);
  assert.equal(await evaluate("Boolean(document.querySelector('#rotation-title').compareDocumentPosition(document.querySelector('.crop-group')) & Node.DOCUMENT_POSITION_FOLLOWING)"), true);
  assert.equal(await evaluate("Array.from(document.querySelector('#rotation-title').closest('section').querySelectorAll('tbody tr')).length"), 9);
  console.log('PASS: real rotation engine renders three ordered crops before suitability groups and displays all nine measured nutrients.');
  await evaluate("document.querySelector('#rotation-title').closest('section').scrollIntoView({block:'start'})");
  await new Promise(resolve => setTimeout(resolve, 200));
  await writeFile(new URL('../docs/images/rotations.webp', import.meta.url), Buffer.from((await page('Page.captureScreenshot', { format: 'webp', quality: 86 })).data, 'base64'));
  await evaluate("Array.from(document.querySelectorAll('summary')).find(element=>element.textContent==='Climate adaptation and seasonal evidence').scrollIntoView({block:'start'})");
  await new Promise(resolve => setTimeout(resolve, 300));
  await writeFile(new URL('../docs/images/climate.webp', import.meta.url), Buffer.from((await page('Page.captureScreenshot', { format: 'webp', quality: 86 })).data, 'base64'));
  console.log('Saved README screenshots with isolated demonstration data.');
} finally {
  closing = true;
  socket?.close();
  chrome.kill();
}
