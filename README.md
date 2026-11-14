# FieldShift — NASA Earth data explorer (V1)

**No accounts. No saved fields. No crop recommendations or chat.** A map-first agriculture explorer modeled on the reference screenshot, but without making up climate values.

## Run it

Requires Node.js 20.9+ and a free Mapbox public access token.

```bash
npm install
cp .env.example .env.local
# Edit .env.local and set NEXT_PUBLIC_MAPBOX_TOKEN to your Mapbox pk.* token
npm run dev
```

Open http://localhost:3000. You can get a public token from https://account.mapbox.com/access-tokens/. For production, set an allow-list of your site's URLs in the token settings. There is **no NASA API key requirement** for the endpoints used here.

## How to use

1. Search for a place (Mapbox geocoding), or click any location on the map.
2. Drag the pin to fine-tune the location. A green circle shows your selected radius.
3. Adjust the radius with the slider, from 25 m to 5,000 m. The dashed square is the matching **bounding box** (west, south, east, north), ready for NASA datasets that need corners rather than one point.
4. Open the field overview to see real NASA POWER observations for the pin's coordinates. The API requests run **on the server**, snap to a nearby coarse POWER grid coordinate to reduce duplicate NASA calls, and return latest available recorded dates. No fabricated temperatures or soil values are substituted on failure.
5. Switch map style among Satellite, Streets, Terrain, and Dark. Use NASA data-layer switches to overlay GIBS visualizations: rainfall (GPM IMERG), soil moisture (SMAP), vegetation (MODIS NDVI), land-surface temperature (MODIS), and monthly wind speed (MERRA-2). Layer dates come from NASA's WMS capabilities and are shown in the UI.
6. Optional: turn the dashed data-bounds square on or off. Press **Copy bbox** in the overview to export four numbers.

## Architecture

| Code | Purpose | Source |
|---|---|---|
| `components/MapCanvas.tsx` | Mapbox styles, draggable pin, circle and square, NASA WMS overlays | Mapbox GL JS and NASA GIBS WMS |
| `components/FieldShiftApp.tsx` | Map-first controls and responsive explorer UI | React / Tailwind |
| `components/FieldOverview.tsx` | Numeric values, chart, source and date labels | Server API |
| `app/api/nasa/overview/route.ts` | Point-data service, validates input and proxies NASA POWER | https://power.larc.nasa.gov/api/temporal/daily/point |
| `app/api/nasa/layers/route.ts` | Discovers latest GIBS WMS layer dates, server-cached | https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi |
| `app/api/nasa/region-image/route.ts` | Cropped imagery using all four user-selected square coordinates | NASA GIBS WMS |
| `lib/geo.mjs` | Spherical circle and bounding square geometry | Local computations |

## Important scientific and UX notes

- **Observed, not live:** POWER daily observations and GIBS layers can lag real time, and the wind visualization is a **monthly** MERRA-2 dataset, not a live wind forecast. The UI shows actual available dates from providers, not the current clock date.
- **Air vs land temperature:** The overview's NASA POWER `T2M` is 2-meter air temperature. The selectable GIBS temperature overlay is **land-surface temperature**. They measure different things.
- **Soil wetness vs measured soil moisture:** The numeric soil metric is NASA POWER HY `GWETTOP`, a modeled fractional surface-wetness parameter converted to percentage for display. The SMAP raster is a separate satellite product (~9 km resolution). Neither can measure conditions precisely across a small field or replace an in-ground probe.
- **Field-level detail:** The circle and square are user-selected geometry, not automatically detected farm boundaries. Nearby fields often share identical coarse-resolution observations. Mapbox imagery has finer visual detail, but that does not make NASA grid metrics field-scale.
- **Rain totals:** A displayed 7-day amount is the sum of last 7 available calendar days ending on the latest NASA rain date. If only some days are present, the UI explicitly displays how many of seven contributed.
- **Data visualizations:** NASA GIBS overlays are images, not quantitative extraction. A green NDVI-looking map is **not** a measured field-specific vegetation-health percentage. Those analyses are intentionally reserved for a later version.
- **Geographic extent:** The bounding box is drawn on the map, can be copied, and is passed directly to NASA GIBS WMS for the selected-square satellite imagery preview when a NASA layer is enabled. Global NASA GIBS map layers separately request tile bounding boxes. NASA POWER point requests use a nearby quantized point derived from the pin (to respect its coarse grid and caching guidance); regional *numeric averaging* and true field-boundary polygons remain future work.
- **Performance:** NASA POWER results are cached for 6 hours server-side; GIBS layer catalog for 12 hours. For deployment, add rate limiting if usage is large. Some GIBS overlays have coarse resolution and may look mostly uniform at farm zoom.
- **Mapbox:** A Mapbox token is required for all map views and place search. NASA layers are public and do not require the user's NASA credentials.

## Attribution

NASA Earth data: [NASA POWER](https://power.larc.nasa.gov/) and [NASA GIBS / Earthdata](https://www.earthdata.nasa.gov/data/tools/gibs). Basemap and geocoding: [Mapbox](https://www.mapbox.com/). NASA does not endorse the app. Comply with provider license/attribution terms.

## Tests

`npm run test:geo` checks the geodesic selection helpers. `npm run typecheck` and `npm run build` check the Next.js application after installing dependencies.
