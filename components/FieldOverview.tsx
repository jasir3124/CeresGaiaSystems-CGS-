'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, ChevronDown, CircleHelp, CloudRain, CloudSun, Droplets, ExternalLink, Leaf, MapPin, RefreshCw, Save, Sun, Thermometer, Wind, X } from 'lucide-react';
import type { Coordinates, LayerId, Measurement, OverviewData, WeatherData } from '@/lib/types';
import { DATA_LAYERS } from '@/lib/layers';
import { areaHectares, boundingSquare } from '@/lib/geo.mjs';

type Props = {
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
  weather: WeatherData | null;
  weatherLoading: boolean;
  weatherError: string | null;
  weatherNotConfigured: boolean;
  placeLabel: string | null;
  preview: { id: LayerId; date: string } | null;
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
  return <div className="min-h-[114px] rounded-xl border border-[#e8ede7] bg-[#f7f9f5] px-3 py-3">
    <div className="flex items-center justify-between gap-1 text-[11px] font-medium text-[#65776a]">
      <span>{title}</span><span className={tone}>{icon}</span>
    </div>
    <div className="mt-3 flex items-baseline gap-1">
      <strong className="text-[24px] font-bold leading-none tracking-[-.05em] text-[#293f34]">{display(measurement, digits)}</strong>
      {measurement?.value !== null && measurement?.value !== undefined && <span className="text-[10px] text-[#8a988b]">{measurement.unit}</span>}
    </div>
    <div className="mt-2 text-[9.5px] leading-tight text-[#8a988b]">{note ?? (measurement?.date ? dateShort(measurement.date) : 'No NASA observation')}</div>
  </div>;
}

function TrendChart({ data }: { data: OverviewData | null }) {
  const chart = useMemo(() => {
    const moisture = (data?.daily ?? []).filter(d => d.soilWetness !== null).slice(-18);
    const temperature = (data?.daily ?? []).filter(d => d.temperature !== null).slice(-18);
    const rows = moisture.length >= 2 ? moisture : temperature;
    const key = moisture.length >= 2 ? 'soilWetness' : 'temperature';
    const values = rows.map(r => r[key]).filter((n): n is number => n !== null);
    if (values.length < 2) return null;
    const min = Math.min(...values), max = Math.max(...values);
    const span = Math.max(1, max - min);
    const points = values.map((n, i) => ({ x: (i / (values.length - 1)) * 268 + 1, y: 64 - ((n - min) / span) * 49 }));
    return {
      path: points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' '),
      fill: `${points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')} L 269 73 L 1 73 Z`,
      title: key === 'soilWetness' ? (data?.soilLabel ?? 'Surface soil wetness') : 'Air temperature',
      dateFrom: rows[0].date, dateTo: rows.at(-1)?.date ?? rows[0].date,
      unit: key === 'soilWetness' ? '%' : '°C'
    };
  }, [data]);

  return <section className="mt-5 border-t border-[#e9eee9] pt-4">
    <div className="flex items-center justify-between gap-2">
      <div><h3 className="text-[12px] font-semibold">Historical trend</h3><p className="mt-0.5 text-[10px] text-[#9ba69e]">Latest available NASA observations</p></div>
      <Activity className="h-4 w-4 text-[#598d6b]" />
    </div>
    {chart ? <>
      <div className="mt-3 flex justify-between text-[10px] text-[#74867b]"><span>{chart.title}</span><span>{chart.unit}</span></div>
      <svg className="mt-1 w-full overflow-visible" viewBox="0 0 270 80" role="img" aria-label={`${chart.title} trend`}>
        <defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c9e9cf" stopOpacity="0.58"/><stop offset="100%" stopColor="#eaf4eb" stopOpacity="0"/></linearGradient></defs>
        <path d="M 1 72 H 269" fill="none" stroke="#e9eee7" strokeWidth="1" strokeDasharray="3 3" />
        <path d={chart.fill} fill="url(#trendFill)" />
        <path d={chart.path} fill="none" stroke="#266b4c" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="-mt-1 flex justify-between text-[9px] text-[#9da9a0]"><span>{dateShort(chart.dateFrom)}</span><span>{dateShort(chart.dateTo)}</span></div>
    </> : <p className="mt-3 rounded-xl bg-[#f4f6f1] p-3 text-[11px] text-[#829287]">A trend will appear when NASA has at least two observations for this location.</p>}
  </section>;
}

export default function FieldOverview({ selection, radius, onRadius, onClear, onClose, onSave, saved, initialName, onRefresh, data, loading, error, weather, weatherLoading, weatherError, weatherNotConfigured, placeLabel, preview }: Props) {
  const [fieldName, setFieldName] = useState(initialName);
  useEffect(() => setFieldName(initialName), [initialName]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [west, south, east, north] = boundingSquare(selection, radius);
  const area = areaHectares(radius);
  const imageryUrl = preview ? `/api/nasa/region-image?${new URLSearchParams({ layer: preview.id, date: preview.date, west: west.toFixed(6), south: south.toFixed(6), east: east.toFixed(6), north: north.toFixed(6) })}` : null;
  useEffect(() => { setImageError(false); }, [imageryUrl]);


  return <div className="soft-scroll flex h-full max-h-full flex-col overflow-y-auto rounded-card border border-[#e5eee4] bg-white shadow-float">
    <div className="px-[19px] pb-5 pt-5">
      <div className="flex items-start justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[.10em] text-[#8a9c90]">Area overview</span>
        <button onClick={onClose} aria-label="Close overview" className="rounded-md p-1 text-[#9aa69d] hover:bg-[#eef5ed] hover:text-[#255b43]"><X size={17}/></button>
      </div>
      <h2 className="mt-1 text-[24px] font-bold tracking-[-.055em] text-[#2b4135]">{placeLabel || 'Selected area'}</h2>
      <p className="mt-1 flex items-center gap-1 text-[11px] text-[#8d9c92]"><MapPin className="h-3 w-3"/> {selection[1].toFixed(5)}, {selection[0].toFixed(5)}</p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px]">
        <span className="rounded-md bg-[#e9f4eb] px-2 py-1 font-semibold text-[#34724c]">● {saved ? 'Saved field' : 'Unsaved selection'}</span>
        <span className="text-[#839488]">{area >= 100 ? Math.round(area).toLocaleString() : area.toFixed(1)} ha circle</span>
      </div>
      <div className="mt-4 space-y-2">
        <label htmlFor="field-name" className="block text-[11px] font-semibold text-[#476451]">Field name</label>
        <input id="field-name" value={fieldName} maxLength={80} onChange={e => setFieldName(e.target.value)} className="w-full rounded-xl border border-[#dfebe0] px-3 py-2 text-[12px] outline-none focus:border-[#4b9564]" placeholder="My field" />
        <button onClick={() => onSave(fieldName.trim() || 'My field')} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#286649] px-3 py-2.5 text-[12px] font-bold text-white hover:bg-[#21583d]"><Save size={15}/>{saved ? 'Update saved field' : 'Save field to this device'}</button>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <label htmlFor="field-radius" className="text-[12px] font-semibold">Selection radius</label>
        <span className="rounded-md bg-[#e9f3e9] px-2 py-1 text-[11px] font-semibold tabular-nums text-[#236346]">{radius >= 1000 ? `${(radius / 1000).toFixed(1)} km` : `${radius} m`}</span>
      </div>
      <input id="field-radius" type="range" min={25} max={5000} step={25} value={radius} onChange={e => onRadius(Number(e.target.value))} className="mt-3 h-1.5 w-full cursor-pointer" aria-label="Selection radius in meters" />
      <div className="mt-1 flex justify-between text-[9px] text-[#a1ada4]"><span>25 m</span><span>5 km</span></div>
      <div className="mt-5 border-t border-[#e9eee9] pt-4">
        <div className="flex items-center justify-between gap-1">
          <h3 className="text-[13px] font-bold">NASA observations</h3>
          <button onClick={onRefresh} disabled={loading} className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-[#59866c] hover:bg-[#f0f5ef] disabled:opacity-50"><RefreshCw size={12} className={loading ? 'animate-spin' : ''}/> Refresh</button>
        </div>
        <p className="mt-1 text-[10px] text-[#85958a]">{data?.latestWeatherDate ? `Latest available air data: ${dateShort(data.latestWeatherDate)}` : loading ? 'Retrieving observed NASA data…' : 'Daily satellite and model-derived datasets'}</p>
        {data?.sampledPoint && <p className="mt-1 text-[9.5px] text-[#94a499]">NASA POWER grid sample: {data.sampledPoint[1].toFixed(2)}°, {data.sampledPoint[0].toFixed(2)}°</p>}
        {error && <div role="alert" className="mt-3 rounded-xl border border-amber-100 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800">{error}<p className="mt-1 text-[10px]">No estimated or placeholder values are shown.</p></div>}
        <div className={`mt-3 grid grid-cols-2 gap-2 ${loading ? 'animate-pulse' : ''}`}>
          <Metric title="Air temperature" measurement={data?.temperature} icon={<Thermometer size={15}/>} tone="text-orange-500" />
          <Metric title="Air humidity" measurement={data?.humidity} icon={<Droplets size={15}/>} tone="text-sky-500" digits={0} />
          <Metric title="Rainfall · 7 days" measurement={data?.rainfallSevenDays} icon={<CloudRain size={15}/>} tone="text-blue-500" note={data?.rainfallSevenDays.value !== null && data?.rainfallSevenDays.value !== undefined ? `${data.rainfallSevenDays.daysAvailable}/7 days · through ${dateShort(data.rainfallSevenDays.end)}` : undefined} />
          <Metric title="Wind speed · 2 m" measurement={data?.windSpeed} icon={<Wind size={15}/>} tone="text-teal-600" />
          <Metric title={data?.soilLabel ?? 'Surface soil wetness'} measurement={data?.soilWetness} icon={<Leaf size={15}/>} tone="text-emerald-600" note={data?.soilWetness?.value === null ? 'No valid NASA observation' : undefined} digits={0}/>
          <Metric title="Solar energy" measurement={data?.solarRadiation} icon={<Sun size={15}/>} tone="text-amber-500"/>
        </div>
        {data?.soilNote && <p className="mt-2 text-[10px] leading-relaxed text-[#8b9a8d]">{data.soilNote}</p>}
      </div>
      <section className="mt-5 border-t border-[#e9eee9] pt-4">
        <div className="flex items-center justify-between gap-2"><h3 className="text-[13px] font-bold">Weather forecast</h3><span className="flex items-center gap-1 rounded-lg bg-[#ecf5ef] px-2 py-1 text-[9px] font-semibold text-[#34724c]"><CloudSun size={13}/> Meteomatics</span></div>
        {weatherLoading && <p className="mt-2 text-[10px] text-[#819287]">Loading forecast…</p>}
        {weatherNotConfigured && <p className="mt-2 rounded-xl bg-[#f4f6f1] p-3 text-[10px] leading-relaxed text-[#76877b]">Forecast is ready to connect. Add your Meteomatics credentials to the server's .env.local file.</p>}
        {weatherError && <p className="mt-2 rounded-xl bg-amber-50 p-3 text-[10px] text-amber-800">{weatherError}</p>}
        {weather && weather.forecast.length > 0 && (() => {
          const forecast = weather.forecast;
          // Use the earliest valid Meteomatics forecast step; do not call it a live sensor observation.
          const first = forecast[0];
          const fmt = (v: number | null, unit: string) => v === null ? '—' : `${Number(v.toFixed(1))} ${unit}`;
          return <>
            <p className="mt-1 text-[10px] text-[#8e9e92]">Forecast valid {new Date(first.time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-[#f5f9f6] p-3"><p className="text-[10px] text-[#788b7d]">Temperature</p><strong className="mt-2 block text-[17px] text-[#315940]">{fmt(first.temperature, '°C')}</strong></div>
              <div className="rounded-xl bg-[#f5f9f6] p-3"><p className="text-[10px] text-[#788b7d]">Humidity</p><strong className="mt-2 block text-[17px] text-[#315940]">{fmt(first.humidity, '%')}</strong></div>
              <div className="rounded-xl bg-[#f5f9f6] p-3"><p className="text-[10px] text-[#788b7d]">Wind at 10 m</p><strong className="mt-2 block text-[17px] text-[#315940]">{fmt(first.windSpeed, 'm/s')}</strong></div>
              <div className="rounded-xl bg-[#f5f9f6] p-3"><p className="text-[10px] text-[#788b7d]">Rain in preceding 1 h</p><strong className="mt-2 block text-[17px] text-[#315940]">{fmt(first.precipitationPreviousHour, 'mm')}</strong></div>
            </div>
            <p className="mt-2 text-[9px] text-[#8e9e92]">Model forecast for this area · refreshed when selecting a field</p>
          </>;
        })()}
      </section>
      <TrendChart data={data}/>
      {preview && imageryUrl && <section className="mt-5 border-t border-[#e9eee9] pt-4">
        <div className="flex items-center justify-between"><h3 className="text-[12px] font-semibold">NASA area imagery</h3><span className="rounded-md bg-[#edf5ed] px-2 py-1 text-[9px] font-semibold text-[#447a58]">GIBS WMS</span></div>
        <p className="mt-1 text-[10px] text-[#8b9d91]">{DATA_LAYERS[preview.id].label} · {dateShort(preview.date)}</p>
        {imageError ? <p className="mt-2 rounded-xl bg-[#f5f7f3] px-3 py-7 text-center text-[10px] text-[#86988b]">NASA has no available image for this area and date.</p> :
          <div className="mt-2 overflow-hidden rounded-xl border border-[#e5ebe4] bg-[#f0f3ec]">
            <img key={imageryUrl} src={imageryUrl} onLoad={() => setImageError(false)} onError={() => setImageError(true)} className="h-[158px] w-full object-cover" alt={`NASA ${DATA_LAYERS[preview.id].label} satellite/model imagery cropped to the square bounds`} />
          </div>}
        <p className="mt-2 text-[9.5px] leading-relaxed text-[#8c9b8f]">Satellite data for the selected area, where available.</p>
      </section>}

      <button onClick={() => setDetailsOpen(v => !v)} aria-expanded={detailsOpen} className="mt-4 flex w-full items-center justify-between border-b border-[#e9efea] pb-2 text-left text-[11px] font-semibold"><span className="flex items-center gap-2"><CircleHelp size={14}/> About data sources</span><ChevronDown size={14} className={detailsOpen ? 'rotate-180' : ''}/></button>
      {detailsOpen && <div className="space-y-2 pt-3 text-[10px] leading-relaxed text-[#7e8f82]">
        <p><strong>NASA POWER:</strong> daily gridded data sampled at a nearby ~0.5° point derived from the pin, not averaged across the circle.</p>
        <p><strong>NASA GIBS:</strong> dated satellite/model visualizations for the selected location. Imagery is not an individual-field measurement.</p>
        <p><strong>Meteomatics:</strong> area weather forecast, separate from NASA historical observations.</p>
        <p><strong>Vegetation:</strong> MODIS NDVI is a map visualization, not a field health score.</p>
        <a className="inline-flex items-center gap-1 font-semibold text-[#27694c] hover:underline" href="https://power.larc.nasa.gov/" target="_blank" rel="noopener noreferrer">NASA POWER <ExternalLink size={11}/></a>
        <span className="mx-2">·</span>
        <a className="inline-flex items-center gap-1 font-semibold text-[#27694c] hover:underline" href="https://www.earthdata.nasa.gov/data/tools/gibs" target="_blank" rel="noopener noreferrer">NASA Earthdata <ExternalLink size={11}/></a>
      </div>}
      <button onClick={onClear} className="mt-5 text-[10px] font-semibold text-[#87978c] hover:text-red-600">Clear selection from map</button>
    </div>
  </div>;
}
