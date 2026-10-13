'use client';
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'morning' | 'evening';

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>('morning');

  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    setTheme(t === 'evening' ? 'evening' : 'morning');
  }, []);

  function toggle() {
    const next: Theme = theme === 'morning' ? 'evening' : 'morning';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('ieg-theme', next); } catch { /* abaikan */ }
    setTheme(next);
  }

  const label = theme === 'morning' ? 'Ganti ke tema Evening (gelap)' : 'Ganti ke tema Morning (terang)';
  return (
    <button type="button" onClick={toggle} className={`btn btn-ghost ${compact ? 'btn-icon' : ''}`} aria-label={label} title={label}>
      {theme === 'morning' ? <Moon /> : <Sun />}
      {!compact && <span>{theme === 'morning' ? 'Evening' : 'Morning'}</span>}
    </button>
  );
}
