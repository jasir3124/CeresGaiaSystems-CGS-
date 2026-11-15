'use client';
import { useSyncExternalStore } from 'react';
function subscribe(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => { window.removeEventListener('online', callback); window.removeEventListener('offline', callback); };
}
// Keep SSR consistent, then subscribe to browser connectivity changes after hydration.
export function useOnline() {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}
