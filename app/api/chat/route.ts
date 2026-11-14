import { NextRequest, NextResponse } from 'next/server';
import { GET as nasaOverview } from '../nasa/overview/route';
import { GET as weatherForecast } from '../weather/route';
import { CROPS, isCropHistory } from '@/lib/crops';
import { answerFieldQuestion, ChatServiceError, parseChatRequest } from '@/lib/field-chat';

export const runtime = 'nodejs';
export const maxDuration = 180;

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Cross-site chat requests are not allowed.' }, { status: 403 });
  }
  let input;
  try {
    const text = await request.text();
    if (text.length > 200_000) return NextResponse.json({ error: 'Chat request is too large.' }, { status: 413 });
    input = parseChatRequest(JSON.parse(text));
    if (!isCropHistory(input.field.cropHistory)) throw new Error('Invalid crop history. Reload your saved field and try again.');
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid chat request.' }, { status: 400 });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.startsWith('your_')) return NextResponse.json({ error: 'AI chat is not configured yet. Add GEMINI_API_KEY to .env.local and restart the server.', configured: false }, { status: 503 });
  const query = new URLSearchParams({ lat: String(input.field.point[1]), lng: String(input.field.point[0]) });
  async function retrieve(handler: (request: NextRequest) => Promise<Response>, path: string) {
    try {
      const response = await handler(new NextRequest(`http://localhost${path}?${query}`));
      return await response.json();
    } catch { return { error: 'This data source is temporarily unavailable.' }; }
  }
  try {
    const [observations, forecast] = await Promise.all([retrieve(nasaOverview, '/api/nasa/overview'), retrieve(weatherForecast, '/api/weather')]);
    const result = await answerFieldQuestion({ apiKey, model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite', ...input, observations, forecast, cropCatalog: CROPS });
    const sources = [...result.sources];
    if (!observations.error) sources.unshift({ label: 'NASA POWER observations', url: `/api/nasa/overview?${query}` });
    if (!forecast.error && forecast.configured !== false) sources.push({ label: 'Meteomatics forecast', url: `/api/weather?${query}` });
    return NextResponse.json({ ...result, sources }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof ChatServiceError ? error.message : 'The assistant could not finish. Please try again.' }, { status: error instanceof ChatServiceError ? error.status : 502 });
  }
}
