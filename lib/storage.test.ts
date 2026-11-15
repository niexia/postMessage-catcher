import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './protocol';
import { mapToRecording, normalizeSettings, recordingToMap } from './storage';

describe('normalizeSettings', () => {
  it('falls back to defaults for junk', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('nope')).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values', () => {
    expect(
      normalizeSettings({ enabled: false, mirrorToConsole: true, maxEntriesPerTab: 500 }),
    ).toEqual({
      enabled: false,
      mirrorToConsole: true,
      maxEntriesPerTab: 500,
    });
  });

  it('clamps the buffer size', () => {
    expect(normalizeSettings({ maxEntriesPerTab: 1 }).maxEntriesPerTab).toBe(100);
    expect(normalizeSettings({ maxEntriesPerTab: 10_000_000 }).maxEntriesPerTab).toBe(20_000);
    expect(normalizeSettings({ maxEntriesPerTab: Number.NaN }).maxEntriesPerTab).toBe(
      DEFAULT_SETTINGS.maxEntriesPerTab,
    );
  });

  it('ignores wrong types', () => {
    expect(normalizeSettings({ enabled: 'yes', mirrorToConsole: 1 }).enabled).toBe(true);
  });
});

describe('recording maps', () => {
  it('round-trips tab ids', () => {
    const map = new Map<number, boolean>([
      [12, true],
      [34, false],
    ]);
    expect(mapToRecording(recordingToMap(map))).toEqual(map);
  });

  it('skips invalid keys', () => {
    expect(mapToRecording({ abc: true, '7': false })).toEqual(new Map([[7, false]]));
    expect(mapToRecording(undefined)).toEqual(new Map());
  });
});
