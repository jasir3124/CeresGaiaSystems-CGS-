import { isFieldManagement, type FieldManagement } from './agronomy';
import { CROPS, isPlantingDate, type CropHistory } from './crops';
import type { SavedField } from './field-store';
export type InputDraft = { management: Record<string, string>; soil: Record<string, string> };
export function initialInputDraft(field: SavedField): InputDraft {
  const record = field.cropHistory?.find(record => record.id === field.management?.currentCropId);
  const moisture = field.management?.soilMoisture;
  const localTime = moisture ? new Date(Date.parse(moisture.measuredAt) - new Date(moisture.measuredAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
  return { management: {
    currentCrop: record?.cropId ?? '', plantedOn: record?.plantedOn ?? '',
    growthStage: field.management?.growthStage ?? '', irrigation: field.management?.irrigation ?? 'unknown',
    moisture: moisture ? String(moisture.volumetricPercent) : '', measuredAt: localTime,
    moistureSource: moisture?.source ?? '', refill: moisture?.refillBelowPercent === undefined ? '' : String(moisture.refillBelowPercent)
  }, soil: {} };
}
export function prepareManagement(field: SavedField, draft: Record<string, string>, id: string, today = new Date().toISOString().slice(0, 10)): { management: FieldManagement; cropHistory: CropHistory } {
  const cropHistory = [...(field.cropHistory ?? [])];
  let currentCropId: string | null = null;
  if (draft.currentCrop) {
    const crop = CROPS.find(crop => crop.id === draft.currentCrop);
    if (!crop || !isPlantingDate(draft.plantedOn) || draft.plantedOn > today) throw new Error('Choose a crop and a valid planting date on or before today.');
    const current = cropHistory.find(record => record.id === field.management?.currentCropId && record.cropId === crop.id && record.plantedOn === draft.plantedOn);
    const matching = current ?? cropHistory.find(record => record.cropId === crop.id && record.plantedOn === draft.plantedOn);
    currentCropId = matching?.id ?? id;
    if (!matching) cropHistory.push({ id, cropId: crop.id, plantedOn: draft.plantedOn });
  }
  const management: FieldManagement = { currentCropId, irrigation: draft.irrigation as FieldManagement['irrigation'], ...(draft.growthStage ? { growthStage: draft.growthStage } : {}) };
  if (draft.moisture) {
    if (!draft.measuredAt || !Number.isFinite(Date.parse(draft.measuredAt))) throw new Error('Add the measurement time for your soil moisture reading.');
    management.soilMoisture = { volumetricPercent: Number(draft.moisture), measuredAt: new Date(draft.measuredAt).toISOString(), source: draft.moistureSource || '', ...(draft.refill ? { refillBelowPercent: Number(draft.refill) } : {}) };
  }
  if (!isFieldManagement(management)) throw new Error('Check your measurements, dates and measurement source before saving.');
  return { management, cropHistory };
}
