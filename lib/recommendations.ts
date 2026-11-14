import { CROPS, getCrop, sortCropHistory, type CropHistory, type CropId } from './crops';
import { AGRONOMY, AGRONOMY_VERSION, type SoilTest, type FieldManagement } from './agronomy';
import { mean, type ClimateAnalysis, type ClimateMonth } from './climate';
import type { OverviewData, WeatherData } from './types';

export interface RecommendationField {
  id: string; name: string; point: [number, number]; radius: number;
  cropHistory?: CropHistory; soilTests?: SoilTest[]; management?: FieldManagement;
}
export interface Factor { key: string; label: string; weight: number; coverage: number; score: number | null; explanation: string }
export interface RankedCrop {
  cropId: CropId; score: number | null; rating: string; evidencePercent: number; confidence: 'Low' | 'Moderate';
  scoreRange: [number, number]; factors: Factor[]; reasons: string[]; risks: string[];
  planting: string; plantingMonth: number | null; seasonalRainMm: number | null; seasonalWaterMm: { min: number; max: number };
  nutrients: string[]; soil: string[];
}
export interface WaterEstimate { start: string; end: string; days: number; etoMm: number | null; rainMm: number | null; source: string; retrievedAt: string }
export interface CurrentAdvice {
  cropName: string; plantedOn: string | null; daysSincePlanting: number | null; growthStage: string;
  harvest: { earliest: string; latest: string } | null; harvestNote: string;
  irrigation: string[]; warnings: string[]; management: string[];
}
export interface RecommendationResult {
  fieldId: string; point: [number, number]; generatedAt: string; catalogVersion: string;
  ranked: RankedCrop[]; current: CurrentAdvice | null; gaps: string[];
  climate: ClimateAnalysis | null; climateNotes: string[]; soilTestDate: string | null;
  forecastAt: string | null; forecastThrough: string | null; forecast: WeatherData | null; observations: OverviewData | null;
  waterEstimate: WaterEstimate | null;
}
export const SCORE_POLICY = { climate: 20, adaptation: 10, soil: 15, nutrients: 15, rotation: 20, water: 10, season: 10 } as const;
const clamp = (n: number) => Math.max(0, Math.min(100, n));
const round = (n: number) => Math.round(n * 10) / 10;
const fit = (value: number, min: number, max: number, penalty: number) => clamp(100 - Math.max(min - value, value - max, 0) * penalty);
const monthName = (m: number) => new Date(Date.UTC(2024, m - 1, 1)).toLocaleDateString('en', { month: 'long', timeZone: 'UTC' });
const DAY = 86400000;
const dayString = (n: number) => new Date(n).toISOString().slice(0, 10);

function seasonFor(cropId: CropId, climate: ClimateAnalysis | null, startMonth: number) {
  const crop = getCrop(cropId);
  const length = Math.max(2, Math.ceil((crop.growingPeriodDays.min + crop.growingPeriodDays.max) / 2 / 30));
  return Array.from({ length }, (_, i) => climate?.months.find(m => m.month === ((startMonth - 1 + i) % 12) + 1)).filter((m): m is ClimateMonth => !!m);
}
function climateFit(cropId: CropId, months: ClimateMonth[]) {
  const crop = getCrop(cropId), temps = months.map(m => m.temperature);
  if (!months.length || temps.some(t => t === null)) return null;
  return mean(temps.map(t => fit(t!, crop.optimumTemperatureC.min, crop.optimumTemperatureC.max, 12)));
}
function latestSoil(field: RecommendationField, now: number) {
  return [...(field.soilTests ?? [])].filter(t => Date.parse(t.sampledOn) <= now).sort((a, b) => b.sampledOn.localeCompare(a.sampledOn))[0];
}

export function generateRecommendations(input: {
  field: RecommendationField; climate: ClimateAnalysis | null; weather: WeatherData | null;
  overview?: OverviewData | null; waterEstimate?: WaterEstimate | null; targetMonth?: number; now?: number;
}): RecommendationResult {
  const now = input.now ?? Date.now(), today = dayString(now), { field, climate } = input;
  const history = sortCropHistory(field.cropHistory ?? []);
  const elapsedHistory = history.filter(r => !r.plantedOn || r.plantedOn <= today);
  const orderedHistory = [...elapsedHistory]; // Unknown dates keep migrated newest-first order at the end.
  const previous = orderedHistory[0];
  const soil = latestSoil(field, now);
  const soilFresh = !!soil && now - Date.parse(soil.sampledOn) <= 3 * 365 * DAY;
  const validForecast = input.weather && now - Date.parse(input.weather.generatedAt) >= -3600000 && now - Date.parse(input.weather.generatedAt) <= 6 * 3600000;
  const weather = validForecast ? { ...input.weather!, forecast: input.weather!.forecast.filter(p => Date.parse(p.time) >= now - 3600000) } : null;
  const gaps: string[] = [];
  if (!history.length) gaps.push('No crop history: rotation and nutrient carryover cannot be assessed.');
  if (history.some(r => !r.plantedOn)) gaps.push('Some crop dates are unknown; rotation intervals cannot be confirmed.');
  if (!soil) gaps.push('No soil test: pH, salinity, NPK and other chemistry are unknown. NASA cannot supply these measurements.');
  else if (!soilFresh) gaps.push('Latest soil test is over three years old; chemistry is excluded from scoring until retested.');
  if (!soil?.nutrients.nitrogen || !soil?.nutrients.phosphorus || !soil?.nutrients.potassium) gaps.push('Incomplete NPK tests; no actual nutrient balance or fertilizer dose can be calculated.');
  if (!climate || climate.yearsUsable < 10) gaps.push('Fewer than ten usable climate years; long-term trend confidence is low.');
  if (input.overview?.temperature.date && now - Date.parse(input.overview.temperature.date) > 14 * DAY) gaps.push('Latest NASA air temperature observation is over 14 days old; it is not current weather.');
  if (input.overview?.soilWetness.date && now - Date.parse(input.overview.soilWetness.date) > 90 * DAY) gaps.push('NASA soil wetness is over 90 days old; do not use it as an irrigation trigger.');
  if (!weather?.forecast.length) gaps.push('Fresh weather forecast unavailable; frost, heat and rain warnings cannot be confirmed.');
  if (!field.management || field.management.irrigation === 'unknown') gaps.push('Irrigation availability is unknown; water recommendations are provisional.');
  if (!field.management?.currentCropId) gaps.push('No planting is marked as currently growing. Select one for irrigation and harvest advice.');
  const ranked: RankedCrop[] = CROPS.map((crop): RankedCrop => {
    const profile = AGRONOMY[crop.id];
    const droughtMultiplier = profile.droughtSensitivity === 'high' ? 1.25 : profile.droughtSensitivity === 'medium-high' ? 1 : 0.75;
    const candidates = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, fit: climateFit(crop.id, seasonFor(crop.id, climate, i + 1)) }));
    const best = [...candidates].filter(c => c.fit !== null).sort((a, b) => b.fit! - a.fit!)[0];
    const plantingMonth = input.targetMonth ?? best?.month ?? null;
    const months = plantingMonth ? seasonFor(crop.id, climate, plantingMonth) : [];
    const baseFit = plantingMonth ? climateFit(crop.id, months) : null;
    const reasons: string[] = [], risks: string[] = [], soilNotes: string[] = [], nutrients: string[] = [...profile.nutrientNotes, profile.residue];
    const factors: Factor[] = [];
    const add = (key: keyof typeof SCORE_POLICY, label: string, score: number | null, explanation: string, coverage = 1) => factors.push({ key, label, weight: SCORE_POLICY[key], coverage: score === null ? 0 : coverage, score: score === null ? null : round(clamp(score)), explanation });
    add('climate', 'Historical climate', baseFit, baseFit === null ? 'Not enough complete monthly temperatures for the candidate growing window.' : `Mean monthly temperatures over an approximate ${months.length}-month cycle compared with the crop optimum ${crop.optimumTemperatureC.min}–${crop.optimumTemperatureC.max} °C. Inside range = 100; subtract 12 points per °C outside; average the months.`);
    const rainTrend = months.length && months.every(m => m.rainTrendPerDecade !== null) ? months.reduce((sum, m) => sum + m.rainTrendPerDecade!, 0) : null;
    const tempTrend = mean(months.map(m => m.temperatureTrendPerDecade));
    const rainMean = months.length && months.every(m => m.rain !== null) ? months.reduce((sum, m) => sum + m.rain!, 0) : null;
    let adaptation: number | null = null;
    if (baseFit !== null && tempTrend !== null && rainTrend !== null && rainMean !== null && climate && climate.yearsUsable >= 10) {
      const sensitivity = mean(months.map(m => fit(m.temperature! + tempTrend, crop.optimumTemperatureC.min, crop.optimumTemperatureC.max, 12)))!;
      const decline = Math.max(0, -rainTrend / Math.max(1, rainMean));
      // A sensitivity test using a continuation of the observed decade trend, not a projection.
      const drySpellPenalty = Math.min(15, Math.max(0, climate.trends.drySpellDaysPerDecade ?? 0) * 2 * droughtMultiplier);
      const hotPenalty = Math.min(15, Math.max(0, climate.trends.hotDaysPerDecade ?? 0) * (crop.optimumTemperatureC.max < 30 ? 2 : 1));
      adaptation = clamp(sensitivity - Math.min(30, decline * 100 * profile.waterMm.min / 650 * droughtMultiplier) - drySpellPenalty - hotPenalty);
      reasons.push(`Climate sensitivity uses observed trends: ${round(tempTrend)} °C/decade in the candidate season and ${round(rainTrend)} mm/decade growing-window rain.`);
      if (decline > 0.1 || tempTrend > 0.5) risks.push('Observed warming or drying increases uncertainty; this trend sensitivity test is not a future climate forecast.');
    }
    add('adaptation', 'Climate adaptation sensitivity', adaptation, 'Repeat the temperature-fit calculation after adding one observed decade of temperature trend; subtract up to 30 points for declining growing-window rain, scaled by seasonal water demand and FAO drought sensitivity (low–medium 0.75, medium–high 1, high 1.25). Also subtract up to 15 for rising dry-spell length (2 points per day/decade × sensitivity) and up to 15 for increasing hot days (2 per day/decade for cool-optimum crops, 1 otherwise). This is a screening scenario, not a climate projection. At least ten usable years required.');
    let soilScore: number | null = null;
    if (soilFresh && soil) {
      const values: number[] = [];
      if (soil.ph !== undefined) { values.push(fit(soil.ph, crop.optimumSoilPh.min, crop.optimumSoilPh.max, 35)); soilNotes.push(`Measured pH ${soil.ph}; reference optimum ${crop.optimumSoilPh.min}–${crop.optimumSoilPh.max}.`); }
      if (soil.salinityEce !== undefined) { values.push(clamp(100 - Math.max(0, soil.salinityEce - profile.salinityThresholdEce) * 20)); soilNotes.push(`Measured ECe ${soil.salinityEce} dS/m; general threshold ${profile.salinityThresholdEce} dS/m. Variety and stage matter.`); if (soil.salinityEce > profile.salinityThresholdEce) risks.push('Measured salinity exceeds the crop reference threshold.'); }
      soilScore = mean(values);
      if (soil.organicMatterPercent !== undefined) soilNotes.push(`Measured organic matter ${soil.organicMatterPercent}%; texture and local interpretation are needed to judge adequacy.`);
    }
    if (!soilNotes.length) soilNotes.push('Soil compatibility unconfirmed: add a recent pH and/or saturated-paste salinity test.');
    add('soil', 'Soil compatibility', soilScore, 'Average known pH and ECe screening scores. pH: subtract 35 points per pH unit outside the optimum. ECe: subtract 20 per dS/m above the reference threshold. Unmeasured chemistry is not inferred.', soilFresh && soil ? Number(soil.ph !== undefined) * 0.5 + Number(soil.salinityEce !== undefined) * 0.5 : 0);
    const nutrientScores: number[] = [];
    if (soilFresh && soil) for (const key of ['nitrogen', 'phosphorus', 'potassium'] as const) {
      const measurement = soil.nutrients[key];
      if (!measurement || measurement.interpretation === 'unknown') continue;
      const demand = profile[key];
      nutrientScores.push(measurement.interpretation === 'sufficient' ? 100 : measurement.interpretation === 'high' ? 60 : demand === 'fixing' ? 70 : demand === 'high' ? 20 : 45);
      nutrients.push(`${key}: ${measurement.value} mg/kg, lab category ${measurement.interpretation}; crop demand class ${demand}.`);
      if (measurement.interpretation === 'low') risks.push(`Lab reports low ${key}; confirm crop-specific needs and local fertilizer guidance.`);
      if (measurement.interpretation === 'high') risks.push(`Lab reports high ${key}; avoid untested additional applications.`);
    }
    const prevProfile = previous ? AGRONOMY[previous.cropId] : null;
    if (prevProfile) {
      nutrients.push(`Previous ${getCrop(previous.cropId).name}: N ${prevProfile.nitrogen}, P ${prevProfile.phosphorus}, K ${prevProfile.potassium} screening demand. Past demand is not a measured soil nutrient debit.`);
      if (prevProfile.phosphorus === 'high' && profile.phosphorus === 'high') risks.push('Consecutive high-phosphorus-demand profiles: verify P tests and harvest exports before replanting.');
      if (prevProfile.potassium === 'high' && profile.potassium === 'high') risks.push('Repeated high potassium demand: test K and account for harvest removal.');
    }
    if (profile.nitrogen === 'fixing') reasons.push('A nodulated legume can supply much of its nitrogen; it does not replenish phosphorus or potassium and may not leave a net N surplus.');
    const repeatedPLow = soilFresh && soil?.nutrients.phosphorus?.interpretation === 'low' && prevProfile?.phosphorus === 'high' && profile.phosphorus === 'high';
    if (repeatedPLow) nutrients.push('Low measured P plus consecutive high-P demand triggers a 10-point nutrient screening penalty; this is a policy warning, not a calculated nutrient mass balance.');
    add('nutrients', 'Measured nutrient compatibility', nutrientScores.length ? Math.max(0, mean(nutrientScores)! - (repeatedPLow ? 10 : 0)) : null, 'Use the laboratory interpretation, never a universal mg/kg threshold: sufficient 100, high 60, low 20 for high demand or 45 for moderate demand; low N with a fixing crop 70, conditional on nodulation. Average measured, interpreted NPK only; subtract 10 for low lab P with consecutive high-P-demand crops.', nutrientScores.length / 3);
    const sameFamily = previous && getCrop(previous.cropId).family === crop.family;
    let rotation: number | null = previous ? previous.cropId === crop.id ? 15 : sameFamily ? 35 : 90 : null;
    if (previous && !sameFamily) reasons.push(`Changes family from ${getCrop(previous.cropId).family} to ${crop.family}, providing a potential disease-cycle break.`);
    if (previous?.cropId === crop.id) risks.push('Repeats the latest crop: greater carryover risk; avoid continuous cropping where possible.');
    else if (sameFamily) risks.push('Same family as the latest crop: shared pests or diseases may persist.');
    // Conservative local screening rule, not a universal disease-specific interval.
    if (crop.family === 'Solanaceae' && orderedHistory.some(r => getCrop(r.cropId).family === crop.family && (!r.plantedOn || (plantingMonth ? Date.UTC(new Date(now).getUTCFullYear() + (plantingMonth < new Date(now).getUTCMonth() + 1 ? 1 : 0), plantingMonth - 1, 1) : now) - Date.parse(r.plantedOn) < 3 * 365 * DAY))) {
      rotation = rotation === null ? 25 : Math.min(rotation, 25); risks.push('Solanaceae appear within three years or have unknown dates. CGS uses a conservative three-year screening break; verify local disease-specific advice.');
    }
    add('rotation', 'Crop rotation', rotation, 'CGS screening policy: different family 90, same family 35, identical crop 15. Solanaceae within three years (or unknown interval) cap at 25. Dates, disease history, residues and local advice can change the assessment.');
    const seasonRain = months.length && months.every(m => m.rain !== null) ? months.reduce((s, m) => s + m.rain!, 0) : null;
    let waterScore = seasonRain === null ? null : clamp(seasonRain / profile.waterMm.min * 100);
    if (field.management?.irrigation === 'irrigated') { risks.push('Irrigation is reported available; its capacity, quality and allocation still need verification.'); }
    if (seasonRain !== null && seasonRain < profile.waterMm.min) risks.push(`Historical growing-window rain (${Math.round(seasonRain)} mm) is below the reference seasonal crop water need (${profile.waterMm.min}–${profile.waterMm.max} mm). Effective rain is lower and irrigation may be needed.`);
    add('water', 'Rainfed water screening', waterScore, '100 × candidate-season historical rainfall / lower seasonal crop water need, capped at 100. This optimistic rainfed screen ignores runoff and stored soil water; reported irrigation is not assumed sufficient. It is not an irrigation prescription.');
    const frost = mean(months.map(m => m.frostDays));
    const hot = mean(months.map(m => m.hotDays));
    const frostSensitive = !['wheat', 'barley'].includes(crop.id);
    const seasonScore = baseFit === null || frost === null || hot === null ? null : clamp(baseFit - (frostSensitive ? frost * 10 : 0) - (crop.optimumTemperatureC.max < 30 ? hot * 5 : hot * 2));
    if (frostSensitive && frost !== null && frost > 0.5) risks.push('Historical frost days occur within this candidate window; use local frost dates and soil temperature before planting.');
    add('season', 'Growing window and extremes', seasonScore, 'Start with temperature-fit score. Subtract 10 per average monthly frost day for frost-sensitive crops; subtract 5 per hot day for cool-optimum crops or 2 otherwise. Hot day ≥35 °C, frost day <0 °C. Winter/spring cultivar phenology is unknown.');
    const known = factors.filter(f => f.score !== null), weight = known.reduce((s, f) => s + f.weight * f.coverage, 0);
    const weighted = known.reduce((s, f) => s + f.score! * f.weight * f.coverage / 100, 0);
    const score = weight ? Math.round(weighted / weight * 100) : null;
    const enough = weight >= 80 && climate && climate.yearsUsable >= 10 && soilFresh && ['nitrogen', 'phosphorus', 'potassium'].every(k => soil?.nutrients[k as 'nitrogen']?.interpretation && soil.nutrients[k as 'nitrogen']?.interpretation !== 'unknown') && !!history.length && !history.some(record => !record.plantedOn);
    if (months.some(month => month.rainCv !== null && month.rainCv > 0.6)) risks.push('Rainfall is variable across years in this growing window (monthly coefficient of variation above 0.6). Average rainfall can hide dry seasons.');
    const candidateNames = candidates.filter(c => c.fit !== null && c.fit >= 70).map(c => monthName(c.month));
    const planting = plantingMonth ? `${monthName(plantingMonth)}${input.targetMonth ? ' (your target month)' : ' (best historical-temperature screen)'}. ${candidateNames.length ? `Other temperature candidates: ${candidateNames.filter(n => n !== monthName(plantingMonth)).join(', ') || 'none'}. ` : ''}Confirm local sowing dates, soil temperature, frost-free period and cultivar; this is not a validated planting calendar.` : 'Planting period unavailable until sufficient monthly climate data is retrieved.';
    if (!soilFresh || nutrientScores.length < 3) risks.push('Missing or stale soil evidence: suitability is provisional, not proof of soil fertility.');
    reasons.push(`Seasonal crop water reference: ${profile.waterMm.min}–${profile.waterMm.max} mm; actual need varies with climate and crop duration. FAO drought sensitivity: ${profile.droughtSensitivity}.`);
    return { cropId: crop.id, score, rating: score === null ? 'Insufficient evidence' : score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Moderate' : 'Poor', evidencePercent: Math.round(weight), confidence: enough ? 'Moderate' : 'Low',
      scoreRange: [Math.round(weighted), Math.round(weighted + 100 - weight)], factors, reasons, risks, planting, plantingMonth, seasonalRainMm: seasonRain, seasonalWaterMm: profile.waterMm, nutrients, soil: soilNotes };
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.cropId.localeCompare(b.cropId));
  const climateNotes = climate ? [
    `${climate.start} to ${climate.end}: ${climate.yearsUsable}/${climate.yearsRequested} years have at least 90% valid temperature and rainfall days.`,
    `Observed trends per decade: temperature ${climate.trends.temperaturePerDecade === null ? 'unavailable' : `${round(climate.trends.temperaturePerDecade)} °C`}; rain ${climate.trends.rainPerDecade === null ? 'unavailable' : `${round(climate.trends.rainPerDecade)} mm`}; hot days ${climate.trends.hotDaysPerDecade === null ? 'unavailable' : round(climate.trends.hotDaysPerDecade)}; frost days ${climate.trends.frostDaysPerDecade === null ? 'unavailable' : round(climate.trends.frostDaysPerDecade)}.`,
    `Longest annual dry-spell trend: ${climate.trends.drySpellDaysPerDecade === null ? 'unavailable' : `${round(climate.trends.drySpellDaysPerDecade)} days/decade`}. Dry means <1 mm/day; gaps break a spell. This is a rainfall proxy, not a diagnosed agricultural drought.`,
    `Solar-radiation trend: ${climate.trends.solarPerDecade === null ? 'unavailable' : `${round(climate.trends.solarPerDecade)} MJ/m²/day per decade`}.`,
    'Linear trends describe these 15 observed years only. No climate-model projections or statistical significance are claimed.'
  ] : ['NASA climate analysis is unavailable. Recommendations use only the remaining known evidence.'];
  return { fieldId: field.id, point: field.point, generatedAt: new Date(now).toISOString(), catalogVersion: AGRONOMY_VERSION, ranked,
    current: currentAdvice(field, weather, input.overview ?? null, input.waterEstimate ?? null, now), gaps, climate, climateNotes,
    soilTestDate: soil?.sampledOn ?? null, forecastAt: weather?.generatedAt ?? null, forecastThrough: weather?.forecast.at(-1)?.time ?? null, forecast: weather, observations: input.overview ?? null, waterEstimate: input.waterEstimate ?? null };
}

function currentAdvice(field: RecommendationField, weather: WeatherData | null, overview: OverviewData | null, water: WaterEstimate | null, now: number): CurrentAdvice | null {
  const record = field.cropHistory?.find(r => r.id === field.management?.currentCropId);
  if (!record) return null;
  const crop = getCrop(record.cropId), profile = AGRONOMY[record.cropId];
  const planted = record.plantedOn ? Date.parse(record.plantedOn) : null;
  const days = planted === null ? null : Math.floor((now - planted) / DAY);
  const harvest = planted === null ? null : { earliest: dayString(planted + crop.growingPeriodDays.min * DAY), latest: dayString(planted + crop.growingPeriodDays.max * DAY) };
  const warnings: string[] = [], irrigation: string[] = [], management = [...profile.nutrientNotes];
  if (days !== null && days < 0) warnings.push('This planting is in the future. Confirm the planting date before using current-crop guidance.');
  if (harvest && now > Date.parse(harvest.latest)) warnings.push('Recorded crop is beyond its broad maturity range. Confirm whether it has been harvested; growth stage is not inferred.');
  const future = weather?.forecast.filter(p => Date.parse(p.time) >= now) ?? [];
  const temps = future.map(p => p.temperature).filter((v): v is number => v !== null);
  if (temps.some(t => t < 0)) warnings.push(`Forecast frost risk: minimum sampled air temperature ${Math.min(...temps).toFixed(1)} °C. Check crop stage and local protective measures.`);
  if (temps.some(t => t >= 35)) warnings.push(`Forecast heat risk: maximum sampled air temperature ${Math.max(...temps).toFixed(1)} °C. Check moisture and avoid heat-sensitive operations.`);
  if (future.some(p => p.precipitationPreviousHour !== null && p.precipitationPreviousHour >= 5)) warnings.push('A forecast sample includes ≥5 mm in its preceding hour. Review drainage and harvest trafficability; this is not a daily total.');
  if (future.some(p => p.humidity !== null && p.humidity >= 90)) warnings.push('High humidity appears in the forecast. Scout for disease if crop stage and local disease conditions warrant it; humidity alone is not a diagnosis.');
  if (future.some(p => p.windSpeed !== null && p.windSpeed >= 10)) warnings.push('Forecast samples show wind ≥10 m/s. Review lodging exposure and product-label wind limits before spraying.');
  if (!future.length) warnings.push('No fresh future forecast samples; weather-related risks cannot be ruled out.');
  const moisture = field.management?.soilMoisture;
  if (moisture && now - Date.parse(moisture.measuredAt) <= 48 * 3600000) {
    irrigation.push(`Field measurement: ${moisture.volumetricPercent}% volumetric moisture, ${moisture.measuredAt}, source ${moisture.source}.`);
    if (moisture.refillBelowPercent !== undefined) irrigation.push(moisture.volumetricPercent < moisture.refillBelowPercent ? `Below your field-specific refill threshold (${moisture.refillBelowPercent}%). Inspect the root zone and irrigation system; account for effective incoming rain before irrigating.` : `At or above your refill threshold (${moisture.refillBelowPercent}%). Avoid automatic watering; recheck the root zone and forecast.`);
    else irrigation.push('No field-specific refill threshold supplied. Texture, rooting depth and field capacity are required to interpret this moisture value.');
  } else irrigation.push('No root-zone moisture measurement from the last 48 hours. Measure the soil before deciding whether irrigation is needed.');
  if (water?.etoMm !== null && water?.etoMm !== undefined) {
    const daily = water.etoMm / water.days;
    irrigation.push(`Historical reference evapotranspiration: ${round(water.etoMm)} mm over ${water.start}–${water.end} (${water.days} complete days), using temperature-based Hargreaves-Samani. This is a rough estimate, not a forecast or a measured deficit.`);
    if (field.management?.growthStage === 'mid-season') irrigation.push(`At your reported mid-season stage, FAO reference Kc ${profile.kcMid} gives approximate crop ET ${round(daily * profile.kcMid)} mm/day for that historical weather. Net irrigation remains unknown without effective rain, root-zone storage and system efficiency.`);
    else irrigation.push('Report a mid-season stage to use the reference mid-season crop coefficient; crop ET is not inferred from age alone.');
  } else irrigation.push('Reference evapotranspiration could not be estimated: complete daily minimum/maximum temperatures are required.');
  if (water?.rainMm !== null && water?.rainMm !== undefined) irrigation.push(`NASA rainfall over the same ${water.days} days: ${round(water.rainMm)} mm. Total rain is not automatically effective root-zone water.`);
  if (future.some(p => (p.precipitationPreviousHour ?? 0) > 0)) irrigation.push('Rain appears in forecast samples. Check timing and the full accumulation forecast before watering; 3-hourly samples of preceding-hour rain cannot be summed into a full-day total.');
  if (overview?.soilWetness.value !== null && overview?.soilWetness.value !== undefined) irrigation.push(`Regional NASA ${overview.soilLabel ?? 'soil wetness'}: ${round(overview.soilWetness.value)}${overview.soilWetness.unit} (${overview.soilWetness.date}). This is not a root-zone field sensor or a chemistry test.`);
  irrigation.push(`Seasonal crop water reference ${profile.waterMm.min}–${profile.waterMm.max} mm; it is not a prescription for this field.`);
  return { cropName: crop.name, plantedOn: record.plantedOn, daysSincePlanting: days, growthStage: field.management?.growthStage || 'Not reported', harvest,
    harvestNote: 'Broad planting-date plus species-cycle range, not a predicted harvest date. Confirm cultivar, maturity, growing-degree requirements, crop inspection and forecast before harvesting.', irrigation, warnings, management };
}

export function estimateReferenceEt(days: { date: string; temperature: number | null; minimum: number | null; maximum: number | null; rain: number | null }[], latitude: number) {
  let eto = 0;
  if (!days.length || days.some(d => d.temperature === null || d.minimum === null || d.maximum === null || d.maximum! < d.minimum!)) return null;
  for (const d of days) {
    const year = Number(d.date.slice(0, 4));
    const j = Math.floor((Date.parse(d.date) - Date.UTC(year, 0, 1)) / DAY) + 1;
    const phi = latitude * Math.PI / 180;
    const dr = 1 + 0.033 * Math.cos(2 * Math.PI * j / 365);
    const delta = 0.409 * Math.sin(2 * Math.PI * j / 365 - 1.39);
    const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(delta))));
    const ra = Math.max(0, 24 * 60 / Math.PI * 0.0820 * dr * (ws * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.sin(ws)));
    eto += Math.max(0, 0.0023 * (d.temperature! + 17.8) * Math.sqrt(d.maximum! - d.minimum!) * ra * 0.408);
  }
  return eto;
}
