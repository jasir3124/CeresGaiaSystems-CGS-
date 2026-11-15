import { unstable_cache } from 'next/cache';
import { analyseClimate, parsePowerClimate } from './climate';

export async function loadFieldClimate(point: [number, number]) {
  // Use fifteen completed calendar years so a partial current year cannot bias trends.
  const endYear = new Date().getUTCFullYear() - 1;
  const chunks = [endYear - 14, endYear - 9, endYear - 4];
  // Cache successful chunks separately. A transient failed chunk can be retried
  // immediately without discarding the available years or repeating good requests.
  const results = await Promise.allSettled(chunks.map(first => unstable_cache(async () => {
    const query = new URLSearchParams({ latitude: String(point[1]), longitude: String(point[0]), start: `${first}0101`, end: `${first + 4}1231`,
      parameters: 'T2M,T2M_MIN,T2M_MAX,PRECTOTCORR,RH2M,WS2M,ALLSKY_SFC_SW_DWN', community: 'AG', format: 'JSON', 'time-standard': 'UTC' });
    const url = `https://power.larc.nasa.gov/api/temporal/daily/point?${query}`;
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw new Error(`NASA climate ${first}–${first + 4}: HTTP ${response.status}`);
    return { days: parsePowerClimate(await response.json()), url, retrievedAt: new Date().toISOString() };
  }, ['cgs-climate-chunk-v1', String(point[0]), String(point[1]), String(first)], { revalidate: 86400 })()));
  const successful = results.flatMap(r => r.status === 'fulfilled' ? [r.value] : []);
  const errors = results.flatMap(r => r.status === 'rejected' ? [r.reason instanceof Error ? r.reason.message : 'NASA history unavailable'] : []);
  if (!successful.length) throw new Error('NASA climate history is unavailable. Try again later.');
  return { analysis: analyseClimate(successful.flatMap(r => r.days), endYear - 14, endYear),
    retrievedAt: successful.map(r => r.retrievedAt).sort()[0], errors, sources: successful.map(r => r.url), requestedPoint: point };
}
