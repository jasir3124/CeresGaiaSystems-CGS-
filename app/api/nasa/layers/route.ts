import { NextResponse } from 'next/server';
import { DATA_LAYERS, LAYER_IDS } from '@/lib/layers';
import type { LayerManifest, LayerStatus } from '@/lib/types';

export const runtime = 'nodejs';

// Read advertised observation dates instead of assuming that imagery exists for today.
function extractLayerDate(xml: string, name: string): string | null {
  const marker = `<Name>${name}</Name>`;
  const start = xml.indexOf(marker);
  if (start < 0) return null;
  const end = xml.indexOf('</Layer>', start);
  const section = xml.slice(start, end > start ? end : start + 12000);
  // Both WMS 1.1.1 <Extent> and WMS 1.3.0 <Dimension> are used by NASA GIBS.
  const timeTag = section.match(/<(?:Dimension|Extent)\b[^>]*\bname=["']time["'][^>]*>([^<]+)<\/(?:Dimension|Extent)>/i);
  if (!timeTag) return null;
  const dates = (timeTag[1].match(/\d{4}-\d{2}-\d{2}/g) ?? []).filter(d => d <= new Date().toISOString().slice(0, 10));
  return dates.sort().at(-1) ?? null;
}

export async function GET() {
  try {
    const res = await fetch('https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities', {
      next: { revalidate: 12 * 60 * 60 },
      signal: AbortSignal.timeout(20_000),
      headers: { Accept: 'application/xml,text/xml' }
    });
    if (!res.ok) throw new Error(`GIBS catalog returned HTTP ${res.status}`);
    const xml = await res.text();
    const layers: LayerStatus[] = LAYER_IDS.map(id => {
      const date = extractLayerDate(xml, DATA_LAYERS[id].nasaId);
      return { id, available: Boolean(date), date, source: DATA_LAYERS[id].nasaId,
        ...(date ? {} : { error: 'Layer not advertised with a date by NASA GIBS.' }) };
    });
    const result: LayerManifest = { layers, generatedAt: new Date().toISOString() };
    return NextResponse.json(result, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=14400, stale-while-revalidate=3600' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown upstream error';
    return NextResponse.json({ error: `NASA GIBS catalog is unavailable: ${message}` }, { status: 502 });
  }
}
