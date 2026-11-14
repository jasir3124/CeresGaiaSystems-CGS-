# FieldShift V2 — MapTiler, MapLibre, NASA & Meteomatics

No accounts required inside FieldShift. A Next.js 15 / React 19 / Tailwind CSS prototype for choosing locations on satellite imagery and seeing source-labeled environmental data.

## Run it (Windows / PowerShell)

1. Get a MapTiler API key: https://cloud.maptiler.com/account/keys/
2. Get Meteomatics API credentials from the Space Apps Global Offer (username and password, not an API token): https://www.meteomatics.com/en/api/getting-started/
3. Extract this ZIP into a **new project folder**. Do not copy `node_modules` or `.next` from an older FieldShift version.
4. In the project folder run:

```powershell
npm install
Copy-Item .env.example .env.local
```

5. Edit `.env.local`:

```env
NEXT_PUBLIC_MAPTILER_KEY=YOUR_MAPTILER_KEY
METEOMATICS_USERNAME=YOUR_METEOMATICS_USERNAME
METEOMATICS_PASSWORD=YOUR_METEOMATICS_PASSWORD
```

6. Run `npm run dev` and open http://localhost:3000. Restart Next.js whenever you modify `.env.local`.

### Keys and privacy

- `NEXT_PUBLIC_MAPTILER_KEY` is a *public* browser-side map key. Apply allowed-origin restrictions for production.
- **Meteomatics username/password must never use a `NEXT_PUBLIC_` prefix.** They're only read in the server-side `/api/weather` route. Do not commit `.env.local` to Git.
- NASA POWER and GIBS endpoints used here do not require a key.
- Local saved fields are **only stored in your browser's `localStorage`**, not sent to an application database. They will be lost if the browser's site data is cleared; they're not synced between devices.

## What changed since V1

- **Meteomatics:** `/api/weather` fetches a 24-hour weather time series (3-hour steps) with temperature, relative humidity, 10 m wind, wind direction, and precipitation over the preceding hour. Forecast appears in the overview, separate from historical NASA data. If credentials are missing or unavailable, it shows a configured/unavailable message rather than made-up values. Backend fetch caching is ~1 hour per approximate 0.01° point to conserve your subscription quota. This does **not** make Meteomatics weather a raster map overlay; the existing map overlays remain NASA GIBS.
- **NASA surface soil wetness:** NASA POWER HY `GWETTOP` is checked for actual valid fraction values. If missing or rejected, we request NASA POWER HY `SFMC` (volumetric surface moisture). The UI changes its name to *Surface soil moisture* when it shows `SFMC`, because the two measurements are different. If neither is available, the card stays blank and displays the error/availability explanation. The original V1 silently swallowed hydrology failures.
- **Save field:** name a selection and click **Save field to this device**. The **Fields** sidebar button lists saved fields and lets you reselect or delete them. Records include coordinates, radius, NASA overview JSON, Meteomatics forecast JSON, and save timestamps. The last active saved field is automatically reopened on reload. New API results enrich saved records even if Save was clicked while loading.
- **Future Crops support:** `useFields()` from `lib/field-store.tsx` shares saved state through `FieldsProvider` in `app/layout.tsx`. Crops can read `fields` and `activeFieldId` without new API requests.
- **Single NASA overlay:** selecting a rainfall, soil moisture, vegetation, temperature, or wind layer turns off the old layer. Clicking the active layer disables it.
- **Simplified UI:** the square bounding-box toggle, coordinate copying, and on-map square outline are gone. NASA GIBS region-image requests *still* use internal bounding boxes. The long yellow disclaimer is removed, but individual data dates and source definitions remain accessible under **About data sources**.
- **Close versus clear:** the overview's X now closes only the panel. The selected pin/radius remain; use **Overview** or **View area overview** to return. A separate “Clear selection from map” control removes the temporary pin without deleting any stored field.

## Data flows

| Purpose | Source | Query geometry |
| --- | --- | --- |
| Basemap imagery, map styles, geocoding | MapTiler via MapLibre | Map tiles / map search |
| Historical air temperature, humidity, precipitation, wind, solar | NASA POWER Daily AG | Nearby ~0.5° grid coordinate |
| Historical surface wetness / volumetric moisture | NASA POWER Daily HY (`GWETTOP` / `SFMC`) | Nearby ~0.5° grid coordinate |
| Rain, soil moisture, vegetation, heat, historical wind imagery | NASA GIBS WMS | Map raster tiles, dynamically dated |
| Area-specific NASA GIBS thumbnail | NASA GIBS WMS GetMap | Internal bounds from selected pin & radius |
| Forecast temperature, humidity, wind, rain | Meteomatics Weather API | Approximate 0.01° query location |

**Scientific accuracy:** NASA POWER and GIBS don't provide direct measurements at individual 25–100 m fields. Their model/grid resolution and latest available dates are shown in context. Meteomatics represents current or forecast weather estimates, not in-field sensors. A point query is not a spatial average of the chosen circle.

## API routes

- `GET /api/nasa/overview?lat=42.009&lng=20.995`
- `GET /api/nasa/layers`
- `GET /api/nasa/region-image?layer=soil&date=...&west=...&south=...&east=...&north=...`
- `GET /api/weather?lat=42.009&lng=20.995`

## Development checks

```powershell
npm run test:geo
npm run typecheck
npm run build
```

The geometry tests and TypeScript syntax-level tests passed when this package was produced. A complete Next.js build and external NASA/Meteomatics API integration test were not possible in the packaging environment because package installation timed out. Run `npm install` followed by the checks above on your machine.

## Upstream documentation

- NASA POWER daily API: https://power.larc.nasa.gov/docs/services/api/temporal/daily/
- NASA POWER hydrology parameters: https://power.larc.nasa.gov/docs/methodology/data/sources_hydrology/
- Meteomatics API structure / authentication: https://www.meteomatics.com/en/api/getting-started/
- Meteomatics JSON response: https://www.meteomatics.com/en/api/response/json/
- MapTiler: https://docs.maptiler.com/cloud/api/reference/
