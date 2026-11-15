'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    // A saved choice overrides system appearance and stays in sync across browser tabs.
    const sync = () => {
      let preference: string | null = null;
      try { preference = localStorage.getItem('cgs-theme'); } catch {}
      const next = preference === 'dark' || (preference !== 'light' && media.matches);
      document.documentElement.classList.toggle('dark', next);
      setDark(next);
    };
    sync();
    media.addEventListener('change', sync);
    window.addEventListener('storage', sync);
    return () => {
      media.removeEventListener('change', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    setDark(next);
    try { localStorage.setItem('cgs-theme', next ? 'dark' : 'light'); } catch {}
  }

  return <button type="button" onClick={toggle} aria-label="Dark mode" aria-pressed={dark}
    title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    className="flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-xl text-[#627666] hover:bg-[#f2f7f1] dark:text-[#afc2b5] dark:hover:bg-[#263b2e]">
    {dark ? <Sun size={21}/> : <Moon size={21}/>}
    <span className="text-[11px]">{dark ? 'Light mode' : 'Dark mode'}</span>
  </button>;
}
