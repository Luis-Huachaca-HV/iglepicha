// Tema claro/oscuro: la clase .dark en <html> activa las variantes dark: de Tailwind. Por defecto sigue al sistema.
import { useEffect, useState } from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';

const THEME_KEY = 'gestion-de-pichangas-9e3639:theme';

function systemDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function readTheme(): ThemeChoice {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(choice: ThemeChoice = readTheme()): void {
  const dark = choice === 'dark' || (choice === 'system' && systemDark());
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

export function useTheme(): { theme: ThemeChoice; isDark: boolean; setTheme: (next: ThemeChoice) => void; toggle: () => void } {
  const [theme, setThemeState] = useState<ThemeChoice>(readTheme);
  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);
  const setTheme = (next: ThemeChoice) => {
    try {
      if (next === 'system') window.localStorage.removeItem(THEME_KEY);
      else window.localStorage.setItem(THEME_KEY, next);
    } catch {
      /* storage unavailable */
    }
    setThemeState(next);
  };
  const isDark = theme === 'dark' || (theme === 'system' && systemDark());
  return { theme, isDark, setTheme, toggle: () => setTheme(isDark ? 'light' : 'dark') };
}
