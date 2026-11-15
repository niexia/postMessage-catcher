import { describe, expect, it } from 'vitest';
import {
  applyStoredTheme,
  applyTheme,
  mirrorTheme,
  nextTheme,
  normalizeTheme,
  readMirroredTheme,
  resolveTheme,
  themeLabel,
  type ThemeDocument,
} from './theme';

function fakeDocument() {
  const classes = new Set<string>();
  const dataset: Record<string, string | undefined> = {};
  const doc: ThemeDocument = {
    documentElement: {
      classList: {
        toggle(token: string, force?: boolean) {
          const on = force ?? !classes.has(token);
          if (on) classes.add(token);
          else classes.delete(token);
          return on;
        },
      },
      dataset,
    },
  };
  return { doc, classes, dataset };
}

describe('normalizeTheme', () => {
  it('accepts the three modes and falls back to system', () => {
    expect(normalizeTheme('light')).toBe('light');
    expect(normalizeTheme('dark')).toBe('dark');
    expect(normalizeTheme('system')).toBe('system');
    expect(normalizeTheme('DARK')).toBe('system');
    expect(normalizeTheme(undefined)).toBe('system');
    expect(normalizeTheme(null)).toBe('system');
  });
});

describe('resolveTheme', () => {
  it('follows the OS only in system mode', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });
});

describe('nextTheme', () => {
  it('cycles system → light → dark → system', () => {
    expect(nextTheme('system')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('system');
  });
});

describe('themeLabel', () => {
  it('is human readable', () => {
    expect(themeLabel('system')).toBe('System');
    expect(themeLabel('light')).toBe('Light');
    expect(themeLabel('dark')).toBe('Dark');
  });
});

describe('applyTheme', () => {
  it('records the chosen mode and toggles the dark class', () => {
    const { doc, classes, dataset } = fakeDocument();

    expect(applyTheme('dark', doc, false)).toBe('dark');
    expect(dataset.theme).toBe('dark');
    expect(classes.has('dark')).toBe(true);

    expect(applyTheme('light', doc, true)).toBe('light');
    expect(dataset.theme).toBe('light');
    expect(classes.has('dark')).toBe(false);

    expect(applyTheme('system', doc, true)).toBe('dark');
    expect(dataset.theme).toBe('system');
    expect(classes.has('dark')).toBe(true);
  });
});

describe('mirror', () => {
  it('degrades to system without localStorage', () => {
    // Node has no localStorage; both helpers must stay quiet.
    expect(readMirroredTheme()).toBe('system');
    expect(() => mirrorTheme('dark')).not.toThrow();
  });

  it('applies the mirrored theme without touching storage', () => {
    const { doc, dataset } = fakeDocument();
    expect(applyStoredTheme(doc)).toBe('light');
    expect(dataset.theme).toBe('system');
  });
});
