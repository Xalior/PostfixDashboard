'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * Theme provider driving Bootstrap 5's `data-bs-theme` attribute.
 *
 * Modes:
 *  - 'light'  → force light theme
 *  - 'dark'   → force dark theme
 *  - 'system' → follow the OS `prefers-color-scheme` media query
 *
 * The user's preference is persisted in localStorage. We also respect the
 * initial attribute set by the inline script in <head>, so there's no flash
 * of the wrong theme on first paint.
 */

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  setMode: (m: ThemeMode) => void;
  cycle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'pfd-theme';

function readStoredMode(fallback: ThemeMode): ThemeMode {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  return fallback;
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(mode: ThemeMode): 'light' | 'dark' {
  const resolved = mode === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : mode;
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-bs-theme', resolved);
    document.documentElement.dataset.pfdThemeMode = mode;
  }
  return resolved;
}

interface ThemeProviderProps {
  defaultMode: ThemeMode;
  children: ReactNode;
}

export function ThemeProvider({ defaultMode, children }: ThemeProviderProps) {
  const [mode, setModeState] = useState<ThemeMode>(defaultMode);
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  // Hydration: read the stored choice (or fall back to env default) and
  // apply it synchronously on mount.
  useEffect(() => {
    const stored = readStoredMode(defaultMode);
    setModeState(stored);
    setResolved(applyTheme(stored));
  }, [defaultMode]);

  // Watch for OS changes while in 'system' mode.
  useEffect(() => {
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => setResolved(applyTheme('system'));
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mode]);

  const setMode = useCallback((m: ThemeMode) => {
    window.localStorage.setItem(STORAGE_KEY, m);
    setModeState(m);
    setResolved(applyTheme(m));
  }, []);

  const cycle = useCallback(() => {
    const next: ThemeMode = mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light';
    setMode(next);
  }, [mode, setMode]);

  const value = useMemo(
    () => ({ mode, resolved, setMode, cycle }),
    [mode, resolved, setMode, cycle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}

/**
 * Inline script to apply the stored theme BEFORE React hydrates, preventing
 * a flash of the wrong theme. Placed in <head> by the root layout.
 */
export function ThemeBootstrapScript({ defaultMode }: { defaultMode: ThemeMode }) {
  const code = `
    (function () {
      try {
        var stored = localStorage.getItem('${STORAGE_KEY}');
        var mode = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : '${defaultMode}';
        var resolved = mode === 'system'
          ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
          : mode;
        document.documentElement.setAttribute('data-bs-theme', resolved);
        document.documentElement.dataset.pfdThemeMode = mode;
      } catch (_) {
        document.documentElement.setAttribute('data-bs-theme', 'light');
      }
    })();
  `;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
