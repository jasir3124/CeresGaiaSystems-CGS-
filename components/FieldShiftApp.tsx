'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import type mapboxgl from 'mapbox-gl';
import { Activity, ArrowRight, ChevronDown, ChevronLeft, ChevronRight, CloudRain, Compass, Crosshair, Droplets, ExternalLink, HelpCircle, Layers, Leaf, LocateFixed, Map, MapPin, Mountain, Search, SlidersHorizontal, Sparkles, Sun, Thermometer, Wind, X, ZoomIn, ZoomOut } from 'lucide-react';
import FieldOverview from './FieldOverview';
import { BASE_STYLES, DATA_LAYERS, LAYER_IDS } from '@/lib/layers';
import type { Coordinates, LayerId, LayerManifest, LayerStatus, MapStyleId, OverviewData } from '@/lib/types';

const MapCanvas = dynamic(() => import('./MapCanvas'), { ssr: false });
const configuredToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
const TOKEN = configuredToken.startsWith('pk.') && configuredToken.length > 50 && !configuredToken.includes('your_') ? configuredToken : '';
const layerIcons: Record<LayerId, React.ReactNode> = {
  soil: <Droplets size={14}/>,
  temperature: <Thermometer size={14}/>,
  rain: <CloudRain size={14}/>,
  vegetation: <Leaf size={14}/>,
  wind: <Wind size={14}/>
};
const layerOrder: LayerId[] = ['soil', 'temperature', 'rain', 'vegetation', 'wind'];
type Result = {
  geometry: { coordinates: Coordinates };
  properties: { full_address?: string; name?: string; place_formatted?: string };
};
function fmtDate(value: string | null) {
  if (!value) return 'Date unavailable';
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export default function FieldShiftApp() {
  const [selection, setSelection] = useState<Coordinates | null>(null);
  const [radius, setRadius] = useState(100);
  const [showBounds, setShowBounds] = useState(true);
  const [showOverview, setShowOverview] = useState(true);
  const [placeLabel, setPlaceLabel] = useState<string | null>(null);
  const [styleId, setStyleId] = useState<MapStyleId>('satellite');
  const [stylePickerOpen, setStylePickerOpen] = useState(false);
  const [layersPanelOpen, setLayersPanelOpen] = useState(false);
  const [enabledLayers, setEnabledLayers] = useState<LayerId[]>([]);
  const [layerManifest, setLayerManifest] = useState<LayerManifest | null>(null);
  const [layerError, setLayerError] = useState<string | null>(null);
  const [data, setData] = useState<OverviewData | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [focus, setFocus] = useState<{ coords: Coordinates; nonce: number } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchResults, setSearchResults] = useState<Result[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const searchAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/api/nasa/layers', { signal: ctrl.signal }).then(async r => {
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || 'NASA imagery catalog unavailable');
      setLayerManifest(json as LayerManifest);
      setLayerError(null);
    }).catch(e => { if (e.name !== 'AbortError') setLayerError(e.message || 'Could not load NASA imagery catalog'); });
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    if (!selection) { setData(null); setDataError(null); setDataLoading(false); return; }
    const ctrl = new AbortController();
    setData(null); setDataError(null); setDataLoading(true);
    const query = new URLSearchParams({ lng: selection[0].toFixed(4), lat: selection[1].toFixed(4) });
    fetch(`/api/nasa/overview?${query.toString()}`, { signal: ctrl.signal }).then(async res => {
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'NASA data unavailable');
      setData(json as OverviewData);
    }).catch(e => { if (e.name !== 'AbortError') setDataError(e.message || 'Network error'); })
      .finally(() => { if (!ctrl.signal.aborted) setDataLoading(false); });
    return () => ctrl.abort();
  }, [selection, refreshIndex]);

  useEffect(() => {
    if (!searchFocused || searchTerm.trim().length < 2 || !TOKEN) { setSearchResults([]); setSearchLoading(false); return; }
    searchAbort.current?.abort();
    const ctrl = new AbortController();
    searchAbort.current = ctrl;
    const timer = window.setTimeout(async () => {
      setSearchLoading(true); setSearchError(null);
      try {
        const params = new URLSearchParams({ q: searchTerm, access_token: TOKEN, autocomplete: 'true', limit: '5', language: 'en' });
        const res = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${params}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`Search unavailable (${res.status})`);
        const json = await res.json() as { features?: Result[] };
        setSearchResults(json.features ?? []);
      } catch (e) { if (!(e instanceof Error && e.name === 'AbortError')) setSearchError('Search is temporarily unavailable. You can click the map instead.'); }
      finally { if (!ctrl.signal.aborted) setSearchLoading(false); }
    }, 340);
    return () => { window.clearTimeout(timer); ctrl.abort(); };
  }, [searchTerm, searchFocused]);

  const statuses: LayerStatus[] = useMemo(() => layerManifest?.layers ?? [], [layerManifest]);
  const previewId = enabledLayers.at(-1);
  const previewStatus = statuses.find(s => s.id === previewId);
  const preview = previewId && previewStatus?.available && previewStatus.date ? { id: previewId, date: previewStatus.date } : null;
  const handleSelect = (coords: Coordinates, name?: string | null, fly = false) => {
    setSelection(coords);
    setPlaceLabel(name ?? null);
    setShowOverview(true);
    setSearchFocused(false);
    setSearchResults([]);
    if (fly) setFocus({ coords, nonce: Date.now() });
  };
  const toggleLayer = (id: LayerId) => {
    const status = statuses.find(item => item.id === id);
    if (layerError) { setToast('NASA imagery is temporarily unavailable. Try reloading the page.'); return; }
    if (layerManifest && !status?.available) { setToast(`${DATA_LAYERS[id].label}: NASA has not published an available imagery date.`); return; }
    setEnabledLayers(v => v.includes(id) ? v.filter(x => x !== id) : [...v, id]);
  };
  const clearSelection = () => { setSelection(null); setPlaceLabel(null); setShowOverview(false); };
  const zoom = (delta: number) => mapInstance?.easeTo({ zoom: mapInstance.getZoom() + delta, duration: 320 });
  const locate = () => {
    if (!navigator.geolocation) { setToast('Your browser does not support geolocation.'); return; }
    navigator.geolocation.getCurrentPosition(
      pos => handleSelect([pos.coords.longitude, pos.coords.latitude], 'My location', true),
      () => setToast('Location permission was denied or is unavailable. You can click the map instead.'),
      { enableHighAccuracy: false, timeout: 12000 }
    );
  };

  return <main className="relative h-[100dvh] min-h-[480px] w-full overflow-hidden bg-[#d1dfcd]">
    <div className="absolute inset-0 bg-[linear-gradient(135deg,#a9bda2_0%,#d3cda4_45%,#7d9e88_100%)]" />
    {TOKEN && <MapCanvas token={TOKEN} selection={selection} radius={radius} styleId={styleId} enabledLayers={enabledLayers} layerStatuses={statuses} onSelect={coords => handleSelect(coords)} focus={focus} onReady={setMapInstance} showBounds={showBounds} />}

    {/* Minimal navigation: intentionally no saved fields, crops or chat. */}
    <nav aria-label="Primary navigation" className="absolute inset-y-0 left-0 z-30 flex w-[58px] flex-col items-center border-r border-[#ebefeb] bg-white/95 px-1 py-3 shadow-[3px_0_16px_rgba(20,50,30,.08)] backdrop-blur-md md:w-[64px]">
      <div className="group flex flex-col items-center gap-1" title="FieldShift">
        <div className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#225c44] text-white"><Leaf size={19} strokeWidth={1.8}/></div>
        <span className="text-[8.5px] font-extrabold tracking-[-.04em] text-[#275641]">FieldShift</span>
      </div>
      <div className="mt-7 flex w-full flex-col items-center gap-2">
        <button className="flex h-[57px] w-full flex-col items-center justify-center gap-1 rounded-xl bg-[#eef5ee] text-[#286048]" title="Explore" aria-current="page"><Map size={17}/><span className="text-[9px] font-semibold">Explore</span></button>
        <button onClick={() => setLayersPanelOpen(v => !v)} className={`flex h-[57px] w-full flex-col items-center justify-center gap-1 rounded-xl transition-colors ${layersPanelOpen ? 'bg-[#eef5ee] text-[#286048]' : 'text-[#8a9990] hover:bg-[#f7faf6]'}`} title="Map layers" aria-expanded={layersPanelOpen}><Layers size={17}/><span className="text-[9px]">Layers</span></button>
        <button onClick={() => { if (selection) setShowOverview(v => !v); else setToast('First click the map or search for a location.'); }} className="flex h-[57px] w-full flex-col items-center justify-center gap-1 rounded-xl text-[#8a9990] hover:bg-[#f7faf6]" title="Area overview"><Activity size={17}/><span className="text-[9px]">Overview</span></button>
      </div>
      <div className="mt-auto flex flex-col items-center gap-2 pb-1">
        <button onClick={() => setHelpOpen(v => !v)} aria-label="How to use FieldShift" className="grid h-9 w-9 place-items-center rounded-xl text-[#84948a] hover:bg-[#f2f7f1] hover:text-[#1f5b42]"><HelpCircle size={19}/></button>
        <span className="text-[9px] text-[#9cab9f]">Help</span>
      </div>
    </nav>

    {/* Place search and dataset pills */}
    <header className="pointer-events-none absolute left-[68px] right-3 top-3 z-20 md:left-[78px] md:right-5 md:top-4">
      <div className="flex w-full items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-2 sm:flex-initial">
          <div className="pointer-events-auto relative w-full sm:w-[310px] md:w-[345px]">
            <div className="flex h-[44px] items-center gap-2.5 rounded-xl border border-white/70 bg-white px-3.5 shadow-soft">
              <Search size={18} className="shrink-0 text-[#397c58]" />
              <input ref={searchInput} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} onFocus={() => setSearchFocused(true)} onKeyDown={e => { if (e.key === 'Escape') { setSearchFocused(false); searchInput.current?.blur(); } else if (e.key === 'Enter' && searchResults.length) { const top = searchResults[0]; handleSelect(top.geometry.coordinates, top.properties.name || 'Searched location', true); setSearchTerm(top.properties.full_address || top.properties.name || ''); searchInput.current?.blur(); } }} placeholder="Search a place, address, or coordinates" aria-label="Search for location" className="w-full min-w-0 bg-transparent text-[11px] text-[#415f4d] outline-none placeholder:text-[#a0ada3]" />
              {searchTerm && <button onClick={() => { setSearchTerm(''); setSearchResults([]); searchInput.current?.focus(); }} aria-label="Clear search" className="text-[#99a89d]"><X size={14}/></button>}
            </div>
            {searchFocused && searchTerm.length >= 2 && <div className="absolute inset-x-0 top-[50px] overflow-hidden rounded-xl bg-white shadow-float">
              {searchLoading && <p className="p-3 text-[11px] text-[#8b998f]">Finding places…</p>}
              {searchError && <p className="p-3 text-[11px] text-amber-700">{searchError}</p>}
              {!searchLoading && !searchError && searchResults.map((r, i) => <button key={`${r.geometry.coordinates.join('-')}-${i}`} onClick={() => { handleSelect(r.geometry.coordinates, r.properties.name || 'Searched location', true); setSearchTerm(r.properties.full_address || r.properties.name || ''); searchInput.current?.blur(); }} className="flex w-full items-start gap-2 border-b border-[#f0f3ee] px-3 py-2.5 text-left hover:bg-[#f5f9f5]"><MapPin className="mt-0.5 shrink-0 text-[#5b876a]" size={15}/><span className="min-w-0"><strong className="block truncate text-[11px] text-[#31533e]">{r.properties.name || 'Location'}</strong><span className="block truncate text-[10px] text-[#90a095]">{r.properties.place_formatted || r.properties.full_address}</span></span></button>)}
              {!searchLoading && !searchError && !searchResults.length && <p className="p-3 text-[11px] text-[#8b998f]">No matching places. Try another search or click the map.</p>}
            </div>}
          </div>
          <button onClick={() => { setToast('Click anywhere on the map to place a pin, then adjust the radius in the overview.'); setSearchFocused(false); }} className="pointer-events-auto hidden h-[44px] shrink-0 items-center gap-2 rounded-xl bg-white px-4 text-[11px] font-semibold text-[#32674d] shadow-soft transition hover:bg-[#f2f7f0] md:flex"><MapPin size={15}/> Select an area</button>
        </div>
        <div className="pointer-events-auto hidden shrink-0 items-center gap-2 rounded-xl bg-white px-4 py-2.5 shadow-soft lg:flex">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-[#eef4ea] text-[#447953]"><Sun size={17}/></span>
          <span><span className="block text-[11px] font-bold text-[#344d3d]">NASA Earth Explorer</span><span className="block text-[9px] text-[#8fa092]">Observed data · not a live forecast</span></span>
        </div>
      </div>
      <div className="pointer-events-auto soft-scroll mt-2.5 flex max-w-[730px] gap-1.5 overflow-x-auto pb-1">
        {layerOrder.map(id => {
          const selected = enabledLayers.includes(id);
          const status = statuses.find(s => s.id === id);
          return <button key={id} onClick={() => toggleLayer(id)} aria-pressed={selected} title={`${DATA_LAYERS[id].details}${status?.date ? ` · ${fmtDate(status.date)}` : ''}`} className={`flex h-[29px] shrink-0 items-center gap-1.5 rounded-full border px-3 text-[10px] font-semibold shadow-sm transition-colors ${selected ? 'border-[#245d45] bg-[#235f46] text-white' : 'border-white/90 bg-white/95 text-[#627666] hover:bg-[#f1f7ef]'}`}>
            <span className={selected ? 'text-[#d4f2d7]' : 'text-[#5e8a6b]'}>{layerIcons[id]}</span>{DATA_LAYERS[id].label}
            {selected && <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-[#bdf7b5]" />}
          </button>;
        })}
        <button onClick={() => setLayersPanelOpen(v => !v)} className="flex h-[29px] shrink-0 items-center gap-1 rounded-full bg-white/95 px-3 text-[10px] font-semibold text-[#5d7763] shadow-sm"><SlidersHorizontal size={13}/> More</button>
      </div>
    </header>

    {selection && showOverview && <aside className="absolute bottom-[76px] left-[69px] top-[131px] z-10 w-[min(329px,calc(100vw-84px))] md:bottom-[76px] md:left-[79px] md:top-[127px] md:w-[335px]">
      <FieldOverview selection={selection} radius={radius} onRadius={setRadius} onClear={clearSelection} onRefresh={() => setRefreshIndex(i => i + 1)} data={data} loading={dataLoading} error={dataError} showBounds={showBounds} onToggleBounds={setShowBounds} placeLabel={placeLabel} preview={preview}/>
    </aside>}

    {selection && !showOverview && <button onClick={() => setShowOverview(true)} className="absolute left-[78px] top-[136px] z-10 flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-[11px] font-semibold text-[#286048] shadow-float"><ChevronRight size={16}/> View area overview</button>}

    {!selection && TOKEN && <div className="pointer-events-none absolute bottom-[105px] left-1/2 z-10 w-[min(340px,calc(100vw-80px))] -translate-x-1/2 rounded-2xl border border-white/70 bg-white/95 p-4 text-center shadow-float backdrop-blur-md sm:bottom-[93px]">
      <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-[#e6f4e7] text-[#397a55]"><MapPin size={19}/></div>
      <p className="mt-2 text-[13px] font-bold text-[#2b4d3b]">Explore any area on Earth</p>
      <p className="mt-1 text-[11px] leading-relaxed text-[#859488]">Click the map to drop a pin and explore real NASA Earth data for that location.</p>
    </div>}

    {/* Satellite / terrain / dark base-map selection */}
    <div className="absolute bottom-5 left-[70px] z-10 md:bottom-6 md:left-[80px]">
      {stylePickerOpen && <div className="mb-2 grid w-[244px] grid-cols-2 gap-2 rounded-xl bg-white p-2 shadow-float">
        {(Object.entries(BASE_STYLES) as [MapStyleId, typeof BASE_STYLES[MapStyleId]][]).map(([id, item]) => <button key={id} onClick={() => { setStyleId(id); setStylePickerOpen(false); }} className={`flex items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] font-semibold ${id === styleId ? 'bg-[#eaf4eb] text-[#205b43]' : 'hover:bg-[#f6f8f5]'}`}>
          <span className={`h-7 w-7 shrink-0 rounded-md border border-black/10 ${id === 'satellite' ? 'bg-[linear-gradient(135deg,#526c4e_15%,#a6ae67_30%,#48604d_45%,#c5a96f_60%,#355f47_85%)]' : id === 'terrain' ? 'bg-[linear-gradient(120deg,#c8d6b5,#87aa7f,#d7cfaa)]' : id === 'dark' ? 'bg-[linear-gradient(125deg,#13202c,#283e51)]' : 'bg-[linear-gradient(125deg,#f1e4cd,#c5d8c5)]'}`} />{item.name}
        </button>)}
      </div>}
      <button onClick={() => setStylePickerOpen(v => !v)} aria-expanded={stylePickerOpen} className="flex h-[49px] items-center gap-3 rounded-xl bg-white p-1.5 pr-4 shadow-float">
        <span className={`h-[37px] w-[37px] rounded-lg border border-white/70 ${styleId === 'satellite' ? 'bg-[linear-gradient(135deg,#526c4e_15%,#a6ae67_30%,#48604d_45%,#c5a96f_60%,#355f47_85%)]' : styleId === 'terrain' ? 'bg-[linear-gradient(120deg,#c8d6b5,#87aa7f,#d7cfaa)]' : styleId === 'dark' ? 'bg-[linear-gradient(125deg,#13202c,#283e51)]' : 'bg-[linear-gradient(125deg,#f1e4cd,#c5d8c5)]'}`} />
        <span className="text-left"><strong className="block text-[11px] leading-tight">{BASE_STYLES[styleId].name}</strong><small className="block text-[9px] text-[#a5b0a7]">Base map</small></span>
        <Layers size={17} className="ml-1 text-[#487e5b]"/>
      </button>
    </div>

    {/* Right-side map actions */}
    <div className="absolute right-4 top-[149px] z-10 flex flex-col items-center gap-3 md:right-6 md:top-[175px]">
      <button onClick={() => mapInstance?.easeTo({ bearing: 0, pitch: 0, duration: 500 })} title="Reset north and tilt" className="flex h-11 w-11 flex-col items-center justify-center rounded-xl bg-white shadow-float"><span className="text-[9px] font-extrabold leading-none text-[#316349]">N</span><Compass size={16} className="mt-1 text-[#3a7654]"/></button>
      <div className="flex flex-col gap-0.5 rounded-xl bg-white p-1 shadow-float">
        <button onClick={locate} title="Locate me" aria-label="Locate me" className="grid h-10 w-10 place-items-center rounded-lg text-[#477e5b] hover:bg-[#f0f5ef]"><LocateFixed size={19}/></button>
        <div className="mx-2 h-px bg-[#e8eee8]"/>
        <button onClick={() => zoom(1)} title="Zoom in" aria-label="Zoom in" className="grid h-10 w-10 place-items-center rounded-lg text-[#477e5b] hover:bg-[#f0f5ef]"><ZoomIn size={19}/></button>
        <div className="mx-2 h-px bg-[#e8eee8]"/>
        <button onClick={() => zoom(-1)} title="Zoom out" aria-label="Zoom out" className="grid h-10 w-10 place-items-center rounded-lg text-[#477e5b] hover:bg-[#f0f5ef]"><ZoomOut size={19}/></button>
      </div>
    </div>

    {layersPanelOpen && <div className="absolute right-4 top-[332px] z-20 w-[min(298px,calc(100vw-85px))] rounded-card border border-[#e7eee7] bg-white p-4 shadow-float md:right-6 md:top-[355px]">
      <div className="flex items-start justify-between gap-2"><div><h3 className="text-[13px] font-bold">NASA map layers</h3><p className="mt-0.5 text-[10px] text-[#91a195]">Satellite & model visualizations</p></div><button onClick={() => setLayersPanelOpen(false)} className="text-[#91a195]"><X size={16}/></button></div>
      <div className="mt-3 space-y-1">{LAYER_IDS.map(id => {
        const status = statuses.find(s => s.id === id);
        const enabled = enabledLayers.includes(id);
        return <button key={id} onClick={() => toggleLayer(id)} aria-pressed={enabled} className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-[#f6f9f5]">
          <span className="flex min-w-0 items-center gap-2.5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#eef6ed] text-[#3b7853]">{layerIcons[id]}</span><span className="min-w-0"><strong className="block text-[11px] font-semibold">{DATA_LAYERS[id].label}</strong><small className="block truncate text-[9px] text-[#96a49b]">{status?.date ? `NASA · ${fmtDate(status.date)}` : layerError ? 'Catalog unavailable' : status ? 'No available imagery' : 'Checking NASA…'}</small></span></span><span className="switch" data-on={enabled}/>
        </button>;
      })}</div>
      {layerError && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-[10px] text-amber-700">{layerError}</p>}
      <p className="mt-3 border-t border-[#e9efea] pt-3 text-[10px] leading-relaxed text-[#859488]">Imagery dates are retrieved from NASA. Wind here is a <strong>monthly historical layer</strong>, not a live wind forecast. Overlays can look coarse at field zoom.</p>
    </div>}

    {helpOpen && <div className="absolute bottom-6 left-[70px] z-30 w-[min(325px,calc(100vw-85px))] rounded-card bg-white p-5 shadow-float md:left-[80px]">
      <button onClick={() => setHelpOpen(false)} aria-label="Close help" className="absolute right-3 top-3 text-[#92a095]"><X size={17}/></button>
      <h3 className="text-[15px] font-bold">How FieldShift works</h3>
      <ol className="mt-3 list-inside list-decimal space-y-2 text-[11px] leading-relaxed text-[#697f70]">
        <li>Click the map or search for a place.</li><li>Drag the green pin to adjust the center.</li><li>Change the radius to grow or shrink the selected area.</li><li>Use the NASA layer chips for satellite and modeled imagery.</li><li>View dated NASA observations in the overview.</li>
      </ol>
      <p className="mt-3 rounded-lg bg-[#f1f6ef] p-2 text-[10px] text-[#65816a]">No account. Your selection stays only in this tab; nothing is saved.</p>
    </div>}

    {!TOKEN && <div className="absolute left-1/2 top-1/2 z-10 w-[min(460px,calc(100vw-95px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white bg-white p-7 shadow-float">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-[#e6f3e7] text-[#286347]"><Map size={23}/></div>
      <h2 className="text-[19px] font-bold tracking-tight">Connect your Mapbox map</h2>
      <p className="mt-2 text-[12px] leading-relaxed text-[#6b8070]">The Next.js project is ready, but Mapbox needs your public token to display the map. NASA POWER and GIBS do not require API keys.</p>
      <code className="mt-4 block break-all rounded-lg bg-[#f0f4ef] p-3 text-[11px] text-[#245d42]">NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_token_here</code>
      <p className="mt-2 text-[10px] text-[#809183]">Save this in <strong>.env.local</strong> and restart the development server.</p>
      <a href="https://account.mapbox.com/access-tokens/" target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1 text-[11px] font-bold text-[#286849] hover:underline">Get a Mapbox access token <ExternalLink size={12}/></a>
    </div>}

    {toast && <div role="status" className="absolute bottom-[88px] right-4 z-30 flex max-w-[300px] items-start gap-3 rounded-xl bg-[#20523e] px-4 py-3 text-[11px] leading-relaxed text-white shadow-float md:right-6"><span>{toast}</span><button onClick={() => setToast(null)} aria-label="Dismiss message" className="mt-0.5 shrink-0 text-white/80 hover:text-white"><X size={15}/></button></div>}
  </main>;
}
