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

export async function GET(request: NextRequest) {
  const latitude = Number(request.nextUrl.searchParams.get('lat'));
  const longitude = Number(request.nextUrl.searchParams.get('lng'));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 85 || Math.abs(longitude) > 180 ||
      !request.nextUrl.searchParams.has('lat') || !request.nextUrl.searchParams.has('lng')) {
    return NextResponse.json({ error: 'A valid latitude and longitude are required.' }, { status: 400 });
  }

  // POWER data are gridded, not field-scale. Snap requests to NASA's coarse
  // ~0.5° grid to avoid repeated identical-cell calls when users move a pin
  // a few meters. The original pin coordinates remain in the response.
  const sampledLatitude = Math.round(latitude * 2) / 2;
  const sampledLongitude = Math.round(longitude * 2) / 2;

  // Real NASA observations, not a weather forecast. Request a long enough period
  // for data processing delays, then choose the most recent *actually present* day.
  const end = ymd(new Date(Date.now() - DAY * 3));
  const start = ymd(new Date(Date.now() - DAY * 95));
  try {
    const ag = await loadPower(sampledLatitude, sampledLongitude, start, end, 'AG', AG_PARAMS);
    // The HY community explicitly exposes GWETTOP; failures here do not suppress weather.
    const hy = await loadPower(sampledLatitude, sampledLongitude, start, end, 'HY', ['GWETTOP']).catch(() => ({} as Record<string, Record<string, number>>));
    const temperature = latest(ag, 'T2M', '°C');
    const humidityRaw = latest(ag, 'RH2M', '%');
    // Most POWER RH2M responses return percentage values; protect against
    // any fractional (0–1) representation without inventing observations.
    const humidity = { ...humidityRaw, value: humidityRaw.value !== null && humidityRaw.value <= 1 ? humidityRaw.value * 100 : humidityRaw.value };
    const windSpeed = latest(ag, 'WS2M', 'm/s');
    const windDirection = latest(ag, 'WD2M', '°');
    const solarRadiation = latest(ag, 'ALLSKY_SFC_SW_DWN', 'MJ/m²/day');
    const soilRaw = latest(hy, 'GWETTOP', 'fraction');
    const soilWetness = { ...soilRaw, value: soilRaw.value !== null && soilRaw.value >= 0 && soilRaw.value <= 1 ? soilRaw.value * 100 : null, unit: '%' };

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

    const allKeys = Array.from(new Set([...Object.keys(ag.T2M ?? {}), ...Object.keys(ag.PRECTOTCORR ?? {}), ...Object.keys(hy.GWETTOP ?? {})])).sort().slice(-30);
    const daily: DailyRow[] = allKeys.map(date => ({
      date: readable(date),
      temperature: numberOrNull(ag.T2M, date),
      precipitation: numberOrNull(ag.PRECTOTCORR, date),
      soilWetness: (() => { const v = numberOrNull(hy.GWETTOP, date); return v !== null && v >= 0 && v <= 1 ? v * 100 : null; })()
    }));

    const result: OverviewData = {
      point: [longitude, latitude], sampledPoint: [sampledLongitude, sampledLatitude], latestWeatherDate: temperature.date,
      temperature, humidity, windSpeed, windDirection, soilWetness, solarRadiation,
      rainfallSevenDays, daily,
      note: 'POWER values are requested at a nearby ~0.5° grid point, not a sensor inside the selected field. Soil wetness is a modeled fraction, not in-situ soil water content. Observation dates can lag real time.',
      source: 'NASA POWER · AG and HY daily point APIs (UTC)'
    };
    return NextResponse.json(result, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=14400, stale-while-revalidate=3600' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown upstream error';
    return NextResponse.json({ error: `Could not retrieve NASA observations. ${message}` }, { status: 502 });
  }
}
