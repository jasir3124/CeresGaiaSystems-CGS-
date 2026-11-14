'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { isFieldManagement, isSoilTest, type FieldManagement, type SoilTest } from './agronomy';
import type { Coordinates, OverviewData, WeatherData } from './types';
import { isCropHistory, normalizeCropHistory, sortCropHistory, type CropHistory } from './crops';

export interface SavedField {
  id: string;
  name: string;
  point: Coordinates;
  radius: number;
  placeLabel: string | null;
  nasa: OverviewData | null;
  weather: WeatherData | null;
  savedAt: string;
  updatedAt: string;
  cropHistory?: CropHistory;
  soilTests?: SoilTest[];
  management?: FieldManagement;
}

type Snapshot = { nasa?: OverviewData | null; weather?: WeatherData | null };
type FieldsContextType = {
  fields: SavedField[];
  activeFieldId: string | null;
  hydrated: boolean;
  setActiveFieldId: (id: string | null) => void;
  saveField: (value: Omit<SavedField, 'id' | 'savedAt' | 'updatedAt' | 'cropHistory' | 'soilTests' | 'management'>, existingId?: string | null) => SavedField | null;
  saveFieldCrops: (id: string, crops: CropHistory) => boolean;
  saveFieldAgronomy: (id: string, soilTests: SoilTest[], management: FieldManagement) => boolean;
  updateFieldSnapshot: (id: string, snapshot: Snapshot) => void;
  deleteField: (id: string) => void;
};

const STORAGE_KEY = 'fieldshift.fields.v1';
const ACTIVE_KEY = 'fieldshift.active-field.v1';
const FieldsContext = createContext<FieldsContextType | null>(null);

function isField(value: unknown): value is SavedField {
  if (!value || typeof value !== 'object') return false;
  const field = value as Partial<SavedField>;
  return typeof field.id === 'string' && typeof field.name === 'string' &&
    Array.isArray(field.point) && field.point.length === 2 &&
    field.point.every(v => typeof v === 'number' && Number.isFinite(v)) &&
    typeof field.radius === 'number' && field.radius >= 25 && field.radius <= 5000;
}

export function FieldsProvider({ children }: { children: React.ReactNode }) {
  const [fields, setFields] = useState<SavedField[]>([]);
  const [activeFieldId, setActiveFieldIdState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (Array.isArray(parsed)) setFields(parsed.filter(isField).slice(0, 100).map(field => ({
        ...field, cropHistory: normalizeCropHistory(field.cropHistory),
        soilTests: Array.isArray(field.soilTests) ? field.soilTests.filter(isSoilTest) : [],
        management: isFieldManagement(field.management) ? field.management : undefined
      })));
      setActiveFieldIdState(localStorage.getItem(ACTIVE_KEY));
    } catch (error) { console.warn('Could not read saved fields', error); }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fields));
    } catch (error) { console.warn('Could not persist fields', error); }
  }, [fields, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (activeFieldId) localStorage.setItem(ACTIVE_KEY, activeFieldId);
      else localStorage.removeItem(ACTIVE_KEY);
    } catch (error) { console.warn('Could not persist active field', error); }
  }, [activeFieldId, hydrated]);

  const value = useMemo<FieldsContextType>(() => ({
    fields, activeFieldId, hydrated,
    setActiveFieldId: setActiveFieldIdState,
    saveField: (field, existingId) => {
      if (!hydrated) return null;
      const now = new Date().toISOString();
      const existing = fields.find(f => f.id === existingId);
      const result: SavedField = {
        ...field,
        cropHistory: existing?.cropHistory,
        soilTests: existing?.soilTests,
        management: existing?.management,
        id: existing?.id || (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `field-${Date.now()}-${Math.random().toString(36).slice(2)}`),
        savedAt: existing?.savedAt ?? now,
        updatedAt: now
      };
      const next = existing ? fields.map(f => f.id === existing.id ? result : f) : [result, ...fields];
      // Commit synchronously so Save never reports success while storage is unavailable.
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        localStorage.setItem(ACTIVE_KEY, result.id);
      } catch (error) {
        console.warn('Could not save field to browser storage', error);
        return null;
      }
      setFields(next);
      setActiveFieldIdState(result.id);
      return result;
    },
    saveFieldCrops: (id, crops) => {
      if (!hydrated || !isCropHistory(crops) || !fields.some(field => field.id === id)) return false;
      const existing = fields.find(field => field.id === id)!;
      // Only migrated records may retain an unknown date; every new planting needs one.
      if (crops.some(crop => crop.plantedOn === null && !existing.cropHistory?.some(previous =>
        previous.id === crop.id && previous.cropId === crop.cropId && previous.plantedOn === null))) return false;
      const next = fields.map(field => field.id === id ? {
        ...field, cropHistory: sortCropHistory(crops.map(crop => ({ ...crop }))), updatedAt: new Date().toISOString()
      } : field);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (error) {
        console.warn('Could not save crop history', error);
        return false;
      }
      setFields(next);
      return true;
    },
    saveFieldAgronomy: (id, soilTests, management) => {
      const existing = fields.find(field => field.id === id);
      if (!hydrated || !existing || !Array.isArray(soilTests) || !soilTests.every(isSoilTest) || !isFieldManagement(management) ||
        (management.currentCropId !== null && !existing.cropHistory?.some(record => record.id === management.currentCropId && record.plantedOn && record.plantedOn <= new Date().toISOString().slice(0, 10)))) return false;
      const next = fields.map(field => field.id === id ? { ...field, soilTests, management, updatedAt: new Date().toISOString() } : field);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
      catch { return false; }
      setFields(next);
      return true;
    },
    updateFieldSnapshot: (id, snapshot) => {
      setFields(current => current.map(f => f.id === id ? {
        ...f,
        ...(snapshot.nasa !== undefined ? { nasa: snapshot.nasa } : {}),
        ...(snapshot.weather !== undefined ? { weather: snapshot.weather } : {}),
        updatedAt: new Date().toISOString()
      } : f));
    },
    deleteField: id => {
      setFields(current => current.filter(f => f.id !== id));
      setActiveFieldIdState(current => current === id ? null : current);
    }
  }), [fields, activeFieldId, hydrated]);

  return <FieldsContext.Provider value={value}>{children}</FieldsContext.Provider>;
}

/** Shared saved fields and crop histories for Explore and Crops. */
export function useFields() {
  const context = useContext(FieldsContext);
  if (!context) throw new Error('useFields must be used inside FieldsProvider');
  return context;
}
