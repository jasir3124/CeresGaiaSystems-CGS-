'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Coordinates, OverviewData, WeatherData } from './types';

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
}

type Snapshot = { nasa?: OverviewData | null; weather?: WeatherData | null };
type FieldsContextType = {
  fields: SavedField[];
  activeFieldId: string | null;
  hydrated: boolean;
  setActiveFieldId: (id: string | null) => void;
  saveField: (value: Omit<SavedField, 'id' | 'savedAt' | 'updatedAt'>, existingId?: string | null) => SavedField | null;
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
      if (Array.isArray(parsed)) setFields(parsed.filter(isField).slice(0, 100));
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

/** Shared hook for Explore now and the future Crops page. */
export function useFields() {
  const context = useContext(FieldsContext);
  if (!context) throw new Error('useFields must be used inside FieldsProvider');
  return context;
}
