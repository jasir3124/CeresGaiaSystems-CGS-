import { NextRequest, NextResponse } from 'next/server';
import { DATA_LAYERS } from '@/lib/layers';
import type { LayerId } from '@/lib/types';

export const runtime = 'nodejs';

// A real bounding-box data request: NASA GIBS WMS returns exactly the
// image corresponding to the user's derived square, not made-up area stats.
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const id = p.get('layer') as LayerId | null;
  const date = p.get('date');
  const names = ['west', 'south', 'east', 'north'] as const;
  const vals = names.map(name => Number(p.get(name)));
  const [west, south, east, north] = vals;
  const validDate = Boolean(date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= new Date().toISOString().slice(0, 10));
  if (!id || !Object.prototype.hasOwnProperty.call(DATA_LAYERS, id) || !validDate ||
      names.some(name => !p.has(name)) || vals.some(x => !Number.isFinite(x)) ||
      west >= east || south >= north || west < -180 || east > 180 || south < -85 || north > 85 ||
      east - west > 10 || north - south > 10) {
    return NextResponse.json({ error: 'Invalid layer, date, or square bounds.' }, { status: 400 });
  }

  const params = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetMap',
    LAYERS: DATA_LAYERS[id].nasaId, STYLES: '', SRS: 'EPSG:4326',
    FORMAT: 'image/png', TRANSPARENT: 'TRUE',
    WIDTH: '512', HEIGHT: '512', TIME: date!,
    BBOX: [west, south, east, north].map(n => n.toFixed(6)).join(',')
  });
  try {
    const response = await fetch(`https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${params}`, {
      next: { revalidate: 12 * 60 * 60 }, signal: AbortSignal.timeout(20_000)
    });
    if (!response.ok || !(response.headers.get('content-type') || '').toLowerCase().includes('image/')) {
      return NextResponse.json({ error: 'NASA GIBS could not return an image for this square and date.' }, { status: 502 });
    }
    return new NextResponse(await response.arrayBuffer(), {
      status: 200,
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=14400, s-maxage=43200' }
    });
  } catch {
    return NextResponse.json({ error: 'NASA GIBS imagery is temporarily unavailable.' }, { status: 502 });
  }
}
