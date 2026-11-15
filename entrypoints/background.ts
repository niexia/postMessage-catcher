import { defineBackground } from '#imports';
import {
  DEFAULT_SETTINGS,
  MARKER,
  PANEL_PORT_NAME,
  PROTOCOL_VERSION,
  STORAGE_KEYS,
  isPanelOutbound,
  isRuntimeRequest,
  type CapturedMessage,
  type HelloResponse,
  type PanelInbound,
  type RuntimeRequest,
  type RuntimeResponse,
  type Settings,
} from '../lib/protocol';
import { appendBounded } from '../lib/ring';
import { mapToRecording, normalizeSettings, recordingToMap } from '../lib/storage';

/**
 * The service worker is a stateless router: it stamps entries with the tab /
 * frame / document they came from, keeps a per-tab ring buffer, and fans the
 * entries out to any open DevTools panel.
 *
 * The buffer has a `storage.session` backstop, so restarting the worker does not
 * lose the history that lets you open the panel *after* the bug happened.
 */

type SenderWithDocument = chrome.runtime.MessageSender & {
  documentId?: string;
  documentLifecycle?: string;
};

const PERSIST_DELAY_MS = 400;
const PERSISTED_ENTRIES_PER_TAB = 300;
const PERSISTED_ENTRY_BYTES = 24_000;

export default defineBackground(() => {
  const settings: Settings = { ...DEFAULT_SETTINGS };
  const recording = new Map<number, boolean>();
  const buffers = new Map<number, CapturedMessage[]>();
  /** port -> inspected tabId */
  const panels = new Map<chrome.runtime.Port, number>();
  let counter = 0;
  let persistTimer: ReturnType<typeof setTimeout> | null = null;

  const isRecording = (tabId: number): boolean =>
    settings.enabled && (recording.get(tabId) ?? true);

  const hydrate = (async () => {
    try {
      // Let the bridge read and watch per-tab recording state.
      await chrome.storage.session.setAccessLevel({
        accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS',
      });
    } catch {
      // Older Chrome: storage.session stays worker-only, toggling still works.
    }
    try {
      const [local, session] = await Promise.all([
        chrome.storage.local.get(STORAGE_KEYS.settings),
        chrome.storage.session.get([STORAGE_KEYS.recording, STORAGE_KEYS.buffers]),
      ]);
      Object.assign(settings, normalizeSettings(local[STORAGE_KEYS.settings]));
      for (const [tabId, value] of mapToRecording(
        session[STORAGE_KEYS.recording] as Record<string, boolean> | undefined,
      )) {
        recording.set(tabId, value);
      }
      const storedBuffers = session[STORAGE_KEYS.buffers] as
        Record<string, CapturedMessage[]> | undefined;
      if (storedBuffers) {
        for (const [key, value] of Object.entries(storedBuffers)) {
          const tabId = Number(key);
          if (Number.isInteger(tabId) && Array.isArray(value)) buffers.set(tabId, value);
        }
      }
    } catch {
      // Corrupt or unavailable storage: start with defaults.
    }
  })();

  const updateBadge = (tabId: number, count: number): void => {
    try {
      const text = count > 0 ? (count > 999 ? '999+' : String(count)) : '';
      void chrome.action.setBadgeText({ tabId, text });
      void chrome.action.setBadgeBackgroundColor({ tabId, color: '#2563eb' });
    } catch {
      // Tab already gone.
    }
  };

  const broadcast = (tabId: number, message: PanelInbound): void => {
    for (const [port, portTab] of panels) {
      if (portTab !== tabId) continue;
      try {
        port.postMessage(message);
      } catch {
        panels.delete(port);
      }
    }
  };

  const compactForStorage = (entry: CapturedMessage): CapturedMessage => {
    let json: string;
    try {
      json = JSON.stringify(entry);
    } catch {
      return { ...entry, data: { [MARKER]: 'Unserializable' } };
    }
    if (json.length <= PERSISTED_ENTRY_BYTES) return entry;
    return { ...entry, data: { [MARKER]: 'TrimmedForStorage', bytes: json.length } };
  };

  const persist = async (): Promise<void> => {
    const stored: Record<string, CapturedMessage[]> = {};
    for (const [tabId, list] of buffers) {
      stored[String(tabId)] = list.slice(-PERSISTED_ENTRIES_PER_TAB).map(compactForStorage);
    }
    try {
      await chrome.storage.session.set({ [STORAGE_KEYS.buffers]: stored });
    } catch {
      // Quota or shutdown: the in-memory buffer is still authoritative.
    }
  };

  const schedulePersist = (): void => {
    if (persistTimer !== null) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      void persist();
    }, PERSIST_DELAY_MS);
  };

  const persistRecording = async (): Promise<void> => {
    try {
      await chrome.storage.session.set({ [STORAGE_KEYS.recording]: recordingToMap(recording) });
    } catch {
      // Best effort.
    }
  };

  const notifyTab = (tabId: number, enabled: boolean): void => {
    try {
      chrome.tabs.sendMessage(tabId, { type: 'pmc:recording', enabled }, () => {
        void chrome.runtime.lastError;
      });
    } catch {
      // No content script in that tab; the storage watcher is the fallback.
    }
  };

  const handle = async (
    message: RuntimeRequest,
    sender: SenderWithDocument,
  ): Promise<RuntimeResponse> => {
    switch (message.type) {
      case 'pmc:hello': {
        const tabId = sender.tab?.id;
        if (typeof tabId !== 'number') return { ok: false, error: 'no-tab' };
        const response: HelloResponse = {
          ok: true,
          tabId,
          recording: isRecording(tabId),
          enabled: settings.enabled,
          maxEntriesPerTab: settings.maxEntriesPerTab,
          mirrorToConsole: settings.mirrorToConsole,
        };
        return response;
      }

      case 'pmc:batch': {
        const tabId = sender.tab?.id;
        if (typeof tabId !== 'number' || !isRecording(tabId)) return { ok: true };
        const appended: CapturedMessage[] = [];
        for (const entry of message.entries) {
          if (typeof entry !== 'object' || entry === null) continue;
          appended.push({
            ...entry,
            v: PROTOCOL_VERSION,
            id: `${tabId}-${(counter += 1).toString(36)}`,
            tabId,
            frameId: sender.frameId ?? 0,
            documentId: sender.documentId,
            documentLifecycle: sender.documentLifecycle,
          });
        }
        if (appended.length === 0) return { ok: true };
        const next = appendBounded(buffers.get(tabId) ?? [], appended, settings.maxEntriesPerTab);
        buffers.set(tabId, next);
        broadcast(tabId, { type: 'entries', entries: appended });
        updateBadge(tabId, next.length);
        schedulePersist();
        return { ok: true };
      }

      case 'pmc:set-recording': {
        recording.set(message.tabId, message.enabled);
        await persistRecording();
        notifyTab(message.tabId, isRecording(message.tabId));
        broadcast(message.tabId, { type: 'recording', recording: isRecording(message.tabId) });
        return { ok: true };
      }

      case 'pmc:get-state': {
        return {
          ok: true,
          recording: isRecording(message.tabId),
          count: buffers.get(message.tabId)?.length ?? 0,
        };
      }

      case 'pmc:clear': {
        buffers.delete(message.tabId);
        updateBadge(message.tabId, 0);
        broadcast(message.tabId, { type: 'cleared', tabId: message.tabId });
        schedulePersist();
        return { ok: true };
      }
    }
  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isRuntimeRequest(message)) return false;
    void (async () => {
      await hydrate;
      try {
        sendResponse(await handle(message, sender as SenderWithDocument));
      } catch (error) {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    })();
    return true;
  });

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== PANEL_PORT_NAME) return;
    port.onMessage.addListener((raw: unknown) => {
      if (!isPanelOutbound(raw)) return;
      void (async () => {
        await hydrate;
        if (raw.type === 'subscribe') {
          panels.set(port, raw.tabId);
          port.postMessage({
            type: 'snapshot',
            tabId: raw.tabId,
            entries: buffers.get(raw.tabId) ?? [],
            recording: isRecording(raw.tabId),
            enabled: settings.enabled,
          } satisfies PanelInbound);
          return;
        }
        if (raw.type === 'clear') {
          buffers.delete(raw.tabId);
          updateBadge(raw.tabId, 0);
          broadcast(raw.tabId, { type: 'cleared', tabId: raw.tabId });
          schedulePersist();
          return;
        }
        recording.set(raw.tabId, raw.enabled);
        await persistRecording();
        notifyTab(raw.tabId, isRecording(raw.tabId));
        broadcast(raw.tabId, { type: 'recording', recording: isRecording(raw.tabId) });
      })();
    });
    port.onDisconnect.addListener(() => {
      panels.delete(port);
    });
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes[STORAGE_KEYS.settings]) return;
    Object.assign(settings, normalizeSettings(changes[STORAGE_KEYS.settings]?.newValue));
    for (const [port, tabId] of panels) {
      try {
        port.postMessage({
          type: 'recording',
          recording: isRecording(tabId),
        } satisfies PanelInbound);
      } catch {
        panels.delete(port);
      }
    }
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    buffers.delete(tabId);
    recording.delete(tabId);
    void persistRecording();
  });

  chrome.runtime.onInstalled.addListener(() => {
    void (async () => {
      const stored = await chrome.storage.local.get(STORAGE_KEYS.settings);
      if (!stored[STORAGE_KEYS.settings]) {
        await chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings });
      }
      await hydrate;
    })();
  });
});
