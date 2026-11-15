# Installable app and offline access

Run `npm run build` then `npm start`. The build generates `public/sw.js` from the current build assets. Deploy using HTTPS (localhost also supports service workers). Offline registration is intentionally disabled under `npm run dev` so stale service workers do not interfere with development.

Open the production app online once and let offline preparation finish. Chrome/Edge can offer **Install CGS app** when their install criteria are met. Other browsers can use their Install/Add to Home Screen menu; on iOS use Safari > Share > Add to Home Screen.

Saved fields, crop history, soil tests and management records continue to use the existing per-field localStorage records. Previously opened detailed history and generated suggestions are also stored in IndexedDB. Suggestions are keyed by the exact field inputs and planting month, so changing inputs offline never displays old suggestions as if they were recalculated. Reconnect to generate updated suggestions.

Offline mode hides the map and its controls. No map tiles or satellite imagery are cached. A message explains what remains available and includes a **Never show again** checkbox, remembered on the current browser/device. AI chat, map search and fresh observations require internet.

The app caches its production HTML, JavaScript, CSS, logo and installation icons. Updates activate after existing app windows close. Browser storage can be removed by clearing site data or by browser storage pressure; installation does not constitute a cloud backup. Keep the same origin when deploying updates so stored fields remain available.

Checks:
- `node --test tests/pwa-service-worker.test.mjs`
- `node tests/pwa-browser.mjs http://localhost:3107` against a running production server; requires Chrome on Windows, or set CHROME_PATH. Uses an isolated temporary profile and synthetic API fixtures, not user fields.
