# CGS — CeresGaiaSystems — MapTiler, MapLibre, NASA & Meteomatics

No accounts required inside CGS. A Next.js 15 / React 19 / Tailwind CSS prototype for choosing locations on satellite imagery and seeing source-labeled environmental data.

## Run it (Windows / PowerShell)

1. Get a MapTiler API key: https://cloud.maptiler.com/account/keys/
2. Get Meteomatics API credentials from the Space Apps Global Offer (username and password, not an API token): https://www.meteomatics.com/en/api/getting-started/
3. Extract this ZIP into a **new project folder**. Do not copy `node_modules` or `.next` from an older CGS version.
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

### Crop histories

Open **Crops** in the sidebar, select a saved field, and add crops with their planting dates (YYYY-MM-DD). Repeated crops are allowed, with no three-crop limit. All records are shown newest planting first. Existing three-crop histories are preserved with unknown planting dates, which can be filled in from the history. Each field's history is stored on this device alongside its saved geometry and snapshots, and survives field updates and page reloads. Fields saved before this feature simply start without a crop history.

`lib/crops.ts` defines seven crops with stable IDs, family, optimum temperature (Celsius), optimum **annual** rainfall (mm/year), growing duration (days, displayed as approximate months), soil pH, and individual FAO EcoCrop source links. These broad species ranges vary by cultivar and region. Annual rainfall must not be compared directly with seven-day rain totals or treated as irrigation demand. Growing duration is not a regional planting calendar. Future analysis can join each field's `cropHistory` records (`id`, `cropId`, `plantedOn`) via `cropId` to `CROPS`; missing histories remain missing rather than being inferred.

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


### Gemini field assistant

Open **AI Chat** in the left navigation. Select a saved field or use the selected map location. Questions include that field's location, radius, crop records and planting dates, freshly retrieved NASA POWER observations, and the Meteomatics forecast when configured. Switching fields starts a fresh chat; closing the panel retains the current chat in memory until reload. Only the most recent 19 messages are sent with each question.

Create an API key in [Google AI Studio](https://aistudio.google.com/api-keys) using a project on the **free tier** (do not enable billing if you want free-only usage), then add the following server-only values to `.env.local` and restart `npm run dev`:

```dotenv
GEMINI_API_KEY=your_actual_key
GEMINI_MODEL=gemini-3.5-flash-lite
```

The default model has a free tier according to [Google's pricing](https://ai.google.dev/gemini-api/docs/pricing). Availability and quotas depend on Google's project/region settings. The application does not enable billing, switch to paid models, use Google Search grounding, or automatically retry exhausted quotas. A key belonging to a billed project can still incur Google's normal API charges; free-tier status is controlled in Google AI Studio, not by a request flag.

Sending a question shares the conversation, field location, crop history, and environmental data with Google. Google says free-tier inputs and outputs may be used to improve its products; the chat displays this notice before sending. Keys remain on the server. Chat responses and the endpoint are not cached.

The assistant can request up to two additional NASA POWER daily history lookups per question, using fixed selected-field coordinates, an allowlist of temperature/humidity/rainfall/wind/solar parameters, and at most 366 days per lookup. Missing NASA values become null. Data tools cannot fetch arbitrary URLs. Source links are generated from successful data retrievals, and failures are supplied to Gemini explicitly. Instructions distinguish regional historical modeled observations from forecasts and user-entered crop data. Suggestions remain conditional when soil, cultivar, irrigation, or other required information is unknown.

Validation (Node 22.6+):

```powershell
node --experimental-strip-types --test tests/field-chat.test.mjs tests/crops.test.mjs
npm run typecheck
npm run build
```


### Suggestions and agricultural planning

Open **Suggestions** in the sidebar and select any registered field. Reports are generated from that field's exact coordinates, stored planting history and soil/management records. Each field is loaded on selection, avoiding unnecessary NASA and weather requests for every field at once. Recent reports remain in memory for one hour. **Regenerate** reruns the report with cached external data where applicable. This feature uses deterministic calculations and does not require a Gemini key.

**Field records:** expand **Field details** to explicitly mark an existing dated planting as currently growing, report its observed stage and irrigation availability, and optionally enter a root-zone volumetric moisture observation and a field-specific refill threshold. The most recent planting is never silently assumed active. Add soil-test records with sample date, lab/source, extraction method, depth, measured pH, organic matter, saturated-paste ECe, and optional N/P/K/Ca/Mg/S/Fe/Zn/B in mg/kg. Nutrient laboratory interpretations remain explicit; the app does not apply universal concentration thresholds across extraction methods. Dates, ranges, units and sources are validated. Records persist with saved fields and survive geometry/snapshot updates. Soil tests older than three years are excluded from scoring as a conservative CGS freshness policy, not a universal retesting interval.

**Reference database:** `lib/data/crop-agronomy.json` is the reusable crop agronomy catalog; `lib/agronomy.ts` supplies its types, version, sources and measurement validators. All seven existing crops have qualitative NPK demand, secondary/micronutrient considerations, organic-matter guidance, seasonal crop water references, drought sensitivity classes, mid-season crop coefficients and saturated-paste salinity thresholds. Existing EcoCrop pH/temperature/duration references remain in `lib/crops.ts`. Demand classes are screening categories, not kg/ha fertilizer rates. Uptake, harvest removal and fertilizer requirements are explicitly distinguished; harvested soybean nitrogen does not imply a guaranteed soil nitrogen surplus. Quantitative fertilizer advice requires local soil calibration, yield goals, amendments, residue exports and nutrient recovery data that CGS does not yet have.

**Climate:** `lib/climate-service.ts` retrieves the preceding 15 complete calendar years of NASA POWER daily AG data in three five-year chunks: mean/min/max air temperature (°C), precipitation (mm/day), relative humidity (%), wind (m/s), and solar radiation (MJ/m²/day). Successful chunks retain their retrieval time and are cached for 24 hours; failed chunks remain retryable and their missing years are disclosed. Coordinates are sent as the actual field location; source data remain regional modeled values, not field sensors. All calculations use UTC. Each monthly/yearly metric requires at least 90% of its expected daily records. Monthly climatology requires five valid years; linear trends require ten observations spanning at least nine years. Fill values become null and missing days are not interpolated. Partial yearly rain totals are identified by this coverage policy and should not be treated as complete observed totals.

The report shows annual temperature/rain/solar trends, hot days (maximum ≥35 °C), frost days (minimum <0 °C), and longest dry spells (rain <1 mm/day, interrupted by missing dates). These are defined screening indicators, not crop-specific extreme thresholds or a standardized drought index. Monthly rainfall variability and temperature/rain trends expose changes in rainfall timing and reliability. No climate model projections, statistical significance, or certainty about future weather are claimed.

**Scores:** `lib/recommendations.ts` defines seven transparent factors: historical climate 20%, observed-trend sensitivity 10%, soil chemistry compatibility 15%, measured nutrient compatibility 15%, rotation 20%, rainfed water screening 10%, and growing-window/extreme-temperature suitability 10%. Every factor explains its calculation in the UI. The observed-trend sensitivity factor applies one observed decade of temperature/rain change as a scenario; it is not a climate forecast. Drying penalties use the FAO drought sensitivity class, and increasing hot days/longest dry spells add disclosed screening penalties. Candidate months are screened using an approximate species-cycle length; winter/spring cultivar and local sowing dates still need verification. Users can select a particular target planting month.

Unknown factors contribute neither an invented score nor a neutral score. Partial pH/ECe or interpreted NPK evidence reduces that factor's effective weight. The overall score is the weighted mean of available evidence, with a separate factor-coverage percentage, low/moderate confidence, missing-input list and complete-evidence score bounds. Those bounds are missing-data ranges, not statistical intervals. Scores and Excellent/Good/Moderate/Poor labels are CGS decision-screening policies, not calibrated yield predictions. Same-crop/family penalties and a conservative three-year Solanaceae break flag rotation risks; disease-specific intervals need local advice. Low measured phosphorus plus repeated high-P-demand crops triggers a disclosed additional nutrient penalty. Crop history never becomes a calculated NPK mass balance.

**Current-crop advice:** Meteomatics provides the existing 24-hour, three-hourly temperature/humidity/wind/preceding-hour rain samples at actual field coordinates. Its cached response timestamp is preserved. Forecasts older than six hours are excluded. Sampled extremes can miss events, and preceding-hour rain at three-hour intervals is never summed as a complete forecast total. Weather warnings cover sampled frost, heat, heavy rain, high humidity and wind. Missing forecasts remain explicit.

`lib/water-service.ts` retrieves a separate recent seven-day complete temperature/rain period from NASA and estimates reference ET using temperature-based Hargreaves–Samani with extraterrestrial radiation, not a full Penman–Monteith water balance. NASA records older than 14 days are rejected for this estimate. If the user confirms mid-season, the crop reference Kc supplies a conditional historical crop-ET estimate. It never becomes an exact irrigation volume: effective rain, root-zone storage, rooting depth and irrigation efficiency remain required. Historical rain/ET, upcoming forecast samples and field-sensor moisture are kept distinct. Broad harvest windows use planting date plus the catalog's cycle range, with cultivar/stage/weather qualifications; expired active records are flagged for confirmation.

**Sources:** [NASA POWER daily API](https://power.larc.nasa.gov/docs/services/api/temporal/daily/), [FAO crop water requirements](https://www.fao.org/4/S2022E/s2022e07.htm), [FAO salinity tables](https://www.fao.org/4/y4263e/y4263e0e.htm), [FAO reference ET](https://www.fao.org/4/x0490e/x0490e07.htm), and crop-specific extension references linked in each catalog profile and report. API keys stay server-side. External failures return partial, explicitly provisional reports. Individual recommendations are never cached across fields on the server.

Run `npm run test:recommendations` for climate, rotation, chemistry, confidence, harvest, ET and forecast safeguards; run the existing tests and `npm run typecheck` / `npm run build` for integration checks. Synthetic climate series are confined to tests; no mock observations are used in application reports.
