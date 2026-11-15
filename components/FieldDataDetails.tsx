'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CloudRain, Droplets, Leaf, RefreshCw, Sun, Thermometer, Wind, X } from 'lucide-react';
import { offlineJson } from '@/lib/offline';
import { useOnline } from '@/lib/use-online';
import type { DailyRow, Measurement, OverviewData } from '@/lib/types';

type Props = { name: string; point: [number, number]; data: OverviewData | null; loading: boolean; error: string | null; onClose: () => void; onRefresh: () => void };
const surface = 'rounded-xl bg-[#f4f6f0] dark:bg-[#263b2e]';
const muted = 'text-[#71836f] dark:text-[#afc2b5]';
function date(value: string) { return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); }
function number(value: number | null | undefined, digits = 1) { return value == null ? '—' : value.toLocaleString('en-US', { maximumFractionDigits: digits }); }

function Sparkline({ rows, metric, label }: { rows: DailyRow[]; metric: 'temperature' | 'soilWetness'; label: string }) {
  const values = rows.map(row => row[metric]);
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length < 2) return <p className={`mt-3 text-xs ${muted}`}>Trend unavailable</p>;
  const min = Math.min(...valid), span = Math.max(1, Math.max(...valid) - min);
  // Break the line at missing observations instead of joining across gaps.
  const path = values.map((v, i) => v === null ? '' : `${i === 0 || values[i - 1] === null ? 'M' : 'L'} ${i / Math.max(1, values.length - 1) * 160} ${39 - (v - min) / span * 32}`).join(' ');
  return <svg viewBox="0 0 160 44" className="mt-3 h-11 w-full text-[#648651] dark:text-[#9dd6b3]" role="img" aria-label={label}><path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>;
}

export default function FieldDataDetails({ name, point, data, loading, error, onClose, onRefresh }: Props) {
  const online = useOnline();
  const [days, setDays] = useState(365);
  const [history, setHistory] = useState<OverviewData | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [lng, lat] = point;
  useEffect(() => {
    const controller = new AbortController();
    setHistory(null); setHistoryLoading(true); setHistoryError(null);
    const params = new URLSearchParams({ lng: String(lng), lat: String(lat), history: '1' });
    // Persist opened history for offline viewing; coordinate-based keys keep locations separate.
    offlineJson<OverviewData>(`/api/nasa/overview?${params}`, controller.signal).then(result => {
      setHistory(result as OverviewData);
    }).catch(error => { if (!controller.signal.aborted) setHistoryError(error instanceof Error ? error.message : 'History unavailable'); })
      .finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
    return () => controller.abort();
  }, [lng, lat, refresh, online]);
  data = history ?? data;
  loading = loading || historyLoading;
  error = historyError ?? error;
  const panel = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    return () => previous?.focus();
  }, []);
  const allRows = data?.daily ?? [];
  const latest = allRows.at(-1)?.date;
  const cutoff = latest ? new Date(`${latest}T12:00:00Z`).getTime() - (days - 1) * 86400000 : 0;
  const rows = allRows.filter(row => new Date(`${row.date}T12:00:00Z`).getTime() >= cutoff);
  const rain = rows.filter(row => row.precipitation !== null);
  const total = rain.length ? rain.reduce((sum, row) => sum + row.precipitation!, 0) : null;
  // Long periods use monthly totals, while short periods retain daily rainfall detail.
  const chartRows = days <= 30 ? rows : Array.from(rows.reduce((months, row) => {
    const key = row.date.slice(0, 7);
    const month = months.get(key) ?? { date: `${key}-01`, precipitation: null, temperature: null, soilWetness: null };
    if (row.precipitation !== null) month.precipitation = (month.precipitation ?? 0) + row.precipitation;
    months.set(key, month);
    return months;
  }, new Map<string, DailyRow>()).values());
  const chartDate = (value: string) => days <= 30 ? date(value) : new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  const maxRain = Math.max(1, ...chartRows.map(row => row.precipitation ?? 0));
  const temperatures = rows.flatMap(row => row.temperature === null ? [] : [row.temperature]);
  const meanTemperature = temperatures.length ? temperatures.reduce((a, b) => a + b, 0) / temperatures.length : null;
  const metrics: { title: string; measurement?: Measurement; icon: React.ReactNode }[] = [
    { title: 'Air humidity', measurement: data?.humidity, icon: <Droplets size={16}/> },
    { title: 'Wind speed · 2 m', measurement: data?.windSpeed, icon: <Wind size={16}/> },
    { title: 'Wind direction', measurement: data?.windDirection, icon: <Wind size={16}/> },
    { title: 'Solar energy', measurement: data?.solarRadiation, icon: <Sun size={16}/> }
  ];
  return <section ref={panel} role="dialog" aria-modal="true" aria-labelledby="field-data-title"
    onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
      if (event.key === 'Tab') {
        const controls = panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), select, a[href], summary');
        const first = controls?.[0], last = controls?.[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}
    className="soft-scroll absolute bottom-3 left-[calc(var(--sidebar-width)+12px)] right-3 top-3 z-50 overflow-y-auto rounded-2xl border border-[#e3ebe0] bg-white p-5 text-[#293d32] shadow-2xl dark:border-[#364b40] dark:bg-[#18271f] dark:text-[#e2ece5] sm:p-7 lg:bottom-5 lg:left-auto lg:right-5 lg:top-[110px] lg:w-[min(680px,calc(100vw-var(--sidebar-width)-40px))]">
    <div className="flex items-start justify-between gap-4">
      <div><p className={`text-[10px] font-semibold uppercase tracking-widest ${muted}`}>{name} / History</p><h2 id="field-data-title" className="mt-2 text-2xl font-bold tracking-tight">Your land, through the seasons.</h2><p className={`mt-1 text-xs ${muted}`}>Explore how conditions change over time.</p></div>
      <button ref={closeButton} type="button" onClick={onClose} aria-label="Close field data" className={`rounded-lg p-2 hover:bg-black/5 dark:hover:bg-white/10 ${muted}`}><X size={19}/></button>
    </div>
    <div className={`mt-5 flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-xs ${surface}`}>
      <span>{rows.length ? `${date(rows[0].date)}, ${rows[0].date.slice(0, 4)} — ${date(rows.at(-1)!.date)}, ${rows.at(-1)!.date.slice(0, 4)}` : 'No observations available'}</span>
      <label className="flex items-center gap-2">Period<select value={days} onChange={e => setDays(Number(e.target.value))} className="rounded-md bg-transparent p-1 font-semibold"><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option><option value={365}>12 months</option></select></label>
    </div>
    <div className="mt-3 flex items-center justify-between gap-3"><p className={`text-[11px] ${muted}`}>Latest available observations · dates may lag today</p><button onClick={() => { onRefresh(); setRefresh(value => value + 1); }} disabled={loading || !online} className="flex items-center gap-1 text-xs font-semibold disabled:opacity-50"><RefreshCw size={13} className={loading ? 'animate-spin' : ''}/>Refresh</button></div>
    {!online && <p role="status" className={`mt-4 text-sm ${muted}`}>Offline · showing previously downloaded data. Connect to refresh.</p>}
    {loading && <p role="status" className={`mt-4 text-sm ${muted}`}>Loading NASA observations…</p>}
    {error && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-[#302e22] dark:text-amber-300">{error}</p>}
    <section className="mt-6" aria-labelledby="rainfall-title">
      <div className="flex items-center justify-between"><h3 id="rainfall-title" className="text-sm font-semibold">Rainfall</h3><span className={`flex items-center gap-1 text-[11px] ${muted}`}><CloudRain size={14}/> {days <= 30 ? 'Daily rainfall' : 'Monthly rainfall'}</span></div>
      <p className="mt-1"><strong className="text-3xl font-bold tracking-tight">{number(total)} <span className="text-xl">mm</span></strong><span className={`ml-2 text-xs ${muted}`}>total across {rain.length} observed days</span></p>
      {rain.length ? <>
        <svg viewBox="0 0 600 170" className="mt-4 w-full" role="img" aria-label={`Rainfall chart: ${number(total)} millimeters across ${rain.length} observed days. Missing days are marked with a dash.`}>
          {[0, 0.5, 1].map(tick => <g key={tick}><line x1="35" x2="595" y1={140 - tick * 115} y2={140 - tick * 115} stroke="currentColor" opacity="0.12"/><text x="0" y={144 - tick * 115} fill="currentColor" fontSize="10" opacity="0.7">{number(maxRain * tick)}</text></g>)}
          {chartRows.map((row, i) => { const width = 550 / Math.max(1, chartRows.length); const height = row.precipitation === null ? 0 : row.precipitation / maxRain * 115; return <g key={row.date}><title>{chartDate(row.date)}: {row.precipitation === null ? 'Unavailable' : `${number(row.precipitation)} mm`}</title>{row.precipitation === null ? <text x={40 + i * width} y="138" fill="currentColor" fontSize="10">—</text> : <rect x={38 + i * width} y={140 - height} width={Math.max(2, width - 4)} height={Math.max(1, height)} rx="3" fill={i === chartRows.length - 1 ? '#286649' : '#a8c39d'}/>}{(i === 0 || i === chartRows.length - 1 || i % Math.max(1, Math.ceil(chartRows.length / 6)) === 0) && <text x={38 + i * width} y="160" fill="currentColor" fontSize="9" textAnchor={i === chartRows.length - 1 ? 'end' : 'start'}>{chartDate(row.date)}</text>}</g>; })}
        </svg><p className={`text-[11px] ${muted}`}>Totals use available days only; first and last months may be partial. Missing rainfall is not counted as zero.</p>
      </> : <p className={`mt-4 rounded-xl p-4 text-sm ${surface} ${muted}`}>Rainfall history is unavailable for this period.</p>}
    </section>
    <div className="mt-5 grid gap-3 sm:grid-cols-3">
      <div className={`p-4 ${surface}`}><p className={`flex items-center gap-1 text-xs ${muted}`}><Thermometer size={14}/>Temperature</p><strong className="mt-2 block text-xl">{number(meanTemperature)} °C</strong><Sparkline rows={rows} metric="temperature" label="Daily temperature trend"/><p className={`mt-2 text-[11px] ${muted}`}>Mean of {temperatures.length} observed days</p></div>
      <div className={`p-4 ${surface}`}><p className={`text-xs ${muted}`}>{data?.soilLabel ?? 'Surface soil wetness'}</p><strong className="mt-2 block text-xl">{number(data?.soilWetness.value)} %</strong><Sparkline rows={rows} metric="soilWetness" label="Daily soil wetness trend"/><p className={`mt-2 text-[11px] ${muted}`}>{data?.soilWetness.date ? `Latest: ${date(data.soilWetness.date)}, ${data.soilWetness.date.slice(0, 4)}` : 'No observation available'}</p></div>
      <div className={`p-4 ${surface}`}><p className={`flex items-center gap-1 text-xs ${muted}`}><Leaf size={14}/>Vegetation health</p><strong className="mt-2 block text-lg">Imagery only</strong><p className={`mt-3 text-xs leading-relaxed ${muted}`}>Use the vegetation map layer to explore MODIS NDVI. A field health score is not available.</p></div>
    </div>
    <div className={`mt-4 rounded-xl border border-[#e3ebe0] p-4 text-xs leading-relaxed dark:border-[#364b40] ${muted}`}><strong className="block text-[#293d32] dark:text-[#e2ece5]">Reading this history</strong>These are regional modeled observations, not on-field sensor measurements. Compare the daily patterns above; a typical-rainfall baseline is not available. The selected period ends at the latest available observation.</div>
    <h3 className="mt-6 text-sm font-semibold">More observations</h3>
    <div className="mt-3 grid grid-cols-2 gap-3">{metrics.map(metric => <div key={metric.title} className={`p-4 ${surface}`}><p className={`flex items-center gap-2 text-xs ${muted}`}>{metric.icon}{metric.title}</p><strong className="mt-2 block text-lg">{number(metric.measurement?.value)} <span className="text-xs font-normal">{metric.measurement?.unit}</span></strong><p className={`mt-1 text-[11px] ${muted}`}>{metric.measurement?.date ? `${date(metric.measurement.date)}, ${metric.measurement.date.slice(0, 4)}` : 'No observation available'}</p></div>)}</div>
    <details className="mt-5"><summary className="cursor-pointer text-sm font-semibold">Daily observations</summary><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><caption className={`mb-2 text-left ${muted}`}>Available daily values; — indicates missing data.</caption><thead><tr className="border-b dark:border-[#364b40]"><th className="py-2">Date (UTC)</th><th>Rain (mm)</th><th>Temp (°C)</th><th>Soil (%)</th></tr></thead><tbody>{rows.map(row => <tr key={row.date} className="border-b border-[#e3ebe0] dark:border-[#364b40]"><td className="py-2">{row.date}</td><td>{number(row.precipitation)}</td><td>{number(row.temperature)}</td><td>{number(row.soilWetness)}</td></tr>)}</tbody></table></div></details>
    <section className="mt-6 border-t border-[#e3ebe0] pt-4 dark:border-[#364b40]"><h3 className="text-sm font-semibold">Where this information comes from</h3><p className={`mt-1 text-xs ${muted}`}>Each observation has its own date and regional coverage.</p><dl className={`mt-4 grid gap-x-5 gap-y-3 text-xs leading-relaxed sm:grid-cols-[110px_1fr] ${muted}`}><dt className="font-semibold">NASA POWER</dt><dd>Temperature, humidity, precipitation, wind and solar energy · daily regional modeled data.</dd><dt className="font-semibold">Soil data</dt><dd>{data?.soilNote ?? 'NASA POWER hydrology · availability varies by location and date.'}</dd><dt className="font-semibold">NASA GIBS</dt><dd>Satellite and model imagery in the map layers. MODIS NDVI is a visualization, not a field health diagnosis.</dd></dl><div className="mt-4 flex gap-4 text-xs font-semibold underline"><a href="https://power.larc.nasa.gov/" target="_blank" rel="noopener noreferrer">NASA POWER</a><a href="https://www.earthdata.nasa.gov/data/tools/gibs" target="_blank" rel="noopener noreferrer">NASA Earthdata</a></div></section>
    <button onClick={onClose} className="mt-6 flex items-center gap-2 text-xs font-semibold"><ArrowLeft size={14}/>Back to field overview</button>
  </section>;
}
