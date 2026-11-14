import type { WeatherPoint } from './types';
export function parseForecast(raw: {
  data?: Array<{ parameter: string; coordinates?: Array<{ dates?: Array<{ date: string; value: number | null }> }> }>;
}): WeatherPoint[];
