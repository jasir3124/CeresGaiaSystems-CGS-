export interface ClimateDay {
  date: string; temperature: number | null; minimum: number | null; maximum: number | null;
  rain: number | null; humidity: number | null; wind: number | null; solar: number | null;
}
export interface ClimateMonth {
  month: number; years: number; temperature: number | null; minimum: number | null; maximum: number | null;
  rain: number | null; humidity: number | null; wind: number | null; solar: number | null;
  frostDays: number | null; hotDays: number | null; dryDays: number | null;
  rainCv: number | null; rainTrendPerDecade: number | null; temperatureTrendPerDecade: number | null;
}
export interface ClimateYear {
  year: number; temperature: number | null; rain: number | null; solar: number | null;
  hotDays: number | null; frostDays: number | null; longestDrySpell: number | null;
}
export interface ClimateAnalysis {
  start: string; end: string; yearsRequested: number; yearsUsable: number;
  months: ClimateMonth[]; annual: ClimateYear[];
  trends: { temperaturePerDecade: number | null; rainPerDecade: number | null; solarPerDecade: number | null; hotDaysPerDecade: number | null; frostDaysPerDecade: number | null; drySpellDaysPerDecade: number | null };
}
export const mean = (values: (number | null)[]) => {
  const valid = values.filter((v): v is number => v !== null && Number.isFinite(v));
  return valid.length ? valid.reduce((sum, v) => sum + v, 0) / valid.length : null;
};
// Least-squares historical trend; require ten valid years and report change per decade.
export function slopePerDecade(points: { year: number; value: number | null }[]) {
  const valid = points.filter((p): p is { year: number; value: number } => p.value !== null && Number.isFinite(p.value));
  if (valid.length < 10 || Math.max(...valid.map(p => p.year)) - Math.min(...valid.map(p => p.year)) < 9) return null;
  const x = mean(valid.map(p => p.year))!, y = mean(valid.map(p => p.value))!;
  const denominator = valid.reduce((sum, p) => sum + (p.year - x) ** 2, 0);
  return denominator ? valid.reduce((sum, p) => sum + (p.year - x) * (p.value - y), 0) / denominator * 10 : null;
}
// Sparse periods stay unknown; daily coverage must reach 90% for each metric.
function aggregate(rows: ClimateDay[], expected: number) {
  const enough = (key: keyof ClimateDay) => rows.filter(r => typeof r[key] === 'number').length >= Math.ceil(expected * 0.9);
  const average = (key: Exclude<keyof ClimateDay, 'date'>) => enough(key) ? mean(rows.map(r => r[key])) : null;
  const rainValid = enough('rain');
  let spell = 0, longest = 0, previous = 0;
  for (const day of rows) {
    const time = Date.parse(day.date);
    if (time - previous !== 86400000) spell = 0;
    spell = day.rain !== null && day.rain < 1 ? spell + 1 : 0;
    longest = Math.max(longest, spell); previous = time;
  }
  return { temperature: average('temperature'), minimum: average('minimum'), maximum: average('maximum'),
    rain: rainValid ? rows.reduce((sum, r) => sum + (r.rain ?? 0), 0) : null,
    humidity: average('humidity'), wind: average('wind'), solar: average('solar'),
    hotDays: enough('maximum') ? rows.filter(r => r.maximum !== null && r.maximum >= 35).length : null,
    frostDays: enough('minimum') ? rows.filter(r => r.minimum !== null && r.minimum < 0).length : null,
    dryDays: rainValid ? rows.filter(r => r.rain !== null && r.rain < 1).length : null,
    longestDrySpell: rainValid ? longest : null };
}
export function analyseClimate(input: ClimateDay[], firstYear: number, lastYear: number): ClimateAnalysis {
  // One record per UTC calendar date; no extrapolation over missing days.
  const rows = [...new Map(input.filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.date >= `${firstYear}-01-01` && r.date <= `${lastYear}-12-31`).map(r => [r.date, r])).values()].sort((a, b) => a.date.localeCompare(b.date));
  const annual: ClimateYear[] = [];
  const monthlyByYear: ({ year: number; month: number } & ReturnType<typeof aggregate>)[] = [];
  for (let year = firstYear; year <= lastYear; year++) {
    const yearRows = rows.filter(r => r.date.startsWith(`${year}-`));
    const days = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;
    annual.push({ year, ...aggregate(yearRows, days) });
    for (let month = 1; month <= 12; month++) {
      monthlyByYear.push({ year, month, ...aggregate(yearRows.filter(r => Number(r.date.slice(5, 7)) === month), new Date(Date.UTC(year, month, 0)).getUTCDate()) });
    }
  }
  const months: ClimateMonth[] = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1, values = monthlyByYear.filter(r => r.month === month);
    const rainValues = values.map(v => v.rain).filter((v): v is number => v !== null);
    const rainAverage = mean(rainValues);
    const usable = values.filter(v => v.temperature !== null).length;
    const avg = (key: keyof ReturnType<typeof aggregate>) => values.filter(v => v[key] !== null).length >= 5 ? mean(values.map(v => v[key])) : null;
    return { month, years: usable, temperature: usable >= 5 ? avg('temperature') : null,
      minimum: usable >= 5 ? avg('minimum') : null, maximum: usable >= 5 ? avg('maximum') : null,
      rain: rainValues.length >= 5 ? rainAverage : null,
      humidity: usable >= 5 ? avg('humidity') : null, wind: usable >= 5 ? avg('wind') : null, solar: usable >= 5 ? avg('solar') : null,
      hotDays: usable >= 5 ? avg('hotDays') : null, frostDays: usable >= 5 ? avg('frostDays') : null, dryDays: usable >= 5 ? avg('dryDays') : null,
      rainCv: rainValues.length >= 5 && rainAverage !== null && rainAverage > 0 ? Math.sqrt(rainValues.reduce((s, v) => s + (v - rainAverage) ** 2, 0) / rainValues.length) / rainAverage : null,
      rainTrendPerDecade: slopePerDecade(values.map(v => ({ year: v.year, value: v.rain }))),
      temperatureTrendPerDecade: slopePerDecade(values.map(v => ({ year: v.year, value: v.temperature }))) };
  });
  const trend = (key: keyof Omit<ClimateYear, 'year'>) => slopePerDecade(annual.map(r => ({ year: r.year, value: r[key] })));
  return { start: `${firstYear}-01-01`, end: `${lastYear}-12-31`, yearsRequested: lastYear - firstYear + 1,
    yearsUsable: annual.filter(r => r.temperature !== null && r.rain !== null).length, months, annual,
    trends: { temperaturePerDecade: trend('temperature'), rainPerDecade: trend('rain'), solarPerDecade: trend('solar'), hotDaysPerDecade: trend('hotDays'), frostDaysPerDecade: trend('frostDays'), drySpellDaysPerDecade: trend('longestDrySpell') } };
}
// Join NASA parameter series by date and turn fill values into explicit gaps.
export function parsePowerClimate(raw: unknown): ClimateDay[] {
  const json = raw as { properties?: { parameter?: Record<string, Record<string, number>> } };
  const series = json?.properties?.parameter;
  if (!series || !series.T2M || !series.PRECTOTCORR) throw new Error('NASA climate response has no temperature/rainfall series.');
  const value = (key: string, date: string) => { const n = series[key]?.[date]; return typeof n === 'number' && Number.isFinite(n) && n > -900 ? n : null; };
  return [...new Set(Object.values(series).flatMap(s => Object.keys(s)))].filter(d => /^\d{8}$/.test(d)).map(d => ({ date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
    temperature: value('T2M', d), minimum: value('T2M_MIN', d), maximum: value('T2M_MAX', d), rain: value('PRECTOTCORR', d), humidity: value('RH2M', d), wind: value('WS2M', d), solar: value('ALLSKY_SFC_SW_DWN', d) }));
}
