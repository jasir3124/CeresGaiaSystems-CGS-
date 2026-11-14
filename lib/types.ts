export type Coordinates = [number, number]; // [longitude, latitude]
export type MapStyleId = 'satellite' | 'streets' | 'terrain' | 'dark';
export type LayerId = 'rain' | 'soil' | 'vegetation' | 'temperature' | 'wind';

export interface Measurement { value: number | null; date: string | null; unit: string; }
export interface DailyRow { date: string; precipitation: number | null; soilWetness: number | null; temperature: number | null; }
export interface OverviewData {
  point: Coordinates;
  sampledPoint: Coordinates;
  latestWeatherDate: string | null;
  temperature: Measurement;
  humidity: Measurement;
  windSpeed: Measurement;
  windDirection: Measurement;
  soilWetness: Measurement;
  soilLabel?: string;
  soilNote?: string;
  soilSource?: 'GWETTOP' | 'SFMC' | null;
  solarRadiation: Measurement;
  rainfallSevenDays: Measurement & { daysAvailable: number; start: string | null; end: string | null };
  daily: DailyRow[];
  note: string;
  source: string;
}

export interface WeatherPoint {
  time: string;
  temperature: number | null;
  humidity: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  precipitationPreviousHour: number | null;
}
export interface WeatherData {
  source: 'Meteomatics';
  generatedAt: string;
  point: Coordinates;
  forecast: WeatherPoint[];
}
export interface LayerStatus { id: LayerId; available: boolean; date: string | null; source: string; error?: string; }
export interface LayerManifest { layers: LayerStatus[]; generatedAt: string; }
