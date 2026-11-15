import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Compile the pure production modules into an isolated temp directory. All synthetic
// weather below is test input only; production recommendations always call real APIs.
const compiled = mkdtempSync(join(tmpdir(), 'cgs-recommendations-tests-'));
after(() => { assert.ok(resolve(compiled).startsWith(resolve(tmpdir()) + '\\cgs-recommendations-tests-') || resolve(compiled).startsWith(resolve(tmpdir()) + '/cgs-recommendations-tests-')); rmSync(compiled, { recursive: true, force: true }); });
for (const name of ['crops', 'agronomy', 'climate', 'recommendations']) {
  const source = readFileSync(new URL(`../lib/${name}.ts`, import.meta.url), 'utf8').replace("import cropProfiles from './data/crop-agronomy.json';", `const cropProfiles = ${readFileSync(new URL('../lib/data/crop-agronomy.json', import.meta.url), 'utf8')};`);
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/from ['"]\.\/([^'"]+)['"]/g, 'from "./$1.mjs"');
  writeFileSync(join(compiled, `${name}.mjs`), output);
}
const { generateRecommendations, estimateReferenceEt, SCORE_POLICY } = await import(pathToFileURL(join(compiled, 'recommendations.mjs')));
const { analyseClimate, parsePowerClimate, slopePerDecade } = await import(pathToFileURL(join(compiled, 'climate.mjs')));
const { isSoilTest, isFieldManagement, AGRONOMY } = await import(pathToFileURL(join(compiled, 'agronomy.mjs')));
const NOW = Date.parse('2026-11-14T12:00:00Z');
const field = { id: 'a', name: 'North field', point: [20.995, 42.009], radius: 100, cropHistory: [{ id: 'r1', cropId: 'potato', plantedOn: '2026-09-01' }], management: { currentCropId: 'r1', irrigation: 'rainfed', growthStage: 'mid-season' } };
const sample = { id: 'test', sampledOn: '2026-10-01', source: 'Local laboratory', method: 'Olsen P, exchangeable K, water pH', depthCm: 20, ph: 6.2, salinityEce: 0.5, nutrients: { nitrogen: { value: 12, unit: 'mg/kg', interpretation: 'low' }, phosphorus: { value: 8, unit: 'mg/kg', interpretation: 'low' }, potassium: { value: 100, unit: 'mg/kg', interpretation: 'sufficient' } } };
const emptyClimate = () => ({ start: '2011-01-01', end: '2025-12-31', yearsRequested: 15, yearsUsable: 15, months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, years: 15, temperature: 20, minimum: 12, maximum: 28, rain: 60, humidity: 60, wind: 2, solar: 15, frostDays: 0, hotDays: 0, dryDays: 10, rainCv: 0.3, rainTrendPerDecade: -2, temperatureTrendPerDecade: 0.3 })), annual: Array.from({ length: 15 }, (_, i) => ({ year: 2011 + i, temperature: 20, rain: 720, solar: 15, hotDays: 0, frostDays: 0, longestDrySpell: 10 })), trends: { temperaturePerDecade: 0.3, rainPerDecade: -24, solarPerDecade: 0, hotDaysPerDecade: 1, frostDaysPerDecade: -1, drySpellDaysPerDecade: 1 } });
const run = (overrides = {}) => generateRecommendations({ field, climate: emptyClimate(), weather: null, now: NOW, ...overrides });
const factor = (report, id, key) => report.ranked.find(r => r.cropId === id).factors.find(f => f.key === key);

describe('Climate evidence and coverage', () => {
  it('recovers a known linear trend without confusing it with a forecast', () => {
    assert.ok(Math.abs(slopePerDecade(Array.from({ length: 15 }, (_, i) => ({ year: 2011 + i, value: 10 + i * 0.1 }))) - 1) < 1e-9);
    assert.equal(slopePerDecade(Array.from({ length: 9 }, (_, i) => ({ year: 2011 + i, value: i }))), null);
  });
  it('treats NASA fill values as missing, while preserving real zero rain', () => {
    const days = parsePowerClimate({ properties: { parameter: { T2M: { '20250101': -999 }, PRECTOTCORR: { '20250101': 0 } } } });
    assert.equal(days[0].temperature, null); assert.equal(days[0].rain, 0);
    assert.throws(() => parsePowerClimate({}));
  });
  it('requires 90% daily coverage and five years before monthly climatology', () => {
    const days = Array.from({ length: 30 }, (_, i) => ({ date: `2025-01-${String(i + 1).padStart(2, '0')}`, temperature: 12, minimum: 1, maximum: 20, rain: 0, humidity: 50, wind: 2, solar: 10 }));
    const result = analyseClimate(days, 2011, 2025);
    assert.equal(result.yearsUsable, 0); assert.equal(result.months[0].temperature, null); assert.equal(result.trends.temperaturePerDecade, null);
  });
  it('keeps missing humidity missing rather than assuming it follows temperature', () => {
    const days = [];
    for (let year = 2011; year <= 2025; year++) for (let time = Date.UTC(year, 0, 1); time < Date.UTC(year + 1, 0, 1); time += 86400000) days.push({ date: new Date(time).toISOString().slice(0, 10), temperature: 15 + (year - 2011) * 0.1, minimum: -1, maximum: 36, rain: 0, humidity: null, wind: 2, solar: 10 });
    const result = analyseClimate(days, 2011, 2025);
    assert.equal(result.yearsUsable, 15); assert.ok(Math.abs(result.trends.temperaturePerDecade - 1) < 1e-9); assert.equal(result.months[0].humidity, null);
    assert.equal(result.annual[0].longestDrySpell, 365); assert.equal(result.annual[1].longestDrySpell, 366);
  });
});

describe('Field-specific recommendation scoring', () => {
  it('covers all crops and produces deterministic rankings tied to the correct field', () => {
    const a = run(); assert.deepEqual(a, run()); assert.equal(a.fieldId, 'a'); assert.deepEqual(a.point, field.point); assert.equal(a.ranked.length, 7);
    assert.equal(Object.values(SCORE_POLICY).reduce((a, b) => a + b, 0), 100);
    for (const crop of a.ranked) { assert.ok(crop.score >= 0 && crop.score <= 100); assert.equal(crop.factors.length, 7); assert.ok(AGRONOMY[crop.cropId]); }
  });
  it('ranks crops without optional field details and incorporates supplied soil evidence', () => {
    const optionalField = { id: field.id, name: field.name, point: field.point, radius: field.radius };
    const baseline = run({ field: optionalField });
    assert.equal(baseline.current, null);
    assert.ok(baseline.ranked.every(crop => Number.isFinite(crop.score)));
    assert.equal(factor(baseline, 'potato', 'soil').score, null);
    const withSoil = run({ field: { ...optionalField, soilTests: [sample] } });
    assert.notEqual(factor(withSoil, 'potato', 'soil').score, null);
    assert.notEqual(factor(withSoil, 'potato', 'nutrients').score, null);
    assert.ok(withSoil.ranked.some(crop => crop.score !== baseline.ranked.find(previous => previous.cropId === crop.cropId).score));
    const irrigated = run({ field: { ...optionalField, management: { currentCropId: null, irrigation: 'irrigated' } } });
    assert.deepEqual(irrigated.ranked.map(crop => crop.score), baseline.ranked.map(crop => crop.score));
  });
  it('never infers NPK from weather or previous crops', () => {
    const report = run();
    assert.ok(report.ranked.every(c => c.factors.find(f => f.key === 'nutrients').score === null));
    assert.ok(report.ranked.every(c => c.confidence === 'Low'));
    assert.match(report.gaps.join(' '), /NASA cannot supply/);
  });
  it('penalizes continuous cropping and recent shared-family rotations', () => {
    const report = run();
    assert.equal(factor(report, 'potato', 'rotation').score, 15);
    assert.equal(factor(report, 'tomato', 'rotation').score, 25);
    assert.equal(factor(report, 'soybean', 'rotation').score, 90);
    assert.ok(report.ranked.find(c => c.cropId === 'potato').risks.some(r => /high-phosphorus/.test(r)));
  });
  it('uses actual lab categories and reduces partial NPK evidence weight', () => {
    const report = run({ field: { ...field, soilTests: [sample] } });
    assert.ok(factor(report, 'soybean', 'nutrients').score > factor(report, 'potato', 'nutrients').score);
    assert.equal(factor(report, 'potato', 'nutrients').coverage, 1);
    const partial = run({ field: { ...field, soilTests: [{ ...sample, nutrients: { phosphorus: sample.nutrients.phosphorus } }] } });
    assert.equal(factor(partial, 'potato', 'nutrients').coverage, 1 / 3);
    assert.ok(partial.ranked[0].evidencePercent < report.ranked[0].evidencePercent);
  });
  it('excludes stale soil tests and does not use raw concentrations without lab interpretation', () => {
    const old = run({ field: { ...field, soilTests: [{ ...sample, sampledOn: '2020-01-01' }] } });
    assert.equal(factor(old, 'potato', 'soil').score, null);
    const unknown = run({ field: { ...field, soilTests: [{ ...sample, nutrients: { phosphorus: { value: 999, unit: 'mg/kg', interpretation: 'unknown' } } }] } });
    assert.equal(factor(unknown, 'potato', 'nutrients').score, null);
  });
  it('flags salinity incompatibility and shows missing-data bounds', () => {
    const report = run({ field: { ...field, soilTests: [{ ...sample, salinityEce: 8 }] } });
    assert.ok(factor(report, 'barley', 'soil').score > factor(report, 'maize', 'soil').score);
    const missing = run({ climate: null, field: { ...field, cropHistory: [] } });
    assert.ok(missing.ranked.every(c => c.score === null)); assert.deepEqual(missing.ranked[0].scoreRange, [0, 100]);
  });
  it('uses the selected month and penalizes warming beyond crop temperature optimum', () => {
    const climate = emptyClimate(); climate.months.forEach(m => { m.temperature = 33; m.temperatureTrendPerDecade = 1; m.rainTrendPerDecade = 0; });
    const report = run({ climate, targetMonth: 7 });
    assert.ok(report.ranked.every(c => c.plantingMonth === 7));
    assert.ok(factor(report, 'maize', 'adaptation').score < factor(report, 'maize', 'climate').score);
  });
});

describe('Current crop and irrigation safeguards', () => {
  it('requires explicit current-crop selection rather than treating latest history as active', () => {
    assert.equal(run({ field: { ...field, management: undefined } }).current, null);
    const report = run(); assert.equal(report.current.cropName, 'Potato'); assert.equal(report.current.harvest.earliest, '2026-11-30');
  });
  it('uses fresh forecasts for risks and refuses stale forecasts', () => {
    const weather = { source: 'Meteomatics', generatedAt: '2026-11-14T11:00:00Z', point: field.point, forecast: [{ time: '2026-11-14T15:00:00Z', temperature: -2, humidity: 95, windSpeed: 12, windDirection: 0, precipitationPreviousHour: 6 }] };
    const current = run({ weather }).current;
    assert.ok(current.warnings.some(r => /frost/i.test(r))); assert.ok(current.warnings.some(r => /wind/i.test(r)));
    assert.ok(current.irrigation.some(r => /cannot be summed/.test(r)));
    const stale = run({ weather: { ...weather, generatedAt: '2026-11-01T11:00:00Z' } });
    assert.equal(stale.forecastAt, null); assert.ok(stale.gaps.some(r => /forecast unavailable/.test(r)));
  });
  it('reports historical ET separately from irrigation requirement and uses measured refill thresholds', () => {
    const report = run({ field: { ...field, management: { ...field.management, soilMoisture: { measuredAt: '2026-11-14T10:00:00Z', volumetricPercent: 15, refillBelowPercent: 20, source: 'Root zone sensor' } } }, waterEstimate: { start: '2026-11-01', end: '2026-11-07', days: 7, etoMm: 21, rainMm: 5, source: 'NASA', retrievedAt: '2026-11-14T10:00:00Z' } });
    assert.ok(report.current.irrigation.some(r => /Below your field-specific/.test(r)));
    assert.ok(report.current.irrigation.some(r => /Net irrigation remains unknown/.test(r)));
  });
  it('calculates finite Hargreaves reference ET and refuses missing temperature extrema', () => {
    const day = { date: '2026-07-01', temperature: 25, minimum: 18, maximum: 32, rain: 0 };
    const et = estimateReferenceEt([day], 42); assert.ok(et > 2 && et < 10);
    assert.equal(estimateReferenceEt([{ ...day, maximum: null }], 42), null);
  });
});

describe('Persistent soil and management schema validation', () => {
  it('accepts real partial tests with methods, dates and units and rejects invalid values', () => {
    assert.ok(isSoilTest(sample));
    assert.ok(!isSoilTest({ ...sample, ph: 20 })); assert.ok(!isSoilTest({ ...sample, sampledOn: '2026-02-30' })); assert.ok(!isSoilTest({ ...sample, method: '' }));
    assert.ok(!isSoilTest({ ...sample, nutrients: { phosphorus: { value: 5, unit: 'kg/ha', interpretation: 'low' } } }));
    assert.ok(isFieldManagement(field.management));
    assert.ok(!isFieldManagement({ ...field.management, soilMoisture: { volumetricPercent: 150, source: 'sensor', measuredAt: '2026-01-01' } }));
  });
});
