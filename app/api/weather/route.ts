import { NextRequest, NextResponse } from 'next/server';
import type { WeatherData } from '@/lib/types';
import { parseForecast } from '@/lib/meteomatics.mjs';

export const runtime = 'nodejs';

// One bundled request for five parameters, conserving Meteomatics's daily quota.
const PARAMETERS = [
  't_2m:C',
  'relative_humidity_2m:p',
  'wind_speed_10m:ms',
  'wind_dir_10m:d',
  'precip_1h:mm'
] as const;
type MeteoResponse = { data?: Array<{ parameter: string; coordinates?: Array<{ dates?: Array<{ date: string; value: number | null }> }> }> };

export async function GET(request: NextRequest) {
  const latString = request.nextUrl.searchParams.get('lat');
  const lngString = request.nextUrl.searchParams.get('lng');
  const latitude = Number(latString);
  const longitude = Number(lngString);
  if (!latString || !lngString || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 85 || Math.abs(longitude) > 180) {
    return NextResponse.json({ error: 'Valid latitude and longitude are required.' }, { status: 400 });
  }

  const user = process.env.METEOMATICS_USERNAME;
  const password = process.env.METEOMATICS_PASSWORD;
  if (!user || !password) {
    return NextResponse.json({ configured: false, message: 'Set METEOMATICS_USERNAME and METEOMATICS_PASSWORD in .env.local.' });
  }

  const hour = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  const start = new Date(hour).toISOString().replace('.000', '');
  const end = new Date(hour + 24 * 3_600_000).toISOString().replace('.000', '');
  // Query the actual selected field location; Meteomatics resolves its model grid.
  const loc = `${latitude},${longitude}`;
  const url = `https://api.meteomatics.com/${start}--${end}:PT3H/${PARAMETERS.join(',')}/${loc}/json?model=mix`;
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`,
        Accept: 'application/json'
      },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(18_000)
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error('Meteomatics credentials or subscription are not authorized.');
      if (response.status === 429) throw new Error('Meteomatics query quota reached; try again later.');
      throw new Error(`Meteomatics request failed (HTTP ${response.status}).`);
    }
    const parsed = await response.json() as MeteoResponse;
    const forecast = parseForecast(parsed);
    if (!forecast.length) throw new Error('Meteomatics did not return weather values for this location.');
    const result: WeatherData = { source: 'Meteomatics', generatedAt: response.headers.get('date') && Number.isFinite(Date.parse(response.headers.get('date')!)) ? new Date(response.headers.get('date')!).toISOString() : new Date().toISOString(), point: [longitude, latitude], forecast };
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, max-age=0' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Meteomatics temporarily unavailable.' }, { status: 502 });
  }
}
