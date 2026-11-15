'use client';
import { useState, type ChangeEvent } from 'react';
import { FlaskConical } from 'lucide-react';
import { useFields, type SavedField } from '@/lib/field-store';
import { NUTRIENTS, isSoilTest, type SoilTest } from '@/lib/agronomy';
import { CROPS } from '@/lib/crops';
import { prepareManagement, type InputDraft } from '@/lib/agronomy-draft';
const control = 'mt-1 block w-full rounded-lg border border-[#dbe6da] dark:border-[#364b40] bg-white dark:bg-[#18271f] px-3 py-2 text-sm text-[#2b5038] dark:text-[#e2ece5] outline-none focus:border-[#397c58]';
const button = 'rounded-xl bg-[#286048] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1c4e38] disabled:opacity-40';

export default function FieldInputs({ field, draft, onDraft }: { field: SavedField; draft: InputDraft; onDraft: (draft: InputDraft) => void }) {
  const { saveFieldAgronomy } = useFields();
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  // Controlled drafts live in the parent so Refresh and field switches do not erase edits.
  const bind = (group: keyof InputDraft, name: string, fallback = '') => ({ name, value: draft[group][name] ?? fallback, onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onDraft({ ...draft, [group]: { ...draft[group], [name]: event.target.value } }) });
  const today = new Date().toISOString().slice(0, 10);
  function feedback(saved: boolean) { setMessage({ error: !saved, text: saved ? 'Field details saved. Suggestions update automatically; no Refresh needed.' : 'Could not save. Check all measurements, dates, and browser storage.' }); }
  return <details className="my-6 rounded-xl border border-[#dbe6da] dark:border-[#364b40] bg-white dark:bg-[#18271f] p-4 sm:my-8 sm:p-5">
    <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold"><FlaskConical size={17}/> Field details: current crop, irrigation and soil tests (optional)</summary>
    <p className="mt-3 text-sm text-[#657260] dark:text-[#9dd6b3]">These details are optional. You can get crop suggestions without filling this in. Add recent soil tests to refine crop suitability, or current-crop and moisture details for care advice. Leave unknown values blank and only enter actual measurements from your field or lab report.</p>
    {message && <p role={message.error ? 'alert' : 'status'} className={`mt-3 rounded-lg p-3 text-sm ${message.error ? 'bg-red-50 dark:bg-[#342722] text-red-700 dark:text-red-300' : 'bg-[#edf4e7] dark:bg-[#263b2e] text-[#286048] dark:text-[#e2ece5]'}`}>{message.text}</p>}
    <p className="mt-3 rounded-lg bg-[#edf4e7] p-3 text-xs leading-relaxed dark:bg-[#263b2e]">Save field details or Save soil test to update suggestions automatically. Refresh reloads data using your saved details and keeps unfinished entries here. Unfinished entries are not used until saved.</p>
    <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={event => {
      event.preventDefault();
      try {
        const { management, cropHistory } = prepareManagement(field, draft.management, crypto.randomUUID());
        feedback(saveFieldAgronomy(field.id, field.soilTests ?? [], management, cropHistory));
      } catch (error) { setMessage({ error: true, text: error instanceof Error ? error.message : 'Could not save field details.' }); }
    }}>
      <label className="text-sm font-semibold">Currently growing crop<select {...bind('management', 'currentCrop')} className={control}><option value="">No current crop / not confirmed</option>{CROPS.map(crop => <option key={crop.id} value={crop.id}>{crop.name}</option>)}</select></label>
      <label className="text-sm font-semibold">Planting date<input {...bind('management', 'plantedOn')} type="date" max={today} required={Boolean(draft.management.currentCrop)} className={control}/><span className="mt-1 block text-xs font-normal opacity-75">Required only for a current crop. Saving also records this planting in Crops.</span></label>
      <label className="text-sm font-semibold">Growth stage (observed)<select {...bind('management', 'growthStage')} className={control}><option value="">Unknown</option>{['initial', 'development', 'mid-season', 'late-season'].map(stage => <option key={stage}>{stage}</option>)}</select></label>
      <label className="text-sm font-semibold">Water supply<select {...bind('management', 'irrigation')} className={control}><option value="unknown">Unknown</option><option value="rainfed">Rainfed</option><option value="irrigated">Irrigation available</option></select></label>
      <label className="text-sm font-semibold">Measured root-zone water content (%)<input {...bind('management', 'moisture')} type="number" min="0" max="100" step="0.1" className={control}/></label>
      <label className="text-sm font-semibold">Moisture measurement time (local)<input {...bind('management', 'measuredAt')} type="datetime-local" className={control}/></label>
      <label className="text-sm font-semibold">Sensor / measurement source<input {...bind('management', 'moistureSource')} maxLength={200} className={control}/></label>
      <label className="text-sm font-semibold">Your field-specific refill threshold (%)<input {...bind('management', 'refill')} type="number" min="0" max="100" step="0.1" className={control}/></label>
      <div className="flex items-end"><button type="submit" className={button}>Save field details</button></div>
    </form>
    <h4 className="mt-6 text-sm font-bold">Add a soil-test record (optional)</h4>
    <p className="mt-1 text-xs text-[#657260] dark:text-[#9dd6b3]">Sample date, source, method and depth are needed only when saving a soil test. Add whichever measurements you have.</p>
    <form className="mt-3" onSubmit={event => {
      event.preventDefault(); const form = new FormData(event.currentTarget);
      const test: SoilTest = { id: crypto.randomUUID(), sampledOn: String(form.get('sampledOn')), source: String(form.get('source')), method: String(form.get('method')), depthCm: Number(form.get('depthCm')), nutrients: {} };
      for (const key of ['ph', 'organicMatterPercent', 'salinityEce'] as const) if (form.get(key) !== '') test[key] = Number(form.get(key));
      for (const key of NUTRIENTS) if (form.get(key) !== '') test.nutrients[key] = { value: Number(form.get(key)), unit: 'mg/kg', interpretation: String(form.get(`${key}-rating`)) as 'unknown' };
      // Saving one soil test must preserve the field's current crop and management settings.
      const saved = isSoilTest(test) && saveFieldAgronomy(field.id, [test, ...(field.soilTests ?? [])], field.management ?? { currentCropId: null, irrigation: 'unknown' });
      feedback(saved); if (saved) onDraft({ ...draft, soil: {} });
    }}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <label className="text-sm font-semibold">Sample date<input {...bind('soil', 'sampledOn')} type="date" required max={today} className={control}/></label>
        <label className="text-sm font-semibold">Lab / source<input {...bind('soil', 'source')} required maxLength={200} className={control}/></label>
        <label className="text-sm font-semibold">Test method(s)<input {...bind('soil', 'method')} required maxLength={200} placeholder="e.g. Olsen P, exchangeable K, water pH" className={control}/></label>
        <label className="text-sm font-semibold">Sampling depth (cm)<input {...bind('soil', 'depthCm')} required type="number" min="1" max="200" step="0.1" className={control}/></label>
        <label className="text-sm font-semibold">Soil pH<input {...bind('soil', 'ph')} type="number" min="0" max="14" step="0.01" className={control}/></label>
        <label className="text-sm font-semibold">Organic matter (%)<input {...bind('soil', 'organicMatterPercent')} type="number" min="0" max="100" step="0.01" className={control}/></label>
        <label className="text-sm font-semibold">Salinity: saturated-paste ECe (dS/m)<input {...bind('soil', 'salinityEce')} type="number" min="0" max="100" step="0.01" className={control}/></label>
      </div>
      <p className="mb-2 mt-4 text-xs text-[#657260] dark:text-[#9dd6b3]">Enter nutrient values in mg/kg (ppm). Copy the lab's interpretation for this field; extraction methods and crop calibration matter. Do not convert P₂O₅/K₂O fertilizer rates into soil concentrations. Other EC extraction methods are not interchangeable with ECe.</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{NUTRIENTS.map(key => <div key={key} className="rounded-lg bg-[#f7faf4] dark:bg-[#1b2b23] p-2"><label className="text-sm font-semibold capitalize" htmlFor={`soil-${key}`}>{key} (mg/kg)</label><input id={`soil-${key}`} {...bind('soil', key)} type="number" min="0" step="0.01" className={control}/><label className="sr-only" htmlFor={`soil-${key}-rating`}>{key} laboratory interpretation</label><select id={`soil-${key}-rating`} {...bind('soil', `${key}-rating`, 'unknown')} className={control}><option value="unknown">Lab interpretation unknown</option><option value="low">Lab: low</option><option value="sufficient">Lab: sufficient</option><option value="high">Lab: high</option></select></div>)}</div>
      <button type="submit" className={`${button} mt-4`}>Save soil test</button>
    </form>
    {!!field.soilTests?.length && <details className="mt-5 text-sm"><summary className="cursor-pointer font-semibold">Saved soil tests ({field.soilTests.length})</summary><ul className="mt-2 space-y-3">{field.soilTests.map(test => <li key={test.id} className="rounded-lg border border-[#e3ebe0] dark:border-[#364b40] p-3"><strong>{test.sampledOn} · {test.source}</strong><p className="mt-1">Method: {test.method} · Depth: {test.depthCm} cm</p><p className="mt-1">pH {test.ph ?? 'unknown'} · Organic matter {test.organicMatterPercent ?? 'unknown'}% · ECe {test.salinityEce ?? 'unknown'} dS/m</p><ul className="mt-1">{Object.entries(test.nutrients).map(([key, n]) => <li key={key}>{key}: {n.value} {n.unit} · {n.interpretation}</li>)}</ul></li>)}</ul></details>}
  </details>;
}
