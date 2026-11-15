import cropProfiles from './data/crop-agronomy.json';
import type { CropId } from './crops';

export type Demand = 'moderate' | 'high' | 'fixing';
export const AGRONOMY_SOURCES = {
  chemistry: 'https://extension.missouri.edu/publications/g9077',
  water: 'https://www.fao.org/4/S2022E/s2022e07.htm',
  rotation: 'https://www.vegetables.cornell.edu/pest-management/disease-factsheets/do-rotations-matter-within-disease-management-programs/',
  evapotranspiration: 'https://www.fao.org/4/x0490e/x0490e07.htm',
  salinity: 'https://www.fao.org/4/y4263e/y4263e0e.htm',
  nutrients: 'https://extension.umn.edu/agriculture/crop-production/nutrient-management-for-minnesota-crops',
  soybean: 'https://extension.umn.edu/agriculture/crop-production/nutrient-management-for-minnesota-crops/soybean-fertilizer-guidelines',
  sunflower: 'https://extension.umn.edu/nutrient-management/sunflower-fertilizer-guidelines',
  potato: 'https://blog-crop-news.extension.umn.edu/2023/10/potato-nutrient-management-research-5.html',
  tomato: 'https://extension.missouri.edu/publications/g6370'
};
export interface AgronomyProfile {
  nitrogen: Demand; phosphorus: Demand; potassium: Demand;
  secondary: string[]; micronutrients: string[];
  nutrientFocus: NutrientKey[];
  organicMatter: string; salinityThresholdEce: number;
  waterMm: { min: number; max: number }; kcMid: number; droughtSensitivity: 'low-medium' | 'medium-high' | 'high';
  nutrientNotes: string[]; residue: string; sources: string[];
}
// Versioned reference data. Demand classes are qualitative CGS screening categories,
// NOT fertilizer rates or measured nutrient depletion. ECe means saturated-paste EC.
// Seasonal ET and mid-season Kc are broad FAO planning values, not irrigation prescriptions.
export const AGRONOMY_VERSION = '2026-11-15.rotation.1';
export const AGRONOMY = cropProfiles as Record<CropId, AgronomyProfile>;

export type NutrientKey = 'nitrogen' | 'phosphorus' | 'potassium' | 'calcium' | 'magnesium' | 'sulfur' | 'iron' | 'zinc' | 'boron';
export const NUTRIENTS: NutrientKey[] = ['nitrogen', 'phosphorus', 'potassium', 'calcium', 'magnesium', 'sulfur', 'iron', 'zinc', 'boron'];
export interface SoilNutrient { value: number; unit: 'mg/kg'; interpretation: 'low' | 'sufficient' | 'high' | 'unknown' }
export interface SoilTest {
  id: string; sampledOn: string; source: string; method: string; depthCm: number;
  ph?: number; organicMatterPercent?: number; salinityEce?: number;
  nutrients: Partial<Record<NutrientKey, SoilNutrient>>;
}
export interface FieldManagement {
  currentCropId: string | null;
  growthStage?: string;
  irrigation: 'unknown' | 'rainfed' | 'irrigated';
  soilMoisture?: { measuredAt: string; volumetricPercent: number; refillBelowPercent?: number; source: string };
}
// Check dates, units and physical ranges before lab records can enter storage or scoring.
export function isSoilTest(value: unknown): value is SoilTest {
  if (!value || typeof value !== 'object') return false;
  const t = value as SoilTest;
  if (typeof t.id !== 'string' || !t.id || !/^\d{4}-\d{2}-\d{2}$/.test(t.sampledOn) || !Number.isFinite(Date.parse(t.sampledOn)) || new Date(t.sampledOn).toISOString().slice(0, 10) !== t.sampledOn || Date.parse(t.sampledOn) > Date.now() ||
    typeof t.source !== 'string' || !t.source.trim() || t.source.length > 200 || typeof t.method !== 'string' || !t.method.trim() || t.method.length > 200 || !Number.isFinite(t.depthCm) || t.depthCm <= 0 || t.depthCm > 200 || !t.nutrients || typeof t.nutrients !== 'object' || Array.isArray(t.nutrients)) return false;
  for (const [key, min, max] of [['ph', 0, 14], ['organicMatterPercent', 0, 100], ['salinityEce', 0, 100]] as const) {
    if (t[key] !== undefined && (!Number.isFinite(t[key]) || t[key]! < min || t[key]! > max)) return false;
  }
  if (Object.entries(t.nutrients).some(([key, n]) => !NUTRIENTS.includes(key as NutrientKey) || !n || !Number.isFinite(n.value) || n.value < 0 || n.unit !== 'mg/kg' || !['low', 'sufficient', 'high', 'unknown'].includes(n.interpretation))) return false;
  return t.ph !== undefined || t.organicMatterPercent !== undefined || t.salinityEce !== undefined || Object.keys(t.nutrients).length > 0;
}
export function isFieldManagement(value: unknown): value is FieldManagement {
  if (!value || typeof value !== 'object') return false;
  const m = value as FieldManagement;
  if (!(m.currentCropId === null || typeof m.currentCropId === 'string') || !['unknown', 'rainfed', 'irrigated'].includes(m.irrigation) || (m.growthStage !== undefined && (typeof m.growthStage !== 'string' || m.growthStage.length > 100))) return false;
  const moisture = m.soilMoisture;
  return !moisture || (typeof moisture.source === 'string' && !!moisture.source.trim() && Number.isFinite(Date.parse(moisture.measuredAt)) && Date.parse(moisture.measuredAt) <= Date.now() && Number.isFinite(moisture.volumetricPercent) && moisture.volumetricPercent >= 0 && moisture.volumetricPercent <= 100 && (moisture.refillBelowPercent === undefined || (Number.isFinite(moisture.refillBelowPercent) && moisture.refillBelowPercent >= 0 && moisture.refillBelowPercent <= 100)));
}
