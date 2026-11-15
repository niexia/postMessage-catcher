import { STORAGE_KEYS } from './protocol';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

/** Synchronous mirror so the popup can paint the right theme before React runs. */
export const THEME_MIRROR_KEY = STORAGE_KEYS.theme;

export function normalizeTheme(value: unknown): ThemeMode {
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function resolveTheme(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (mode === 'system') return prefersDark ? 'dark' : 'light';
  return mode;
}

/** Cycle order: the default follows the OS, then the two explicit choices. */
export function nextTheme(mode: ThemeMode): ThemeMode {
  if (mode === 'system') return 'light';
  if (mode === 'light') return 'dark';
  return 'system';
}

export function themeLabel(mode: ThemeMode): string {
  if (mode === 'light') return 'Light';
  if (mode === 'dark') return 'Dark';
  return 'System';
}

export function prefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** The slice of `Document` that theming needs, so this is unit-testable. */
export interface ThemeDocument {
  documentElement: {
    classList: { toggle(token: string, force?: boolean): boolean };
    dataset: Record<string, string | undefined>;
  };
}

/**
 * `data-theme` always records the chosen *mode*; CSS resolves `system` with a
 * `prefers-color-scheme` media query, so the default needs no JavaScript.
 */
export function applyTheme(
  mode: ThemeMode,
  doc: ThemeDocument,
  prefers = prefersDark(),
): ResolvedTheme {
  const resolved = resolveTheme(mode, prefers);
  doc.documentElement.classList.toggle('dark', resolved === 'dark');
  doc.documentElement.dataset.theme = mode;
  return resolved;
}

export function readMirroredTheme(): ThemeMode {
  try {
    return normalizeTheme(localStorage.getItem(THEME_MIRROR_KEY));
  } catch {
    return 'system';
  }
}

export function mirrorTheme(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_MIRROR_KEY, mode);
  } catch {
    // Private mode or a blocked storage partition: the OS preference still works.
  }
}

export function applyStoredTheme(doc: ThemeDocument = document): ResolvedTheme {
  return applyTheme(readMirroredTheme(), doc);
}
