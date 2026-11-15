import { NextRequest, NextResponse } from 'next/server';
import { GET as weatherForecast } from '../weather/route';
import { GET as nasaOverview } from '../nasa/overview/route';
import { isCropHistory } from '@/lib/crops';
import { isFieldManagement, isSoilTest, AGRONOMY_SOURCES } from '@/lib/agronomy';
import { loadFieldClimate } from '@/lib/climate-service';
import { loadRecentWater } from '@/lib/water-service';
import { generateRotationPlan } from '@/lib/crop-rotation';
import { generateRecommendations, type RecommendationField } from '@/lib/recommendations';
import type { OverviewData, WeatherData } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 90;

export async function POST(request: NextRequest) {
  let field: RecommendationField, targetMonth: number | undefined;
  try {
    const text = await request.text();
    if (text.length > 250000) return NextResponse.json({ error: 'Field request is too large.' }, { status: 413 });
    const body = JSON.parse(text);
    field = body.field; targetMonth = body.targetMonth;
    if (!field || typeof field.id !== 'string' || !field.id || typeof field.name !== 'string' ||
      !Array.isArray(field.point) || field.point.length !== 2 || !field.point.every(Number.isFinite) || Math.abs(field.point[0]) > 180 || Math.abs(field.point[1]) > 85 ||
      !Number.isFinite(field.radius) || field.radius < 25 || field.radius > 5000 || !isCropHistory(field.cropHistory ?? []) ||
      (field.soilTests !== undefined && (!Array.isArray(field.soilTests) || !field.soilTests.every(isSoilTest))) ||
      (field.management !== undefined && (!isFieldManagement(field.management) || (field.management.currentCropId && !field.cropHistory?.some(r => r.id === field.management?.currentCropId)))) ||
      (targetMonth !== undefined && (!Number.isInteger(targetMonth) || targetMonth < 1 || targetMonth > 12))) throw new Error('Invalid field, soil test, crop record or target month.');
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid field request.' }, { status: 400 }); }
  const query = new URLSearchParams({ lat: String(field.point[1]), lng: String(field.point[0]) });
  async function retrieve(handler: (request: NextRequest) => Promise<Response>, path: string) {
    const response = await handler(new NextRequest(`http://localhost${path}?${query}`));
    const json = await response.json();
    if (!response.ok || json.configured === false) throw new Error(json.error || json.message || 'Data source unavailable.');
    return json;
  }
  const results = await Promise.allSettled([
    loadFieldClimate(field.point), retrieve(weatherForecast, '/api/weather'),
    retrieve(nasaOverview, '/api/nasa/overview'), loadRecentWater(field.point)
  ]);
  const climate = results[0].status === 'fulfilled' ? results[0].value : null;
  const weather: WeatherData | null = results[1].status === 'fulfilled' ? results[1].value : null;
  const overview: OverviewData | null = results[2].status === 'fulfilled' ? results[2].value : null;
  const waterEstimate = results[3].status === 'fulfilled' ? results[3].value : null;
  const result = generateRecommendations({ field, climate: climate?.analysis ?? null, weather, overview, waterEstimate, targetMonth });
  const rotation = generateRotationPlan({ field, climate: climate?.analysis ?? null, targetMonth });
  const errors = results.flatMap(r => r.status === 'rejected' ? [r.reason instanceof Error ? r.reason.message : 'External data unavailable.'] : []);
  return NextResponse.json({ ...result, rotation, sources: [
    ...(climate?.sources.map((url: string) => ({ label: 'NASA POWER climate history', url, retrievedAt: climate.retrievedAt })) ?? []),
    ...(weather ? [{ label: 'Meteomatics forecast', url: `/api/weather?${query}`, retrievedAt: weather.generatedAt }] : []),
    ...(overview ? [{ label: 'NASA regional observations', url: `/api/nasa/overview?${query}`, retrievedAt: new Date().toISOString() }] : []),
    ...(waterEstimate ? [{ label: 'NASA temperatures and rain for ET estimate', url: waterEstimate.source, retrievedAt: waterEstimate.retrievedAt }] : []),
    ...Object.entries(AGRONOMY_SOURCES).map(([label, url]) => ({ label: `Crop reference: ${label}`, url, retrievedAt: null }))
  ], climateRetrievedAt: climate?.retrievedAt ?? null, dataErrors: [...errors, ...(climate?.errors ?? [])] }, { headers: { 'Cache-Control': 'no-store' } });
}
