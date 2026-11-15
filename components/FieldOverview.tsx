'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, CloudRain, Droplets, Leaf, MapPin, RefreshCw, Save, Sun, Thermometer, Wind, X } from 'lucide-react';
import type { Coordinates, Measurement, OverviewData } from '@/lib/types';
import { areaHectares } from '@/lib/geo.mjs';

type Props = {
  offline: boolean;
  onViewMore: () => void;
  selection: Coordinates;
  radius: number;
  onRadius: (n: number) => void;
  onClear: () => void;
  onClose: () => void;
  onSave: (name: string) => void;
  saved: boolean;
  initialName: string;
  onRefresh: () => void;
  data: OverviewData | null;
  loading: boolean;
  error: string | null;
  placeLabel: string | null;
};

function display(m: Measurement | undefined, decimals = 1) {
  if (!m || m.value === null) return '—';
  return Number(m.value.toFixed(decimals)).toLocaleString('en-US', { maximumFractionDigits: decimals });
}
function dateShort(d: string | null | undefined) {
  if (!d) return 'No date';
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
function Metric({ title, measurement, icon, tone, note, digits = 1 }: {
  title: string; measurement?: Measurement; icon: React.ReactNode; tone: string; note?: string; digits?: number;
}) {
  return <div className="min-h-[114px] rounded-xl border border-[#e8ede7] dark:border-[#364b40] bg-[#f7f9f5] dark:bg-[#1b2b23] px-3 py-3">
    <div className="flex items-center justify-between gap-1 text-[11px] font-medium text-[#65776a] dark:text-[#9dd6b3]">
      <span>{title}</span><span className={tone}>{icon}</span>
    </div>
    <div className="mt-3 flex items-baseline gap-1">
      <strong className="text-[24px] font-bold leading-none tracking-[-.05em] text-[#293f34] dark:text-[#e2ece5]">{display(measurement, digits)}</strong>
      {measurement?.value !== null && measurement?.value !== undefined && <span className="text-[10px] text-[#8a988b] dark:text-[#afc2b5]">{measurement.unit}</span>}
    </div>
    <div className="mt-2 text-[9.5px] leading-tight text-[#8a988b] dark:text-[#afc2b5]">{note ?? (measurement?.date ? dateShort(measurement.date) : 'No NASA observation')}</div>
  </div>;
}

// Compact saved-field editor; longer history is opened in the separate data panel.
export default function FieldOverview({ offline, selection, radius, onRadius, onClear, onClose, onSave, saved, initialName, onRefresh, data, loading, error, placeLabel, onViewMore }: Props) {
  const [fieldName, setFieldName] = useState(initialName);
  useEffect(() => setFieldName(initialName), [initialName]);
  const area = areaHectares(radius);

  return <div className="soft-scroll flex h-full max-h-full flex-col overflow-y-auto rounded-card border border-[#e5eee4] dark:border-[#364b40] bg-white dark:bg-[#18271f] shadow-float">
    <div className="px-[19px] pb-5 pt-5">
      <div className="flex items-start justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[.10em] text-[#8a9c90] dark:text-[#afc2b5]">Area overview</span>
        <button onClick={onClose} aria-label="Close overview" className="rounded-md p-1 text-[#9aa69d] dark:text-[#afc2b5] hover:bg-[#eef5ed] dark:hover:bg-[#1b2b23] hover:text-[#255b43] dark:hover:text-[#e2ece5]"><X size={17}/></button>
      </div>
      <h2 className="mt-1 text-[24px] font-bold tracking-[-.055em] text-[#2b4135] dark:text-[#e2ece5]">{placeLabel || 'Selected area'}</h2>
      <p className="mt-1 flex items-center gap-1 text-[11px] text-[#8d9c92] dark:text-[#afc2b5]"><MapPin className="h-3 w-3"/> {selection[1].toFixed(5)}, {selection[0].toFixed(5)}</p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px]">
        <span className="rounded-md bg-[#e9f4eb] dark:bg-[#263b2e] px-2 py-1 font-semibold text-[#34724c] dark:text-[#9dd6b3]">● {saved ? 'Saved field' : 'Unsaved selection'}</span>
        <span className="text-[#839488] dark:text-[#afc2b5]">{area >= 100 ? Math.round(area).toLocaleString() : area.toFixed(1)} ha circle</span>
      </div>
      <div className="mt-4 space-y-2">
        <label htmlFor="field-name" className="block text-[11px] font-semibold text-[#476451] dark:text-[#9dd6b3]">Field name</label>
        <input id="field-name" value={fieldName} maxLength={80} onChange={e => setFieldName(e.target.value)} className="w-full rounded-xl border border-[#dfebe0] dark:border-[#364b40] px-3 py-2 text-[12px] outline-none focus:border-[#4b9564]" placeholder="My field" />
        <button onClick={() => onSave(fieldName.trim() || 'My field')} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#286649] px-3 py-2.5 text-[12px] font-bold text-white hover:bg-[#21583d]"><Save size={15}/>{saved ? 'Update saved field' : 'Save field to this device'}</button>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <label htmlFor="field-radius" className="text-[12px] font-semibold">Selection radius</label>
        <span className="rounded-md bg-[#e9f3e9] dark:bg-[#263b2e] px-2 py-1 text-[11px] font-semibold tabular-nums text-[#236346] dark:text-[#e2ece5]">{radius >= 1000 ? `${(radius / 1000).toFixed(1)} km` : `${radius} m`}</span>
      </div>
      <input id="field-radius" type="range" min={25} max={5000} step={25} value={radius} onChange={e => onRadius(Number(e.target.value))} className="mt-3 h-1.5 w-full cursor-pointer" aria-label="Selection radius in meters" />
      <div className="mt-1 flex justify-between text-[9px] text-[#a1ada4] dark:text-[#afc2b5]"><span>25 m</span><span>5 km</span></div>
      {offline && <p role="status" className="mt-4 rounded-xl bg-[#edf5ed] p-3 text-xs dark:bg-[#263b2e]">Offline · showing your last saved observations. Connect to refresh data or view the map.</p>}
      <div className="mt-5 border-t border-[#e9eee9] dark:border-[#364b40] pt-4">
        <div className="flex items-center justify-between gap-1">
          <h3 className="text-[13px] font-bold">NASA observations</h3>
          <button onClick={onRefresh} disabled={loading || offline} className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-[#59866c] dark:text-[#9dd6b3] hover:bg-[#f0f5ef] dark:hover:bg-[#1b2b23] disabled:opacity-50"><RefreshCw size={12} className={loading ? 'animate-spin' : ''}/> Refresh</button>
        </div>
        <p className="mt-1 text-[10px] text-[#85958a] dark:text-[#afc2b5]">{data?.latestWeatherDate ? `Latest available air data: ${dateShort(data.latestWeatherDate)}` : loading ? 'Retrieving observed NASA data…' : 'Daily satellite and model-derived datasets'}</p>
        {data?.sampledPoint && <p className="mt-1 text-[9.5px] text-[#94a499] dark:text-[#afc2b5]">NASA POWER grid sample: {data.sampledPoint[1].toFixed(2)}°, {data.sampledPoint[0].toFixed(2)}°</p>}
        {error && <div role="alert" className="mt-3 rounded-xl border border-amber-100 bg-amber-50 dark:bg-[#302e22] p-3 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">{error}<p className="mt-1 text-[10px]">No estimated or placeholder values are shown.</p></div>}
        <div className={`mt-3 grid grid-cols-2 gap-2 ${loading ? 'animate-pulse' : ''}`}>
          <Metric title="Air temperature" measurement={data?.temperature} icon={<Thermometer size={15}/>} tone="text-orange-500 dark:text-amber-300" />
          <Metric title="Air humidity" measurement={data?.humidity} icon={<Droplets size={15}/>} tone="text-sky-500" digits={0} />
          <Metric title="Rainfall · 7 days" measurement={data?.rainfallSevenDays} icon={<CloudRain size={15}/>} tone="text-blue-500" note={data?.rainfallSevenDays.value !== null && data?.rainfallSevenDays.value !== undefined ? `${data.rainfallSevenDays.daysAvailable}/7 days · through ${dateShort(data.rainfallSevenDays.end)}` : undefined} />
          <Metric title="Wind speed · 2 m" measurement={data?.windSpeed} icon={<Wind size={15}/>} tone="text-teal-600" />
          <Metric title={data?.soilLabel ?? 'Surface soil wetness'} measurement={data?.soilWetness} icon={<Leaf size={15}/>} tone="text-emerald-600 dark:text-[#afc2b5]" note={data?.soilWetness?.value === null ? 'No valid NASA observation' : undefined} digits={0}/>
          <Metric title="Solar energy" measurement={data?.solarRadiation} icon={<Sun size={15}/>} tone="text-amber-500 dark:text-amber-300"/>
        </div>
        {data?.soilNote && <p className="mt-2 text-[10px] leading-relaxed text-[#8b9a8d] dark:text-[#afc2b5]">{data.soilNote}</p>}
      </div>
      <button onClick={onViewMore} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#286649] px-4 py-3 text-[12px] font-bold text-white hover:bg-[#21583d]" aria-haspopup="dialog">View more data <ArrowUpRight size={16}/></button>
      <button onClick={onClear} className="mt-5 text-[10px] font-semibold text-[#87978c] dark:text-[#afc2b5] hover:text-red-600 dark:hover:text-red-300">Clear selection from map</button>
    </div>
  </div>;
}
