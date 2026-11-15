import { DEFAULT_SETTINGS, type RecordingMap, type Settings } from './protocol';

const MIN_ENTRIES = 100;
const MAX_ENTRIES = 20_000;

/** Coerce whatever is in storage into a valid Settings object. */
export function normalizeSettings(raw: unknown): Settings {
  const settings: Settings = { ...DEFAULT_SETTINGS };
  if (typeof raw !== 'object' || raw === null) return settings;
  const record = raw as Record<string, unknown>;
  if (typeof record.enabled === 'boolean') settings.enabled = record.enabled;
  if (typeof record.mirrorToConsole === 'boolean')
    settings.mirrorToConsole = record.mirrorToConsole;
  if (typeof record.maxEntriesPerTab === 'number' && Number.isFinite(record.maxEntriesPerTab)) {
    settings.maxEntriesPerTab = Math.min(
      MAX_ENTRIES,
      Math.max(MIN_ENTRIES, Math.round(record.maxEntriesPerTab)),
    );
  }
  return settings;
}

export function recordingToMap(recording: ReadonlyMap<number, boolean>): RecordingMap {
  const map: RecordingMap = {};
  for (const [tabId, value] of recording) map[String(tabId)] = value;
  return map;
}

export function mapToRecording(map: RecordingMap | undefined): Map<number, boolean> {
  const recording = new Map<number, boolean>();
  if (!map) return recording;
  for (const [key, value] of Object.entries(map)) {
    const tabId = Number(key);
    if (Number.isInteger(tabId)) recording.set(tabId, Boolean(value));
  }
  return recording;
}

/** Format a `chrome.runtime.lastError` without throwing when it is undefined. */
export function lastErrorMessage(runtime: typeof chrome.runtime): string | undefined {
  try {
    return runtime.lastError?.message;
  } catch {
    return undefined;
  }
}
