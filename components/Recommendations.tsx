'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, LoaderCircle, RefreshCw, Droplets, Thermometer, FlaskConical as SoilIcon, X } from 'lucide-react';
import { useFields } from '@/lib/field-store';
import { AGRONOMY, AGRONOMY_VERSION } from '@/lib/agronomy';
import { readOffline, writeOffline } from '@/lib/offline';
import { useOnline } from '@/lib/use-online';
import FieldInputs from './FieldInputs';
import RotationSuggestions from './RotationSuggestions';
import ClimateEvidenceChart from './ClimateEvidenceChart';
import { initialInputDraft, type InputDraft } from '@/lib/agronomy-draft';
import { getCrop } from '@/lib/crops';
import type { RankedCrop, RecommendationResult } from '@/lib/recommendations';

type Report = RecommendationResult & { sources: { label: string; url: string; retrievedAt: string | null }[]; climateRetrievedAt: string | null; dataErrors: string[] };
const control = 'mt-1 block w-full rounded-lg border border-[#dbe6da] dark:border-[#364b40] bg-white dark:bg-[#18271f] px-3 py-2 text-sm text-[#2b5038] dark:text-[#e2ece5] outline-none focus:border-[#397c58]';
const button = 'rounded-xl bg-[#286048] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1c4e38] disabled:opacity-40';
const dateTime = (value: string | null) => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Unavailable';
const number = (value: number | null, digits = 1) => value === null ? '—' : value.toFixed(digits);

export default function Recommendations({ open, onClose }: { open: boolean; onClose: () => void }) {
  const online = useOnline();
  const { fields, activeFieldId, planningFieldId, setPlanningFieldId, hydrated } = useFields();
  const [targetMonth, setTargetMonth] = useState('');
  const [reports, setReports] = useState<Record<string, Report>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [inputDrafts, setInputDrafts] = useState<Record<string, InputDraft>>({});
  const field = fields.find(f => f.id === (planningFieldId ?? activeFieldId)) ?? fields[0];
  const requestField = useMemo(() => field ? { id: field.id, name: field.name, point: field.point, radius: field.radius, cropHistory: field.cropHistory ?? [], soilTests: field.soilTests ?? [], management: field.management } : null,
    [field?.id, field?.name, field?.point, field?.radius, field?.cropHistory, field?.soilTests, field?.management]);
  const fingerprint = JSON.stringify({ policyVersion: AGRONOMY_VERSION, field: requestField, targetMonth: targetMonth ? Number(targetMonth) : undefined });
  const report = reports[fingerprint];
  // Optional inputs improve the evidence but are not prerequisites for suggestions.
  const dataIssues = report ? [...report.gaps.filter(gap => ![
    'No crop history:', 'No soil test:', 'Incomplete NPK tests;',
    'Irrigation availability is unknown;', 'No planting is marked as currently growing.'
  ].some(prefix => gap.startsWith(prefix))), ...report.dataErrors] : [];
  const previousFocus = useRef<HTMLElement | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement;
    closeButton.current?.focus();
    return () => previousFocus.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!open || !hydrated || !requestField) return;
    if (!online || !navigator.onLine) {
      let active = true;
      setLoading(true); setError(null);
      void readOffline<Report>(`recommendations:${fingerprint}`).then(saved => {
        if (!active) return;
        if (saved && saved.fieldId === requestField.id && saved.point[0] === requestField.point[0] && saved.point[1] === requestField.point[1]) setReports(current => ({ ...current, [fingerprint]: saved }));
        else if (!report) setError('No saved suggestions match these field details yet. Connect to generate suggestions; your field records can still be edited offline.');
        setLoading(false);
      });
      return () => { active = false; };
    }
    if (report && Date.now() - Date.parse(report.generatedAt) < 3600000 && refresh === 0) { setLoading(false); setError(null); return; }
    const abort = new AbortController();
    setLoading(true); setError(null);
    fetch('/api/recommendations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: fingerprint, signal: abort.signal })
      .then(async response => { const json = await response.json(); if (!response.ok) throw new Error(json.error || 'Could not generate suggestions.'); return json as Report; })
      .then(json => { if (json.fieldId !== requestField.id || json.point[0] !== requestField.point[0] || json.point[1] !== requestField.point[1]) throw new Error('The response did not match the selected field. Please retry.'); setReports(current => ({ ...current, [fingerprint]: json })); void writeOffline(`recommendations:${fingerprint}`, json); })
      .catch(cause => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'Suggestions unavailable.'); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
    // Cache by the complete field inputs, rather than weather snapshot updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hydrated, fingerprint, refresh, online]);

  return <section hidden={!open} style={!open ? { display: 'none' } : undefined} aria-labelledby="recommendations-title" onKeyDown={e => { if (e.key === 'Escape') onClose(); }} className="suggestions-panel absolute bottom-3 left-[calc(var(--sidebar-width)+12px)] right-3 top-3 z-40 flex flex-col overflow-hidden rounded-2xl border border-white/80 dark:border-[#364b40]/80 bg-white dark:bg-[#18271f] text-[#293d32] dark:text-[#e2ece5] shadow-2xl lg:bottom-5 lg:left-auto lg:right-5 lg:top-[110px] lg:w-[min(1000px,calc(100vw-var(--sidebar-width)-250px))]">
    <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[#e3ebe0] dark:border-[#364b40] bg-white dark:bg-[#18271f] p-4 sm:px-6">
      <div><p className="text-xs font-bold uppercase tracking-widest text-[#657260] dark:text-[#9dd6b3]">CGS / FIELD SUGGESTIONS</p><h2 id="recommendations-title" className="mt-1 text-lg font-bold sm:text-2xl">A better fit for your field.</h2><p className="mt-1 text-sm text-[#657260] dark:text-[#9dd6b3]">Explore crops suited to your soil, seasonal weather and water availability.</p></div>
      <button ref={closeButton} type="button" onClick={onClose} aria-label="Close suggestions" className="rounded-lg p-2 hover:bg-[#edf3e9] dark:hover:bg-[#263b2e]"><X size={20}/></button>
    </header>
    {!hydrated ? <p role="status" className="p-6">Loading fields...</p> : !field ? <div className="p-6"><h3 className="font-semibold">Save a field to get started</h3><p className="mt-2 text-sm text-[#657260] dark:text-[#9dd6b3]">Use Explore to save a location, then add crops and planting dates in Crops. Every saved field can have its own suggestions.</p></div> : <div className="min-h-0 flex-1 overflow-y-auto">
      <main className="min-w-0 p-4 sm:px-6 sm:pb-6">
        <div className="mb-6 grid items-end gap-3 rounded-xl bg-[#f4f6f0] dark:bg-[#1b2b23] p-4 sm:grid-cols-[1fr_1fr_auto]">
          <label className="text-sm font-semibold" htmlFor="recommendation-field">Your field
            <select id="recommendation-field" value={field.id} onChange={e => { setPlanningFieldId(e.target.value); setError(null); }} className={control}>{fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
          </label>
          <label className="text-sm font-semibold" htmlFor="planning-month">Planting month
            <select id="planning-month" value={targetMonth} onChange={e => setTargetMonth(e.target.value)} className={control}><option value="">Find the best window</option>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{new Date(2024, i, 1).toLocaleDateString('en', { month: 'long' })}</option>)}</select>
          </label>
          <button type="button" disabled={loading || !online} onClick={() => setRefresh(v => v + 1)} className="flex h-[42px] items-center justify-center gap-2 rounded-lg border border-[#dbe6da] dark:border-[#364b40] bg-white dark:bg-[#18271f] px-3 text-sm font-semibold disabled:opacity-40"><RefreshCw size={16}/> Refresh</button>
        </div>
        {loading && <p role="status" className="mt-5 flex items-center gap-2 rounded-xl bg-white dark:bg-[#18271f] p-4 text-sm"><LoaderCircle className="animate-spin" size={18}/> Analysing this field's crop history, soil and real weather data. The first climate lookup can take up to a minute.</p>}
        {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 dark:bg-[#342722] p-4 text-sm text-red-700 dark:text-red-300">{error} <button className="font-semibold underline" onClick={() => setRefresh(v => v + 1)}>Retry</button></p>}
        <FieldInputs key={field.id} field={field} draft={inputDrafts[field.id] ?? initialInputDraft(field)} onDraft={draft => setInputDrafts(current => ({ ...current, [field.id]: draft }))}/>
        {!online && <p role="status" className="mt-4 rounded-xl bg-[#edf4e7] p-3 text-sm dark:bg-[#263b2e]">Offline · saved suggestions reflect the data and forecast available when generated. Reconnect to update suggestions after editing your field.</p>}
        <RotationSuggestions plan={report?.rotation} field={field} loading={loading}/>
        {report && <>
          <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[#627063] dark:text-[#9dd6b3]">
            <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#648651]"/> {field.name}</span>
            <span>Updated {dateTime(report.generatedAt)}</span>
            {(dataIssues.length > 0) && <span className="rounded-full bg-amber-50 dark:bg-[#302e22] px-3 py-1 text-sm font-semibold text-amber-800 dark:text-amber-300">Some data is missing · provisional results</span>}
          </div>
          <CropGroups crops={report.ranked}/>
          <p className="mt-5 text-sm leading-relaxed text-[#647264] dark:text-[#9dd6b3]">Suitability estimates guide comparison; they do not predict yield. Check each crop's confidence and field conditions before planting.</p>

          {report.observations && <details className="mt-4 rounded-xl border border-[#e3ebe0] dark:border-[#364b40] bg-white dark:bg-[#18271f] p-4 text-sm"><summary className="cursor-pointer font-bold">NASA observations used for current-crop context</summary><dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">{[
            ['Air temperature', report.observations.temperature], ['Relative humidity', report.observations.humidity], ['Wind speed', report.observations.windSpeed], [report.observations.soilLabel ?? 'Regional soil wetness', report.observations.soilWetness], ['Solar radiation', report.observations.solarRadiation], ['Recent rainfall', report.observations.rainfallSevenDays]
          ].map(([label, raw]) => { const measurement = raw as { value: number | null; unit: string; date: string | null }; return <div key={String(label)}><dt className="text-[#657260] dark:text-[#9dd6b3]">{String(label)}</dt><dd className="mt-1 font-semibold">{number(measurement.value)} {measurement.unit}</dd><dd className="mt-1 text-xs text-[#657260] dark:text-[#9dd6b3]">Observation: {measurement.date ?? 'missing'}</dd></div>; })}</dl><p className="mt-3 text-[#657260] dark:text-[#9dd6b3]">Rainfall includes {report.observations.rainfallSevenDays.daysAvailable}/7 days, {report.observations.rainfallSevenDays.start}–{report.observations.rainfallSevenDays.end}. {report.observations.soilNote} These are regional modeled observations, not field sensors or a forecast.</p></details>}
          <details open className="mt-7 rounded-2xl border border-[#c4d9c5] dark:border-[#486151] bg-[#f6f9f3] dark:bg-[#1b2b23] p-4 text-sm sm:p-5"><summary className="cursor-pointer text-base font-bold">Climate adaptation and seasonal evidence</summary><ClimateEvidenceChart climate={report.climate}/><ul className="mt-3 list-disc space-y-2 pl-4 text-[#58704f] dark:text-[#9dd6b3]">{report.climateNotes.map(text => <li key={text}>{text}</li>)}</ul>
            {report.climate && <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs"><caption className="mb-2 text-left text-[#657260] dark:text-[#9dd6b3]">Historical monthly averages; rain variability is coefficient of variation (larger means less reliable). Trends require ≥10 valid years. Missing cells stay blank.</caption><thead><tr className="border-b"><th className="p-2">Month</th><th className="p-2">°C</th><th className="p-2">Rain mm</th><th className="p-2">Rain variability</th><th className="p-2">°C/decade</th><th className="p-2">Rain mm/decade</th><th className="p-2">Hot / frost days</th><th className="p-2">RH %</th><th className="p-2">Wind m/s</th><th className="p-2">Solar MJ/m²/day</th></tr></thead><tbody>{report.climate.months.map(m => <tr key={m.month} className="border-b border-[#edf3e9] dark:border-[#364b40]"><td className="p-2">{new Date(2024, m.month - 1, 1).toLocaleDateString('en', { month: 'short' })}</td><td className="p-2">{number(m.temperature)}</td><td className="p-2">{number(m.rain)}</td><td className="p-2">{number(m.rainCv, 2)}</td><td className="p-2">{number(m.temperatureTrendPerDecade, 2)}</td><td className="p-2">{number(m.rainTrendPerDecade)}</td><td className="p-2">{number(m.hotDays)} / {number(m.frostDays)}</td><td className="p-2">{number(m.humidity)}</td><td className="p-2">{number(m.wind)}</td><td className="p-2">{number(m.solar)}</td></tr>)}</tbody></table></div>}
          </details>
          <h3 className="mb-3 mt-8 text-lg font-bold">Care for your current crop</h3>
          {!report.current ? <p className="rounded-xl border border-[#e3ebe0] dark:border-[#364b40] bg-white dark:bg-[#18271f] p-4 text-sm text-[#657260] dark:text-[#9dd6b3]">Optional: select a current planting in Field details for crop-care advice. Your crop suggestions work without this. Add the planting in Crops first if needed.</p> : <div className="rounded-xl border border-[#e3ebe0] dark:border-[#364b40] bg-white dark:bg-[#18271f] p-4 sm:p-5">
            <h4 className="font-bold">{report.current.cropName}</h4><p className="mt-1 text-sm text-[#657260] dark:text-[#9dd6b3]">Planted {report.current.plantedOn ?? 'date unknown'} · {report.current.daysSincePlanting ?? 'Unknown'} days since planting · Stage: {report.current.growthStage}</p>
            <h5 className="mt-4 text-sm font-bold">Irrigation and water</h5><AdviceList items={report.current.irrigation}/>
            <h5 className="mt-4 text-sm font-bold">Estimated harvest window</h5><p className="mt-2 text-sm">{report.current.harvest ? `${report.current.harvest.earliest} to ${report.current.harvest.latest}` : 'Planting date required.'}</p><p className="mt-1 text-sm text-[#657260] dark:text-[#9dd6b3]">{report.current.harvestNote}</p>
            <h5 className="mt-4 flex items-center gap-2 text-sm font-bold"><AlertTriangle size={16}/> Weather and crop warnings</h5><AdviceList items={report.current.warnings.length ? report.current.warnings : ['No configured warning thresholds were exceeded in the sampled forecast. This does not rule out weather risk.']}/>
            <h5 className="mt-4 text-sm font-bold">Nutrient management</h5><AdviceList items={report.current.management}/>
          </div>}
          {dataIssues.length > 0 && <details className="mt-5 rounded-xl border border-[#e3ebe0] dark:border-[#364b40] p-4 text-sm"><summary className="cursor-pointer font-semibold">Data availability and quality ({dataIssues.length})</summary><AdviceList items={dataIssues}/></details>}
          <details className="mt-5 rounded-xl border border-[#e3ebe0] dark:border-[#364b40] bg-white dark:bg-[#18271f] p-4 text-sm"><summary className="cursor-pointer font-bold">Data sources and retrieval times</summary><p className="mt-2 text-[#657260] dark:text-[#9dd6b3]">Crop reference version {report.catalogVersion}. Historical NASA data are regional modeled values. Forecast coverage ends {dateTime(report.forecastThrough)}; 3-hourly samples can miss extremes.</p><ul className="mt-3 space-y-2">{report.sources.map((source, i) => <li key={i}><a href={source.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#397c58] dark:text-[#9dd6b3] underline">{source.label}</a>{source.retrievedAt && <span className="ml-2 text-[#657260] dark:text-[#9dd6b3]">{dateTime(source.retrievedAt)}</span>}</li>)}</ul></details>
        </>}
      </main>
    </div>}
  </section>;
}

function AdviceList({ items }: { items: string[] }) { return <ul className="mt-2 list-disc space-y-2 pl-4 text-sm leading-relaxed text-[#58704f] dark:text-[#9dd6b3]">{items.map((text, i) => <li key={i}>{text}</li>)}</ul>; }
function CropGroups({ crops }: { crops: RankedCrop[] }) {
  const groups = [
    { title: 'Best suited', subtitle: 'The strongest matches in your current field data', tone: 'best', items: crops.filter(c => c.score !== null && c.score >= 70) },
    { title: 'Moderately suited', subtitle: 'Worth considering, with a little extra care', tone: 'moderate', items: crops.filter(c => c.score !== null && c.score >= 50 && c.score < 70) },
    { title: 'Least suited', subtitle: 'Consider these trade-offs before planting', tone: 'poor', items: crops.filter(c => c.score !== null && c.score < 50) },
    { title: 'More data needed', subtitle: 'Add field information to compare these crops', tone: 'unknown', items: crops.filter(c => c.score === null) }
  ];
  return <div className="space-y-7">{groups.filter(g => g.items.length).map(group => <section key={group.tone} className={`crop-group crop-group-${group.tone}`}><div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1"><h3 className="text-lg font-bold">{group.title}</h3><p className="text-sm text-[#687568] dark:text-[#9dd6b3]">{group.subtitle}</p></div><div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">{group.items.map(crop => <CropCard key={crop.cropId} recommendation={crop}/>)}</div></section>)}</div>;
}

function CropArtwork({ cropId }: { cropId: RankedCrop['cropId'] }) {
  const grain = cropId === 'wheat' || cropId === 'barley';
  const background = grain ? '#b8a653' : cropId === 'sunflower' ? '#8eaa59' : '#91a96a';
  return <svg viewBox="0 0 320 120" preserveAspectRatio="xMidYMid slice" className="h-[110px] w-full rounded-lg object-cover" role="img" aria-label={`${getCrop(cropId).name} illustration`}>
    <rect width="320" height="120" fill={background}/><path d="M0 70 Q90 30 180 80T340 45V120H0Z" fill="#526f43" opacity=".3"/>
    {Array.from({ length: 11 }, (_, i) => <g key={i} transform={`translate(${i * 32 - 4} ${12 + i % 3 * 9}) rotate(${i % 2 ? 8 : -8} 18 65)`}>
      <path d="M18 120 Q12 70 20 18" fill="none" stroke={grain ? '#76682c' : '#456239'} strokeWidth="2.5"/>
      {grain ? <>{Array.from({ length: 6 }, (_, j) => <g key={j}><ellipse cx="14" cy={22 + j * 7} rx="4" ry="8" transform={`rotate(-40 14 ${22 + j * 7})`} fill="#e6cb72"/><ellipse cx="23" cy={18 + j * 7} rx="4" ry="8" transform={`rotate(40 23 ${18 + j * 7})`} fill="#f4dc91"/>{cropId === 'barley' && <path d={`M12 ${22 + j * 7}l-8 -20 M26 ${18 + j * 7}l9 -20`} stroke="#e9d48a" strokeWidth=".8"/>}</g>)}</> : <>
        <ellipse cx="9" cy="76" rx="7" ry="19" transform="rotate(-40 9 76)" fill="#5b7a42"/><ellipse cx="27" cy="64" rx="7" ry="19" transform="rotate(40 27 64)" fill="#718e48"/>
        {cropId === 'sunflower' ? <g transform="translate(20 30)">{Array.from({ length: 12 }, (_, n) => <ellipse key={n} cx="0" cy="-13" rx="5" ry="10" transform={`rotate(${n * 30})`} fill="#f4c940"/>)}<circle r="11" fill="#64482a"/><circle r="7" fill="#846335"/></g> : cropId === 'maize' ? <><ellipse cx="19" cy="43" rx="9" ry="23" fill="#e8c75a"/>{[0,1,2,3,4].map(n => <path key={n} d={`M12 ${30+n*7}h14`} stroke="#b89b40" strokeWidth="1"/>)}<path d="M8 55Q15 91 27 53" fill="#6c8c45"/></> : cropId === 'tomato' ? <><circle cx="18" cy="40" r="12" fill="#ce694c"/><path d="M9 31l9 8 9-8-8 1-1-8-2 8z" fill="#456a37"/></> : cropId === 'potato' ? <><ellipse cx="12" cy="99" rx="13" ry="9" fill="#cfb27a"/><ellipse cx="28" cy="108" rx="11" ry="8" fill="#e1c38a"/><circle cx="8" cy="98" r="1" fill="#9f8355"/></> : <>{[0,1,2].map(n => <ellipse key={n} cx={12+n*6} cy={38+n*12} rx="6" ry="12" transform={`rotate(25 ${12+n*6} ${38+n*12})`} fill="#c0c879"/>)}</>}
      </>}
    </g>)}
  </svg>;
}

function CropCard({ recommendation: r }: { recommendation: RankedCrop }) {
  const crop = getCrop(r.cropId), profile = AGRONOMY[r.cropId];
  const factor = (key: string) => r.factors.find(f => f.key === key)?.score ?? null;
  const fitLabel = (score: number | null) => score === null ? 'Not measured' : score >= 80 ? 'Strong match' : score >= 60 ? 'Fair match' : score >= 40 ? 'Needs care' : 'Poor match';
  const water = profile.waterMm.min >= 600 ? 'Higher need' : profile.waterMm.min >= 500 ? 'Moderate need' : 'Lower need';
  const summary = r.risks[0] ?? r.reasons.find(reason => !reason.startsWith('Climate sensitivity')) ?? 'Review the field details before deciding.';
  return <article className="crop-suggestion-card min-w-0 rounded-xl border border-transparent bg-[#f3f5ed] dark:bg-[#1b2b23] p-3 transition hover:border-[#c5d4bb] dark:hover:border-[#364b40]">
    <CropArtwork cropId={r.cropId}/>
    <div className="mb-3 mt-3 flex items-center justify-between gap-2"><h4 className="text-base font-bold">{crop.name}</h4><span className="crop-score rounded-md bg-[#e0ead7] dark:bg-[#263b2e] px-2.5 py-1 text-sm font-bold text-[#3f6743] dark:text-[#9dd6b3]">{r.score === null ? 'Unrated' : `${r.score}/100`}</span></div>
    <dl className="space-y-2 text-sm">
      <div className="flex items-center justify-between gap-2"><dt className="flex items-center gap-1.5 text-[#6e786a] dark:text-[#9dd6b3]"><Droplets size={14}/>Water</dt><dd className="font-medium">{water}</dd></div>
      <div className="flex items-center justify-between gap-2"><dt className="flex items-center gap-1.5 text-[#6e786a] dark:text-[#9dd6b3]"><Thermometer size={14}/>Climate</dt><dd className="font-medium">{fitLabel(factor('climate'))}</dd></div>
      <div className="flex items-center justify-between gap-2"><dt className="flex items-center gap-1.5 text-[#6e786a] dark:text-[#9dd6b3]"><SoilIcon size={14}/>Soil</dt><dd className="font-medium">{fitLabel(factor('soil'))}</dd></div>
    </dl>
    <p className="mt-3 line-clamp-3 border-t border-[#dfe5d8] dark:border-[#364b40] pt-3 text-sm leading-relaxed text-[#526250] dark:text-[#9dd6b3]">{summary}</p>
    <p className="mt-3 text-sm font-medium text-[#6b7868] dark:text-[#9dd6b3]">{r.confidence} confidence · {r.evidencePercent}% evidence coverage</p>
    <details className="crop-card-details mt-3 text-sm"><summary className="cursor-pointer py-2 font-semibold text-[#356444] dark:text-[#9dd6b3]">View crop details</summary><p className="mt-3 rounded-lg bg-white/70 dark:bg-[#18271f]/70 p-3 leading-relaxed"><strong>Planting window: </strong>{r.planting}</p><AdviceList items={r.reasons}/>
      <div className="mt-3 space-y-3">{r.factors.map(f => <div key={f.key}><div className="flex justify-between gap-2 font-semibold"><span>{f.label} · weight {f.weight}% · {Math.round(f.coverage * 100)}% available</span><span>{f.score === null ? 'Unknown' : `${f.score}/100`}</span></div><div aria-hidden="true" className="mt-1 h-1.5 rounded-full bg-[#edf3e9] dark:bg-[#263b2e]"><div className="h-full rounded-full bg-[#72a164]" style={{ width: `${f.score ?? 0}%` }}/></div><p className="mt-1 leading-relaxed text-[#657260] dark:text-[#9dd6b3]">{f.explanation}</p></div>)}</div>
      <p className="mt-3 rounded-lg bg-[#f3f7ef] dark:bg-[#1b2b23] p-3 leading-relaxed">Overall = weighted mean of known factors (partial soil/NPK evidence reduces that factor’s effective weight), rescaled to 100. Unknown factors are omitted, not assigned neutral scores. If all missing factors ranged from 0 to 100, the complete-evidence score could be {r.scoreRange[0]}–{r.scoreRange[1]}. This is a missing-data bound, not a statistical confidence interval.</p>
      <h5 className="mt-4 font-bold">Soil compatibility</h5><AdviceList items={r.soil}/>
      <h5 className="mt-4 font-bold">Nutrient management</h5><AdviceList items={r.nutrients}/>
      <h5 className="mt-4 font-bold">Risks and rotation warnings</h5><AdviceList items={r.risks.length ? r.risks : ['No additional screening flags; confirm local management and field conditions.']}/>
      <h5 className="mt-4 font-bold">Reusable crop nutrient profile</h5><p className="mt-2 text-[#58704f] dark:text-[#9dd6b3]">N: {profile.nitrogen} · P: {profile.phosphorus} · K: {profile.potassium}. These are qualitative demand classes, not fertilizer doses.</p><AdviceList items={[...profile.secondary, ...profile.micronutrients, profile.organicMatter, 'Uptake is total plant nutrient use; harvest removal depends on yield and exported produce/residues. Fertilizer need also depends on soil supply, amendments, fixation and efficiency. No field-specific amount is inferred here.']}/>
      <div className="mt-3 flex flex-wrap gap-3"><a href={crop.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[#397c58] dark:text-[#9dd6b3] underline">Crop growing ranges</a>{profile.sources.map((url, i) => <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="text-[#397c58] dark:text-[#9dd6b3] underline">Reference {i + 1}</a>)}</div>
    </details>
  </article>;
}
