import { NextRequest, NextResponse } from 'next/server';
import type { DailyRow, Measurement, OverviewData } from '@/lib/types';

export const runtime = 'nodejs';

const DAY = 86_400_000;
const AG_PARAMS = ['T2M', 'RH2M', 'PRECTOTCORR', 'WS2M', 'WD2M', 'ALLSKY_SFC_SW_DWN'];
type PowerResponse = {
  properties?: { parameter?: Record<string, Record<string, number>> };
  messages?: string[];
};

function ymd(day: Date) { return day.toISOString().slice(0, 10).replaceAll('-', ''); }
function readable(key: string) { return `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`; }
// NASA fill values are missing data; real zero readings must remain valid.
function valid(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value > -900; }

async function loadPower(latitude: number, longitude: number, start: string, end: string, community: string, parameters: string[]) {
  const search = new URLSearchParams({
    parameters: parameters.join(','), community,
    latitude: String(latitude), longitude: String(longitude),
    start, end, format: 'JSON', 'time-standard': 'UTC'
  });
  const url = `https://power.larc.nasa.gov/api/temporal/daily/point?${search.toString()}`;
  const res = await fetch(url, {
    next: { revalidate: 6 * 60 * 60 },
    signal: AbortSignal.timeout(20_000),
    headers: { Accept: 'application/json' }
  });
  if (!res.ok) throw new Error(`NASA POWER returned ${res.status} (${community})`);
  const json = await res.json() as PowerResponse;
  const value = json.properties?.parameter;
  if (!value || Object.keys(value).length === 0) throw new Error(`NASA POWER sent no data (${community})`);
  return value;
}

function latest(data: Record<string, Record<string, number>>, key: string, unit: string): Measurement {
  const entries = Object.entries(data[key] ?? {}).filter(([,v]) => valid(v)).sort(([a], [b]) => b.localeCompare(a));
  return entries.length ? { value: entries[0][1], date: readable(entries[0][0]), unit } : { value: null, date: null, unit };
}
function numberOrNull(series: Record<string, number> | undefined, date: string) {
  const v = series?.[date]; return valid(v) ? v : null;
}
// Both sources are fractions; the UI label distinguishes wetness from volumetric moisture.
function latestSoil(data: Record<string, Record<string, number>>, key: string): Measurement {
  const dates = Object.keys(data[key] ?? {}).sort().reverse();
  for (const date of dates) {
    const value = data[key]?.[date];
    if (valid(value) && value >= 0 && value <= 1) return { value: value * 100, date: readable(date), unit: '%' };
  }
  return { value: null, date: null, unit: '%' };
}

export async function GET(request: NextRequest) {
  const latitude = Number(request.nextUrl.searchParams.get('lat'));
  const longitude = Number(request.nextUrl.searchParams.get('lng'));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 85 || Math.abs(longitude) > 180 ||
      !request.nextUrl.searchParams.has('lat') || !request.nextUrl.searchParams.has('lng')) {
    return NextResponse.json({ error: 'A valid latitude and longitude are required.' }, { status: 400 });
  }

  // Submit the actual requested location. POWER still returns coarse regional
  // modeled values rather than a field-scale sensor measurement.
  const sampledLatitude = latitude;
  const sampledLongitude = longitude;

  // Real NASA observations, not a weather forecast. Request a long enough period
  // for data processing delays, then choose the most recent *actually present* day.
  const history = request.nextUrl.searchParams.get('history') === '1';
  const end = ymd(new Date(Date.now() - DAY * 3));
  const start = ymd(new Date(Date.now() - DAY * (history ? 370 : 95)));
  try {
    const agPromise = loadPower(sampledLatitude, sampledLongitude, start, end, 'AG', AG_PARAMS);
    // Hydrology can take longer; attach a rejection handler immediately.
    void agPromise.catch(() => {});
    // Soil parameters use AG: the live daily API rejects HY as a community.
    // Hydrology data can lag meteorology. Query a longer period, and retry with
    // NASA POWER's distinct volumetric surface-moisture series if wetness is absent.
    const hyStart = ymd(new Date(Date.now() - DAY * 370));
    const hyEnd = ymd(new Date(Date.now() - DAY * 3));
    let hydrologyError: string | null = null;
    let soilSource: 'GWETTOP' | 'SFMC' | null = null;
    let hy: Record<string, Record<string, number>> = {};
    try {
      hy = await loadPower(sampledLatitude, sampledLongitude, hyStart, hyEnd, 'AG', ['GWETTOP']);
      if (Object.values(hy.GWETTOP ?? {}).some(v => valid(v) && v >= 0 && v <= 1)) soilSource = 'GWETTOP';
    } catch (error) { hydrologyError = error instanceof Error ? error.message : 'NASA hydrology unavailable'; }
    if (!soilSource) {
      try {
        const alternate = await loadPower(sampledLatitude, sampledLongitude, hyStart, hyEnd, 'AG', ['SFMC']);
        if (Object.values(alternate.SFMC ?? {}).some(v => valid(v) && v >= 0 && v <= 1)) {
          hy = alternate;
          soilSource = 'SFMC';
          hydrologyError = null;
        }
      } catch (error) {
        hydrologyError = error instanceof Error ? error.message : 'NASA surface moisture unavailable';
      }
    }
    const ag = await agPromise;
    const temperature = latest(ag, 'T2M', '°C');
    const humidityRaw = latest(ag, 'RH2M', '%');
    // Most POWER RH2M responses return percentage values; protect against
    // any fractional (0–1) representation without inventing observations.
    const humidity = { ...humidityRaw, value: humidityRaw.value !== null && humidityRaw.value <= 1 ? humidityRaw.value * 100 : humidityRaw.value };
    const windSpeed = latest(ag, 'WS2M', 'm/s');
    const windDirection = latest(ag, 'WD2M', '°');
    const solarRadiation = latest(ag, 'ALLSKY_SFC_SW_DWN', 'MJ/m²/day');
    const soilWetness = latestSoil(hy, soilSource ?? 'GWETTOP');
    const soilLabel = soilSource === 'SFMC' ? 'Surface soil moisture' : 'Surface soil wetness';
    const soilNote = soilSource === 'SFMC'
      ? 'NASA POWER SFMC: modeled volumetric water content (m³/m³), shown as volume percent.'
      : soilSource === 'GWETTOP'
        ? 'NASA POWER GWETTOP: modeled soil wetness fraction, shown as a percentage.'
        : `No valid NASA soil observation is available for this area and time. ${hydrologyError ?? 'Both GWETTOP and SFMC returned no valid values.'}`;

    const rainKeys = Object.keys(ag.PRECTOTCORR ?? {}).filter(key => numberOrNull(ag.PRECTOTCORR, key) !== null).sort();
    const latestRainDate = rainKeys.at(-1) ?? null;
    let rainfallSevenDays: OverviewData['rainfallSevenDays'] = { value: null, date: null, unit: 'mm', daysAvailable: 0, start: null, end: null };
    if (latestRainDate) {
      const latestAsTime = Date.UTC(Number(latestRainDate.slice(0, 4)), Number(latestRainDate.slice(4, 6)) - 1, Number(latestRainDate.slice(6, 8)));
      const startDate = ymd(new Date(latestAsTime - 6 * DAY));
      const keys = rainKeys.filter(key => key >= startDate && key <= latestRainDate);
      rainfallSevenDays = {
        value: keys.reduce((sum, date) => sum + (numberOrNull(ag.PRECTOTCORR, date) ?? 0), 0),
        date: readable(latestRainDate), unit: 'mm', daysAvailable: keys.length,
        start: readable(startDate), end: readable(latestRainDate)
      };
    }

    // Align series by UTC date without filling missing measurements.
    const allKeys = Array.from(new Set([...Object.keys(ag.T2M ?? {}), ...Object.keys(ag.PRECTOTCORR ?? {}), ...Object.keys(hy[soilSource ?? 'GWETTOP'] ?? {})])).sort().slice(history ? -365 : -30);
    const daily: DailyRow[] = allKeys.map(date => ({
      date: readable(date),
      temperature: numberOrNull(ag.T2M, date),
      precipitation: numberOrNull(ag.PRECTOTCORR, date),
      soilWetness: (() => { const v = numberOrNull(hy[soilSource ?? 'GWETTOP'], date); return v !== null && v >= 0 && v <= 1 ? v * 100 : null; })()
    }));

    const result: OverviewData = {
      point: [longitude, latitude], sampledPoint: [sampledLongitude, sampledLatitude], latestWeatherDate: temperature.date,
      temperature, humidity, windSpeed, windDirection, soilWetness, soilLabel, soilNote, soilSource, solarRadiation,
      rainfallSevenDays, daily,
      note: 'NASA POWER regional modeled values, with individual observation dates.',
      source: 'NASA POWER · AG daily point API (UTC)'
    };
    return NextResponse.json(result, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=14400, stale-while-revalidate=3600' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown upstream error';
    return NextResponse.json({ error: `Could not retrieve NASA observations. ${message}` }, { status: 502 });
  }
}
