export type CropId = 'wheat' | 'maize' | 'barley' | 'soybean' | 'sunflower' | 'potato' | 'tomato';
export type CropHistory = [CropId, CropId, CropId]; // Most recent first; repeated crops are valid.
export interface CropRange { min: number; max: number }
export interface CropDefinition {
  id: CropId;
  name: string;
  family: string;
  optimumTemperatureC: CropRange;
  optimumAnnualRainfallMm: CropRange;
  growingPeriodDays: CropRange;
  optimumSoilPh: CropRange;
  sourceUrl: string;
}

// FAO EcoCrop reference ranges, checked 2026-11-14. These are broad species
// ranges, not cultivar/location-specific recommendations. Rainfall is ANNUAL,
// not irrigation demand or growing-season rainfall. Growing months are derived
// from cycle days / 30, not a fixed planting calendar (which depends on location).
export const CROP_CATALOG_VERSION = 1;
export const CROPS: readonly CropDefinition[] = [
  { id: 'wheat', name: 'Wheat', family: 'Poaceae', optimumTemperatureC: { min: 15, max: 23 }, optimumAnnualRainfallMm: { min: 750, max: 900 }, growingPeriodDays: { min: 90, max: 250 }, optimumSoilPh: { min: 6, max: 7 }, sourceUrl: 'https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=2114' },
  { id: 'maize', name: 'Maize (corn)', family: 'Poaceae', optimumTemperatureC: { min: 18, max: 33 }, optimumAnnualRainfallMm: { min: 600, max: 1200 }, growingPeriodDays: { min: 65, max: 365 }, optimumSoilPh: { min: 5, max: 7 }, sourceUrl: 'https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=238663' },
  { id: 'barley', name: 'Barley', family: 'Poaceae', optimumTemperatureC: { min: 15, max: 20 }, optimumAnnualRainfallMm: { min: 500, max: 1000 }, growingPeriodDays: { min: 90, max: 240 }, optimumSoilPh: { min: 6.5, max: 7.5 }, sourceUrl: 'https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=1232' },
  { id: 'soybean', name: 'Soybean', family: 'Fabaceae', optimumTemperatureC: { min: 20, max: 33 }, optimumAnnualRainfallMm: { min: 600, max: 1500 }, growingPeriodDays: { min: 75, max: 180 }, optimumSoilPh: { min: 5.5, max: 6.5 }, sourceUrl: 'https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=1150' },
  { id: 'sunflower', name: 'Sunflower', family: 'Asteraceae', optimumTemperatureC: { min: 17, max: 34 }, optimumAnnualRainfallMm: { min: 600, max: 1000 }, growingPeriodDays: { min: 70, max: 200 }, optimumSoilPh: { min: 6, max: 7.5 }, sourceUrl: 'https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=1191' },
  { id: 'potato', name: 'Potato', family: 'Solanaceae', optimumTemperatureC: { min: 15, max: 25 }, optimumAnnualRainfallMm: { min: 500, max: 800 }, growingPeriodDays: { min: 90, max: 160 }, optimumSoilPh: { min: 5, max: 6.2 }, sourceUrl: 'https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=1971' },
  { id: 'tomato', name: 'Tomato', family: 'Solanaceae', optimumTemperatureC: { min: 20, max: 27 }, optimumAnnualRainfallMm: { min: 600, max: 1300 }, growingPeriodDays: { min: 70, max: 150 }, optimumSoilPh: { min: 5.5, max: 6.8 }, sourceUrl: 'https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=1379' }
];

export function isCropHistory(value: unknown): value is CropHistory {
  return Array.isArray(value) && value.length === 3 &&
    value.every(id => CROPS.some(crop => crop.id === id));
}

export function getCrop(id: CropId) {
  return CROPS.find(crop => crop.id === id)!;
}

export function growingMonths(crop: CropDefinition): CropRange {
  return { min: Math.round(crop.growingPeriodDays.min / 30 * 10) / 10, max: Math.round(crop.growingPeriodDays.max / 30 * 10) / 10 };
}
