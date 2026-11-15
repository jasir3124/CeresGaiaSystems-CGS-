'use client';
import { useEffect, useRef, useState } from 'react';
import { Download, WifiOff, X } from 'lucide-react';
import { useOnline } from '@/lib/use-online';
interface InstallPrompt extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
const DISMISS_KEY = 'cgs.offline-map-message.dismissed';
export default function PwaControls() {
  const online = useOnline();
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState(false);
  const [never, setNever] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const noticeRef = useRef<HTMLElement>(null);
  useEffect(() => {
    // Register only production builds so cached assets do not interfere with development.
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    let active = true;
    const register = async () => {
      try {
        await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
        await navigator.serviceWorker.ready;
        if (active) setReady(true);
      } catch (error) { console.warn('Offline setup could not finish', error); }
    };
    void register();
    return () => { active = false; };
  }, []);
  useEffect(() => {
    // Keep the install event until the user chooses the app's Install button.
    const available = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const installed = () => setPrompt(null);
    window.addEventListener('beforeinstallprompt', available);
    window.addEventListener('appinstalled', installed);
    return () => { window.removeEventListener('beforeinstallprompt', available); window.removeEventListener('appinstalled', installed); };
  }, []);
  useEffect(() => {
    if (online) { setNotice(false); return; }
    let dismissed = false;
    try { dismissed = localStorage.getItem(DISMISS_KEY) === 'true'; } catch {}
    setNotice(!dismissed);
  }, [online]);
  useEffect(() => { if (notice) noticeRef.current?.focus({ preventScroll: true }); }, [notice]);
  async function install() {
    if (!prompt) return;
    setInstalling(true); setInstallError(null);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') {
        try { await navigator.storage?.persist?.(); } catch {}
      }
      setPrompt(null);
    } catch { setInstallError('Installation did not finish. Try again from your browser menu.'); }
    finally { setInstalling(false); }
  }
  // Remember the optional dismissal on this device; saved offline data is unaffected.
  function dismiss() {
    if (never) { try { localStorage.setItem(DISMISS_KEY, 'true'); } catch {} }
    setNotice(false);
  }
  return <>
    {online && prompt && <div className="absolute bottom-5 right-4 z-30 max-w-[230px] rounded-xl border border-[#dbe6da] bg-white p-3 text-xs shadow-float dark:border-[#364b40] dark:bg-[#18271f]">
      <button onClick={() => void install()} disabled={!ready || installing} className="flex items-center gap-2 font-semibold disabled:opacity-50"><Download size={16}/>{!ready ? 'Preparing offline access…' : installing ? 'Installing…' : 'Install CGS app'}</button>
      {installError && <p role="alert" className="mt-2">{installError}</p>}
    </div>}
    {notice && <section ref={noticeRef} tabIndex={-1} role="dialog" aria-labelledby="offline-notice-title" aria-describedby="offline-notice-description" className="absolute bottom-4 left-[calc(var(--sidebar-width)+12px)] right-3 z-[60] rounded-2xl border border-[#dbe6da] bg-white p-5 text-[#293d32] shadow-2xl outline-none dark:border-[#364b40] dark:bg-[#18271f] dark:text-[#e2ece5] sm:left-auto sm:right-5 sm:w-[390px]">
      <div className="flex items-start justify-between gap-3"><h2 id="offline-notice-title" className="flex items-center gap-2 font-bold"><WifiOff size={19}/>You can keep using CGS offline</h2><button onClick={dismiss} aria-label="Close offline message" className="rounded p-1"><X size={17}/></button></div>
      <p id="offline-notice-description" className="mt-3 text-sm leading-relaxed">The map needs an internet connection. Your saved fields, crop records, soil tests and previously loaded data are still available. Reconnect for maps, fresh data and AI chat.</p>
      <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={never} onChange={event => setNever(event.target.checked)} className="h-4 w-4 accent-[#286649]"/>Never show again</label>
      <button onClick={dismiss} className="mt-4 w-full rounded-xl bg-[#286649] px-4 py-2.5 text-sm font-semibold text-white">Continue offline</button>
    </section>}
  </>;
}
