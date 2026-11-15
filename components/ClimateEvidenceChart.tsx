'use client';
import { useId, useState } from 'react';
import { CloudRain, Thermometer, TrendingUp } from 'lucide-react';
import { mean, type ClimateAnalysis } from '@/lib/climate';
const muted = 'text-[#657260] dark:text-[#afc2b5]';
const signed = (value: number | null, unit: string) => value === null ? 'Unavailable' : `${value > 0 ? '+' : ''}${value.toFixed(2)} ${unit}`;
export default function ClimateEvidenceChart({ climate }: { climate: ClimateAnalysis | null }) {
  const [metric, setMetric] = useState<'temperature' | 'rain'>('temperature');
  const titleId = useId();
  if (!climate) return <p className={`mt-4 rounded-xl bg-white p-4 dark:bg-[#18271f] ${muted}`}>Connect to load NASA climate history for this field. A local warming trend cannot be shown without sufficient observations.</p>;
  const temperatureTrend = climate.trends.temperaturePerDecade;
  const rows = [...climate.annual].sort((a, b) => a.year - b.year);
  const valid = rows.filter(row => row[metric] !== null && Number.isFinite(row[metric]));
  const trend = metric === 'temperature' ? temperatureTrend : climate.trends.rainPerDecade;
  const unit = metric === 'temperature' ? '°C' : 'mm';
  const firstYear = rows[0]?.year ?? 0, lastYear = rows.at(-1)?.year ?? firstYear;
  const averageYear = mean(valid.map(row => row.year)) ?? 0;
  const average = mean(valid.map(row => row[metric])) ?? 0;
  // Draw the fitted historical trend around the observed mean, without projecting future years.
  const trendAt = (year: number) => average + (year - averageYear) * (trend ?? 0) / 10;
  const values = valid.map(row => row[metric]!);
  if (trend !== null && valid.length) values.push(trendAt(valid[0].year), trendAt(valid.at(-1)!.year));
  const min = Math.min(...values), max = Math.max(...values);
  const pad = Math.max(metric === 'temperature' ? 0.5 : 20, (max - min) * 0.15);
  const bottom = min - pad, top = max + pad;
  const x = (year: number) => 58 + (year - firstYear) / Math.max(1, lastYear - firstYear) * 560;
  const y = (value: number) => 200 - (value - bottom) / Math.max(1, top - bottom) * 165;
  const path = rows.map((row, index) => row[metric] === null ? '' : `${index === 0 || rows[index - 1][metric] === null ? 'M' : 'L'} ${x(row.year)} ${y(row[metric]!)}`).join(' ');
  return <div className="mt-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#286048] dark:text-[#9dd6b3]"><TrendingUp size={16}/>Global warming context</p><h4 className="mt-2 text-lg font-bold">Your field’s local climate signal</h4><p className={`mt-1 text-xs leading-relaxed ${muted}`}>NASA regional history · {climate.start.slice(0, 4)}–{climate.end.slice(0, 4)}. This is local evidence, not a global temperature record.</p></div></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <div className={`rounded-xl border p-4 ${temperatureTrend !== null && temperatureTrend > 0 ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-[#302e22] dark:text-amber-200' : 'border-[#dbe6da] bg-white dark:border-[#364b40] dark:bg-[#18271f]'}`}><p className="flex items-center gap-1.5 text-xs"><Thermometer size={15}/>Temperature trend</p><strong className="mt-2 block text-xl">{signed(temperatureTrend, '°C/decade')}</strong><p className="mt-1 text-xs">{temperatureTrend === null ? 'At least 10 valid years required' : temperatureTrend > 0 ? 'Warming in the observed period' : temperatureTrend < 0 ? 'Cooling in the observed period' : 'No fitted temperature change'}</p></div>
      <div className="rounded-xl border border-[#dbe6da] bg-white p-4 dark:border-[#364b40] dark:bg-[#18271f]"><p className={`flex items-center gap-1.5 text-xs ${muted}`}><CloudRain size={15}/>Annual rainfall trend</p><strong className="mt-2 block text-xl">{signed(climate.trends.rainPerDecade, 'mm/decade')}</strong><p className={`mt-1 text-xs ${muted}`}>Historical change in yearly rainfall</p></div>
      <div className="rounded-xl border border-[#dbe6da] bg-white p-4 dark:border-[#364b40] dark:bg-[#18271f]"><p className={`text-xs ${muted}`}>Hot-day frequency trend</p><strong className="mt-2 block text-xl">{signed(climate.trends.hotDaysPerDecade, 'days/decade')}</strong><p className={`mt-1 text-xs ${muted}`}>Days with maximum temperature ≥35°C</p></div>
    </div>
    <div className="mt-4 rounded-xl border border-[#dbe6da] bg-white p-3 dark:border-[#364b40] dark:bg-[#18271f] sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h5 className="font-semibold">{metric === 'temperature' ? 'Annual average temperature' : 'Annual rainfall total'}</h5><div className="flex gap-1 rounded-lg bg-[#edf3e9] p-1 dark:bg-[#263b2e]" aria-label="Climate graph metric">{(['temperature', 'rain'] as const).map(key => <button key={key} type="button" aria-pressed={metric === key} onClick={() => setMetric(key)} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${metric === key ? 'bg-[#286048] text-white' : muted}`}>{key === 'temperature' ? 'Temperature' : 'Rainfall'}</button>)}</div></div>
      {valid.length >= 2 ? <svg viewBox="0 0 650 240" className="mt-3 w-full overflow-visible" role="img" aria-labelledby={titleId}>
        <title id={titleId}>{metric === 'temperature' ? 'Annual temperature' : 'Annual rainfall'} for this field region from {firstYear} to {lastYear}. Fitted trend: {signed(trend, `${unit} per decade`)}. Missing years break the line.</title>
        {[0, 0.5, 1].map(tick => { const value = bottom + tick * (top - bottom); return <g key={tick}><line x1="58" x2="618" y1={y(value)} y2={y(value)} stroke="currentColor" opacity="0.12"/><text x="48" y={y(value) + 4} textAnchor="end" fill="currentColor" fontSize="11" opacity="0.7">{value.toFixed(metric === 'temperature' ? 1 : 0)}</text></g>; })}
        <text x="58" y="20" fill="currentColor" fontSize="11" opacity="0.7">{unit}</text>
        <path d={path} fill="none" stroke={metric === 'temperature' ? '#c58a39' : '#648fa2'} strokeWidth="2.5" strokeLinejoin="round"/>
        {valid.map(row => <circle key={row.year} cx={x(row.year)} cy={y(row[metric]!)} r="3.5" fill={metric === 'temperature' ? '#c58a39' : '#648fa2'}><title>{row.year}: {row[metric]!.toFixed(1)} {unit}</title></circle>)}
        {trend !== null && <line data-testid="climate-trend-line" x1={x(valid[0].year)} x2={x(valid.at(-1)!.year)} y1={y(trendAt(valid[0].year))} y2={y(trendAt(valid.at(-1)!.year))} stroke="currentColor" opacity="0.7" strokeWidth="2" strokeDasharray="6 5"/>}
        {rows.filter((_, index) => index === 0 || index === rows.length - 1 || index % Math.max(1, Math.ceil(rows.length / 5)) === 0).map(row => <text key={row.year} x={x(row.year)} y="224" textAnchor="middle" fill="currentColor" fontSize="11" opacity="0.75">{row.year}</text>)}
      </svg> : <p className={`py-8 text-center text-sm ${muted}`}>At least two valid years are needed to draw this graph.</p>}
      <p className={`mt-2 text-xs ${muted}`}>Solid line: annual observations · Dashed line: fitted historical trend, when at least 10 valid years are available. Missing years remain gaps.</p>
    </div>
    <p className="mt-4 rounded-xl bg-[#eaf2e5] p-4 text-sm leading-relaxed dark:bg-[#263b2e]"><strong>How this affects crop suggestions:</strong> the adaptation score checks sensitivity to observed warming, declining seasonal rainfall, and increasing hot days or dry spells. It compares crops against their temperature ranges and drought sensitivity.</p>
    <p className={`mt-3 text-xs leading-relaxed ${muted}`}>A 15-year regional trend does not establish the global warming rate or attribute a local change to its cause. It is historical screening evidence, not a future climate projection or a claim of statistical significance.</p>
  </div>;
}
