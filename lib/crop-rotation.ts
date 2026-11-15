import { AGRONOMY, NUTRIENTS, type NutrientKey, type SoilTest } from './agronomy';
import { CROPS, getCrop, getRotationHistory, type CropId, type CropRecord } from './crops';
import { generateRecommendations, type RecommendationField } from './recommendations';
import type { ClimateAnalysis } from './climate';

const DAY = 86400000;
const clamp = (value: number) => Math.max(0, Math.min(100, value));
const date = (time: number) => new Date(time).toISOString().slice(0, 10);
const NPK: NutrientKey[] = ['nitrogen', 'phosphorus', 'potassium'];
export interface RotationChemical {
  nutrient: NutrientKey; value: number; unit: 'mg/kg'; interpretation: string; used: boolean;
}
export interface RotationStep {
  cropId: CropId; order: number; plantingOn: string; availableAfter: string;
  score: number; evidencePercent: number; factors: { suitability: number | null; chemistry: number | null; rotation: number };
  demand: { nitrogen: string; phosphorus: string; potassium: string };
  reasons: string[]; cautions: string[];
}
export interface RotationPlan {
  version: string; history: CropRecord[]; steps: RotationStep[]; score: number | null;
  alternatives: { crops: CropId[]; score: number }[]; evaluatedSequences: number;
  soilTestDate: string | null; chemistry: RotationChemical[]; ph: number | null;
  salinityEce: number | null; organicMatterPercent: number | null; soilFresh: boolean;
  confidence: 'Low' | 'Moderate'; limitations: string[];
}
function latestSoil(field: RecommendationField, now: number) {
  return [...(field.soilTests ?? [])].filter(test => Date.parse(test.sampledOn) <= now).sort((a, b) => b.sampledOn.localeCompare(a.sampledOn))[0];
}
export function scoreRotationChemistry(cropId: CropId, soil: SoilTest | undefined, history: CropRecord[], now: number) {
  const profile = AGRONOMY[cropId];
  if (!soil || now - Date.parse(soil.sampledOn) > 3 * 365 * DAY) return { score: null, coverage: 0, reasons: [] as string[], cautions: [] as string[] };
  let weighted = 0, known = 0;
  const reasons: string[] = [], cautions: string[] = [];
  const totalWeight = NUTRIENTS.reduce((sum, key) => sum + (NPK.includes(key) ? 3 : profile.nutrientFocus.includes(key) ? 2 : 1), 0);
  // Interpret lab categories against crop demand; do not simulate unmeasured nutrient depletion.
  for (const key of NUTRIENTS) {
    const measurement = soil.nutrients[key];
    if (!measurement || measurement.interpretation === 'unknown') continue;
    const priority = profile.nutrientFocus.includes(key);
    const weight = NPK.includes(key) ? 3 : priority ? 2 : 1;
    let score = 100;
    if (NPK.includes(key)) {
      const demand = profile[key as 'nitrogen' | 'phosphorus' | 'potassium'];
      score = measurement.interpretation === 'sufficient' ? 100 : measurement.interpretation === 'high' ? 60 : demand === 'fixing' ? 70 : demand === 'high' ? 20 : 45;
      if (measurement.interpretation === 'low' && demand === 'high') {
        const pressure = history.reduce((sum, record, index) => sum + (AGRONOMY[record.cropId][key as 'nitrogen' | 'phosphorus' | 'potassium'] === 'high' ? [1, 0.65, 0.35][index] : 0), 0);
        score = Math.max(0, score - Math.min(12, pressure * 6));
        cautions.push(`Low measured ${key} meets high crop demand; ${history.filter(record => AGRONOMY[record.cropId][key as 'nitrogen' | 'phosphorus' | 'potassium'] === 'high').length} of the preceding three crops also have high demand. Test and manage supply before planting.`);
      }
    } else {
      // Qualitative attention policy, not a universal concentration or toxicity threshold.
      score = measurement.interpretation === 'low' ? (priority ? 35 : 60) : measurement.interpretation === 'high' ? 75 : 100;
      if (measurement.interpretation !== 'sufficient') cautions.push(`Lab ${key}: ${measurement.value} mg/kg (${measurement.interpretation})${priority ? '; highlighted in this crop profile' : ''}. Confirm crop-specific interpretation; no fertilizer dose or toxicity threshold is inferred.`);
    }
    weighted += score * weight; known += weight;
  }
  if (known) reasons.push(`Chemistry screen uses ${NUTRIENTS.filter(key => soil.nutrients[key] && soil.nutrients[key]!.interpretation !== 'unknown').length}/9 interpreted lab nutrients; missing or uninterpreted values are excluded.`);
  if (profile.nitrogen === 'fixing') reasons.push('Effective soybean nodulation can reduce reliance on external N. This does not restore P or K or guarantee a net soil N gain.');
  return { score: known ? weighted / known : null, coverage: known / totalWeight, reasons, cautions };
}
function historyFit(cropId: CropId, history: CropRecord[], planting: number) {
  const crop = getCrop(cropId), previous = history[0];
  const reasons: string[] = [], cautions: string[] = [];
  let penalty = 0;
  history.forEach((record, index) => {
    const weight = [1, 0.65, 0.35][index];
    if (record.cropId === cropId) penalty += 35 * weight;
    else if (getCrop(record.cropId).family === crop.family) penalty += 22 * weight;
  });
  if (previous && getCrop(previous.cropId).family !== crop.family) reasons.push(`Changes family from ${getCrop(previous.cropId).family} to ${crop.family}, reducing repeated-family pressure.`);
  if (crop.family === 'Solanaceae' && history.some(record => getCrop(record.cropId).family === crop.family && (!record.plantedOn || planting - Date.parse(record.plantedOn) < 3 * 365 * DAY))) {
    penalty += 35;
    cautions.push('A solanaceous planting is within three years, or its date is unknown. A three-crop sequence is not automatically a three-year disease break.');
  }
  if (penalty > 0) cautions.push('The preceding three plantings include this crop or family; the sequence score includes a repeat-pressure penalty.');
  return { score: clamp(100 - penalty), reasons, cautions };
}
function nextWindow(available: number, month: number) {
  const start = new Date(available);
  let time = Date.UTC(start.getUTCFullYear(), month - 1, 1);
  if (time < available) time = Date.UTC(start.getUTCFullYear() + 1, month - 1, 1);
  return time;
}

export function generateRotationPlan(input: { field: RecommendationField; climate: ClimateAnalysis | null; targetMonth?: number; now?: number }): RotationPlan {
  const now = input.now ?? Date.now();
  const history = getRotationHistory(input.field.cropHistory ?? [], date(now)).past;
  const soil = latestSoil(input.field, now);
  const soilFresh = !!soil && now - Date.parse(soil.sampledOn) <= 3 * 365 * DAY;
  const limitations = [
    'Three future crop cycles, not three guaranteed calendar years. Confirm local sowing dates, actual harvest, cultivar and disease-specific rotation intervals.',
    'Soil chemistry is held at the latest measured baseline, not projected after harvest. Retest before later crops; yield, amendments, residues and nutrient exports are not known.',
    'N/P/K demand classes and secondary/micronutrient priorities are qualitative screening profiles, not crop chemical contents or measured nutrient removal.'
  ];
  if (history.length < 3) limitations.push(`Only ${history.length}/3 past plantings are recorded; the plan uses the available history.`);
  if (history.some(record => !record.plantedOn)) limitations.push('Some planting dates are unknown; calendar rotation intervals cannot be confirmed.');
  if (!soilFresh) limitations.push(soil ? 'The latest soil test is over three years old; chemistry is excluded from scoring.' : 'No soil test is recorded; chemistry is unknown and excluded from scoring.');
  if (!input.climate) limitations.push('Climate history is unavailable. No climate-based growing window can be established.');
  if (input.field.management?.irrigation !== 'irrigated') limitations.push('Water screening assumes rainfall; irrigation capacity and effective root-zone water are unconfirmed.');
  const result: RotationPlan = {
    version: 'rotation-v1', history, steps: [], score: null, alternatives: [], evaluatedSequences: 0,
    soilTestDate: soil?.sampledOn ?? null, chemistry: NUTRIENTS.flatMap(nutrient => {
      const test = soil?.nutrients[nutrient]; return test ? [{ nutrient, ...test, used: soilFresh && test.interpretation !== 'unknown' }] : [];
    }), ph: soil?.ph ?? null, salinityEce: soil?.salinityEce ?? null, organicMatterPercent: soil?.organicMatterPercent ?? null, soilFresh,
    confidence: 'Low', limitations
  };
  // Use the upper duration of the latest planting as a conservative availability assumption.
  const latest = history[0];
  const available = latest?.plantedOn ? Math.max(now, Date.parse(latest.plantedOn) + getCrop(latest.cropId).growingPeriodDays.max * DAY) : now;
  const solutions: { steps: RotationStep[]; score: number }[] = [];
  // Search full sequences so a strong first crop cannot hide poor later transitions.
  function visit(steps: RotationStep[], preceding: CropRecord[], earliest: number) {
    if (steps.length === 3) {
      result.evaluatedSequences++;
      const weights = [1, 0.9, 0.8];
      solutions.push({ steps, score: steps.reduce((sum, step, index) => sum + step.score * weights[index], 0) / 2.7 });
      return;
    }
    // Pure scoring only: reuse downloaded climate and field data, with no further API calls.
    const rankings = generateRecommendations({ field: { ...input.field, cropHistory: preceding }, climate: input.climate, weather: null, now: earliest, targetMonth: steps.length === 0 ? input.targetMonth : undefined }).ranked;
    let advanced = false;
    for (const candidate of rankings) {
      const crop = getCrop(candidate.cropId), profile = AGRONOMY[candidate.cropId];
      if (steps.some(step => step.cropId === crop.id) || (preceding[0] && getCrop(preceding[0].cropId).family === crop.family)) continue;
      if (candidate.plantingMonth === null) continue;
      const planting = nextWindow(earliest, candidate.plantingMonth);
      const soilUsableAtPlanting = !!soil && planting - Date.parse(soil.sampledOn) <= 3 * 365 * DAY;
      const factors = candidate.factors.filter(factor => (factor.key !== 'soil' || soilUsableAtPlanting) && ['climate', 'adaptation', 'soil', 'water', 'season'].includes(factor.key) && factor.score !== null);
      const weight = factors.reduce((sum, factor) => sum + factor.weight * factor.coverage, 0);
      const suitability = weight ? factors.reduce((sum, factor) => sum + factor.score! * factor.weight * factor.coverage, 0) / weight : null;
      const factor = (key: string) => candidate.factors.find(factor => factor.key === key)?.score;
      // Do not force a third crop when the available climate/soil evidence rejects it.
      if (suitability === null || (factor('climate') != null && factor('climate')! < 30) || (soilUsableAtPlanting && factor('soil') != null && factor('soil')! < 20) || (factor('season') != null && factor('season')! < 20)) continue;
      const baseline = scoreRotationChemistry(crop.id, soil, preceding.slice(0, 3), planting);
      const rotation = historyFit(crop.id, preceding.slice(0, 3), planting);
      const chemistryWeight = 25 * baseline.coverage;
      const denominator = 50 + 25 + chemistryWeight;
      const score = (suitability * 50 + rotation.score * 25 + (baseline.score ?? 0) * chemistryWeight) / denominator;
      const evidencePercent = Math.round((weight / 65 * 50) + 25 * Math.min(1, preceding.length / 3) + chemistryWeight);
      const end = planting + crop.growingPeriodDays.max * DAY;
      const step: RotationStep = {
        cropId: crop.id, order: steps.length + 1, plantingOn: date(planting), availableAfter: date(end),
        score: Math.round(score), evidencePercent, factors: { suitability: Math.round(suitability), chemistry: baseline.score === null ? null : Math.round(baseline.score), rotation: Math.round(rotation.score) },
        demand: { nitrogen: profile.nitrogen, phosphorus: profile.phosphorus, potassium: profile.potassium },
        reasons: [...rotation.reasons, ...baseline.reasons, `Historical seasonal suitability ${Math.round(suitability)}/100; broad planting window ${new Date(planting).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}.`, profile.residue],
        cautions: [...new Set([...rotation.cautions, ...baseline.cautions, ...(!soilUsableAtPlanting ? ['Soil chemistry must be retested for this planting window; current test evidence is unavailable or too old.'] : []), ...candidate.risks.filter(risk => !risk.startsWith('Repeats the latest crop:') && !risk.startsWith('Same family as the latest crop:') && (soilUsableAtPlanting || (!risk.startsWith('Measured salinity') && !risk.startsWith('Lab reports'))))])]
      };
      advanced = true;
      visit([...steps, step], [{ id: `planned-${steps.length}-${crop.id}`, cropId: crop.id, plantedOn: date(planting) }, ...preceding].slice(0, 3), end);
    }
    if (!advanced && steps.length) solutions.push({ steps, score: steps.reduce((sum, step) => sum + step.score, 0) / steps.length });
  }
  visit([], history, available);
  // Prefer complete plans, then compare their weighted scores with deterministic ties.
  solutions.sort((a, b) => b.steps.length - a.steps.length || b.score - a.score || a.steps.map(step => step.cropId).join(',').localeCompare(b.steps.map(step => step.cropId).join(',')));
  const best = solutions[0];
  if (best) {
    result.steps = best.steps; result.score = Math.round(best.score);
    result.alternatives = solutions.filter(plan => plan.steps.length === 3).slice(1, 3).map(plan => ({ crops: plan.steps.map(step => step.cropId), score: Math.round(plan.score) }));
    const completeChemistry = soilFresh && NUTRIENTS.every(nutrient => soil?.nutrients[nutrient] && soil.nutrients[nutrient]!.interpretation !== 'unknown');
    result.confidence = history.length === 3 && history.every(record => record.plantedOn) && completeChemistry && !!input.climate && input.climate.yearsUsable >= 10 && best.steps.every(step => step.evidencePercent >= 80) ? 'Moderate' : 'Low';
    if (best.steps.length < 3) limitations.push(`Only ${best.steps.length} steps passed the available evidence and family-break constraints; no unsupported third crop was forced.`);
  } else limitations.push('No sequence meets the current climate, soil and family-break constraints. Add missing evidence or review the planting month.');
  return result;
}
