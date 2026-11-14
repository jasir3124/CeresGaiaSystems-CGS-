import { unstable_cache } from 'next/cache';
import { parsePowerClimate } from './climate';
import { estimateReferenceEt, type WaterEstimate } from './recommendations';

export async function loadRecentWater(point: [number, number]): Promise<WaterEstimate> {
  const today = new Date().toISOString().slice(0, 10);
  return unstable_cache(async () => {
    const ymd = (date: number) => new Date(date).toISOString().slice(0, 10).replaceAll('-', '');
    const query = new URLSearchParams({ latitude: String(point[1]), longitude: String(point[0]), start: ymd(Date.now() - 45 * 86400000), end: ymd(Date.now() - 3 * 86400000),
      parameters: 'T2M,T2M_MIN,T2M_MAX,PRECTOTCORR', community: 'AG', format: 'JSON', 'time-standard': 'UTC' });
    const url = `https://power.larc.nasa.gov/api/temporal/daily/point?${query}`;
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`NASA water estimate unavailable (HTTP ${response.status}).`);
    const data = parsePowerClimate(await response.json()).sort((a, b) => a.date.localeCompare(b.date));
    const latest = data.filter(d => d.temperature !== null && d.minimum !== null && d.maximum !== null && d.rain !== null).at(-1);
    if (!latest || Date.now() - Date.parse(latest.date) > 14 * 86400000) throw new Error('NASA minimum/maximum temperatures are missing or older than 14 days.');
    const start = new Date(Date.parse(latest.date) - 6 * 86400000).toISOString().slice(0, 10);
    const days = data.filter(d => d.date >= start && d.date <= latest.date);
    if (days.length !== 7 || days.some(d => d.rain === null)) throw new Error('Incomplete seven-day weather record for evapotranspiration.');
    return { start, end: latest.date, days: days.length, etoMm: estimateReferenceEt(days, point[1]), rainMm: days.reduce((sum, d) => sum + d.rain!, 0), source: url, retrievedAt: new Date().toISOString() };
  }, ['cgs-water-v1', String(point[0]), String(point[1]), today], { revalidate: 21600 })();
}
