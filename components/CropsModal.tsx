'use client';

import { useEffect, useRef, useState } from 'react';
import { Sprout, X } from 'lucide-react';
import { CROPS, getCrop, growingMonths, isPlantingDate, type CropId } from '@/lib/crops';
import { useFields } from '@/lib/field-store';

type Draft = { cropId: CropId | ''; plantedOn: string };
const emptyDraft: Draft = { cropId: '', plantedOn: '' };
const formatDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const selectClass = 'mt-2 w-full rounded-xl border border-[#dbe6da] dark:border-[#364b40] bg-white dark:bg-[#18271f] px-3 py-2.5 text-sm text-[#2b5038] dark:text-[#e2ece5] outline-none focus:border-[#397c58] focus:ring-2 focus:ring-[#397c58]/20';

export default function CropsModal({ onClose }: { onClose: () => void }) {
  const { fields, activeFieldId, hydrated, saveFieldCrops } = useFields();
  const [selectedId, setSelectedId] = useState(activeFieldId ?? fields[0]?.id ?? '');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [messages, setMessages] = useState<Record<string, { text: string; error: boolean }>>({});
  const dialog = useRef<HTMLDialogElement>(null);
  const field = fields.find(item => item.id === selectedId) ?? fields[0];
  const draft = field ? drafts[field.id] ?? emptyDraft : emptyDraft;
  const crop = draft.cropId ? getCrop(draft.cropId) : null;
  const months = crop ? growingMonths(crop) : null;
  const message = field ? messages[field.id] : undefined;
  const canAdd = Boolean(draft.cropId && isPlantingDate(draft.plantedOn));

  useEffect(() => {
    const element = dialog.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    element?.showModal();
    return () => { element?.close(); previouslyFocused?.focus(); };
  }, []);

  return <dialog ref={dialog} aria-labelledby="crops-title" onCancel={event => { event.preventDefault(); onClose(); }} className="m-auto max-h-[90dvh] w-[calc(100%-24px)] max-w-3xl overflow-y-auto rounded-2xl bg-[#fbfcf9] dark:bg-[#1b2b23] p-0 text-[#2b5038] dark:text-[#e2ece5] shadow-2xl backdrop:bg-[#102e20]/45 backdrop:backdrop-blur-sm">
    <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[#e3ebe0] dark:border-[#364b40] bg-white dark:bg-[#18271f] p-5 sm:px-7">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#eaf3e5] dark:bg-[#263b2e] text-[#397c58] dark:text-[#9dd6b3]"><Sprout size={24}/></span>
        <div><h2 id="crops-title" className="text-xl font-bold">Crops</h2><p className="mt-0.5 text-xs text-[#71836f] dark:text-[#9dd6b3]">Your fields, season by season</p></div>
      </div>
      <button type="button" onClick={onClose} aria-label="Close crops" className="rounded-lg p-2 text-[#71836f] dark:text-[#9dd6b3] hover:bg-[#edf3e9] dark:hover:bg-[#263b2e]"><X size={20}/></button>
    </header>

    {!hydrated ? <p className="p-7 text-sm">Loading your fields...</p> : !field ? <div className="p-7">
      <h3 className="font-semibold">Save your first field to add crops</h3>
      <p className="mt-2 text-sm leading-relaxed text-[#71836f] dark:text-[#9dd6b3]">Select an area on the map, then choose Save field in the area overview. Come back here to record its crop history and planting dates.</p>
      <button onClick={onClose} className="mt-5 rounded-xl bg-[#286048] px-4 py-2.5 text-sm font-semibold text-white">Back to map</button>
    </div> : <div className="grid gap-6 p-5 sm:p-7 md:grid-cols-[190px_minmax(0,1fr)]">
      <aside className="min-w-0">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#71836f] dark:text-[#9dd6b3]">Your fields ({fields.length})</h3>
        <p className="mt-1 text-xs text-[#71836f] dark:text-[#9dd6b3]">Saved crops, newest first</p>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-2 md:max-h-[60dvh] md:flex-col md:overflow-y-auto">
          {fields.map(item => <button type="button" key={item.id} onClick={() => setSelectedId(item.id)} aria-pressed={item.id === field.id} className={`min-w-[160px] rounded-xl border p-3 text-left transition md:min-w-0 ${item.id === field.id ? 'border-[#91b28a] dark:border-[#578a69] bg-[#edf4e7] dark:bg-[#263b2e]' : 'border-[#e3ebe0] dark:border-[#364b40] bg-white dark:bg-[#18271f] hover:border-[#91b28a] dark:hover:border-[#578a69]'}`}>
            <strong className="block break-words text-sm">{item.name}</strong>
            <span className="mt-1 block text-[10px] text-[#71836f] dark:text-[#9dd6b3]">{item.point[1].toFixed(4)}, {item.point[0].toFixed(4)}</span>
            <span className="mt-2 block text-xs text-[#71836f] dark:text-[#9dd6b3]">{item.cropHistory?.length ?? 0} crops recorded</span>
          </button>)}
        </div>
      </aside>

      <section className="min-w-0">
        <label htmlFor="crop-field" className="text-xs font-semibold">Which field are you recording?</label>
        <select id="crop-field" value={field.id} onChange={event => setSelectedId(event.target.value)} className={selectClass}>
          {fields.map(item => <option key={item.id} value={item.id}>{item.name} ({item.point[1].toFixed(4)}, {item.point[0].toFixed(4)})</option>)}
        </select>
        <h3 className="mt-6 text-base font-bold">Add a crop</h3>
        <p className="mt-1 text-xs leading-relaxed text-[#71836f] dark:text-[#9dd6b3]">Record each planting to build this field's history for future crop planning. Repeated crops are allowed.</p>
        <form className="mt-4 space-y-3" onSubmit={event => {
          event.preventDefault();
          if (!canAdd || !draft.cropId) return;
          const saved = saveFieldCrops(field.id, [...(field.cropHistory ?? []), {
            id: crypto.randomUUID(), cropId: draft.cropId, plantedOn: draft.plantedOn
          }]);
          if (saved) setDrafts(current => ({ ...current, [field.id]: emptyDraft }));
          setMessages(current => ({ ...current, [field.id]: { error: !saved, text: saved ? `Crop added to ${field.name} on this device.` : 'Could not save crop history. Check that browser storage is available and try again.' } }));
        }}>
            <div className="rounded-xl border border-[#e3ebe0] dark:border-[#364b40] bg-white dark:bg-[#18271f] p-3 sm:p-4">
              <label htmlFor="crop-type" className="block text-xs font-semibold">Crop</label>
              <select id="crop-type" required value={draft.cropId} className={selectClass} onChange={event => {
                setDrafts(current => ({ ...current, [field.id]: { ...draft, cropId: event.target.value as CropId | '' } }));
                setMessages(current => { const next = { ...current }; delete next[field.id]; return next; });
              }}>
                <option value="">Select a crop</option>
                {CROPS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <label htmlFor="crop-planted-on" className="mt-4 block text-xs font-semibold">Planting date</label>
              <input id="crop-planted-on" type="date" required value={draft.plantedOn} className={selectClass} onChange={event => {
                setDrafts(current => ({ ...current, [field.id]: { ...draft, plantedOn: event.target.value } }));
                setMessages(current => { const next = { ...current }; delete next[field.id]; return next; });
              }}/>
              {crop && months && <details className="mt-2 text-xs text-[#71836f] dark:text-[#9dd6b3]">
                <summary className="cursor-pointer py-1">Growing conditions</summary>
                <dl className="mt-2 grid grid-cols-2 gap-3 text-[11px]">
                  <div><dt>Optimum temperature</dt><dd className="mt-0.5 font-semibold text-[#2b5038] dark:text-[#e2ece5]">{crop.optimumTemperatureC.min}–{crop.optimumTemperatureC.max} °C</dd></div>
                  <div><dt>Optimum annual rainfall</dt><dd className="mt-0.5 font-semibold text-[#2b5038] dark:text-[#e2ece5]">{crop.optimumAnnualRainfallMm.min}–{crop.optimumAnnualRainfallMm.max} mm/year</dd></div>
                  <div><dt>Growing duration</dt><dd className="mt-0.5 font-semibold text-[#2b5038] dark:text-[#e2ece5]">≈ {months.min}–{months.max} months</dd></div>
                  <div><dt>Optimum soil pH</dt><dd className="mt-0.5 font-semibold text-[#2b5038] dark:text-[#e2ece5]">{crop.optimumSoilPh.min}–{crop.optimumSoilPh.max}</dd></div>
                </dl>
                <p className="mt-3 leading-relaxed">General ranges vary by variety and location. Rainfall is an annual climate range; growing duration is not a planting calendar.</p>
                <a href={crop.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-semibold text-[#397c58] dark:text-[#9dd6b3] underline">FAO EcoCrop reference</a>
              </details>}
            </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <span className="text-xs text-[#71836f] dark:text-[#9dd6b3]">{draft.cropId || draft.plantedOn ? 'Unsaved crop for this field' : 'Saved on this device'}</span>
            <button type="submit" disabled={!canAdd} className="rounded-xl bg-[#286048] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1c4e38] disabled:cursor-not-allowed disabled:opacity-40">Add crop</button>
          </div>
          {message && <p role={message.error ? 'alert' : 'status'} className={`rounded-lg p-3 text-xs ${message.error ? 'bg-red-50 dark:bg-[#342722] text-red-700 dark:text-red-300' : 'bg-[#edf4e7] dark:bg-[#263b2e] text-[#286048] dark:text-[#e2ece5]'}`}>{message.text}</p>}
        </form>
        <h3 className="mt-7 text-base font-bold">Crop history ({field.cropHistory?.length ?? 0})</h3>
        <p className="mt-1 text-xs text-[#71836f] dark:text-[#9dd6b3]">All recorded crops, newest planting first. Crops without dates appear last.</p>
        {!field.cropHistory?.length ? <p className="mt-4 rounded-xl border border-[#e3ebe0] dark:border-[#364b40] bg-white dark:bg-[#18271f] p-4 text-sm text-[#71836f] dark:text-[#9dd6b3]">No crops recorded for this field yet.</p> :
          <ol className="mt-4 space-y-3">{field.cropHistory.map(record => <li key={record.id} className="rounded-xl border border-[#e3ebe0] dark:border-[#364b40] bg-white dark:bg-[#18271f] p-4">
            <strong className="text-sm">{getCrop(record.cropId).name}</strong>
            <p className="mt-1 text-xs text-[#71836f] dark:text-[#9dd6b3]">{record.plantedOn ? `Planted ${formatDate(record.plantedOn)}` : 'Planting date not recorded'}</p>
            <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={event => {
              event.preventDefault();
              const plantedOn = new FormData(event.currentTarget).get('plantedOn');
              if (!isPlantingDate(plantedOn)) return;
              const saved = saveFieldCrops(field.id, (field.cropHistory ?? []).map(item => item.id === record.id ? { ...item, plantedOn } : item));
              setMessages(current => ({ ...current, [field.id]: { error: !saved, text: saved ? 'Planting date saved on this device.' : 'Could not save planting date. Please try again.' } }));
            }}>
              <label className="text-xs font-semibold">{record.plantedOn ? 'Update planting date' : 'Add planting date'}
                <input key={record.plantedOn ?? 'unknown'} name="plantedOn" type="date" required defaultValue={record.plantedOn ?? ''} className={selectClass}/>
              </label>
              <button type="submit" className="rounded-xl border border-[#dbe6da] dark:border-[#364b40] px-3 py-2.5 text-xs font-semibold hover:bg-[#edf4e7] dark:hover:bg-[#263b2e]">Save date</button>
            </form>
          </li>)}</ol>}
      </section>
    </div>}
  </dialog>;
}
