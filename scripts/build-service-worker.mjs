import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(join(directory, entry.name)) : join(directory, entry.name)))).flat();
}
const build = (await readFile('.next/BUILD_ID', 'utf8')).trim();
const assets = (await files('.next/static')).filter(path => /\.(js|css|woff2?)$/.test(path)).map(path => '/_next/static/' + path.replaceAll('\\', '/').split('/static/')[1]);
const template = await readFile('scripts/service-worker.js', 'utf8');
await writeFile('public/sw.js', template.replace('__BUILD_ID__', JSON.stringify(build)).replace('__PRECACHE__', JSON.stringify(['/', '/manifest.webmanifest', '/brand/cgs-logo.png', '/favicon.ico', '/pwa/icon-192.png', '/pwa/icon-512.png', ...assets])));
console.log(`Offline app shell prepared: ${assets.length} build assets.`);
