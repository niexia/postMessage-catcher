import { defineContentScript } from '#imports';
import {
  DOM_EVENTS,
  STORAGE_KEYS,
  isOwnExtensionMessage,
  type HelloResponse,
  type ProbePayload,
  type RuntimeRequest,
} from '../lib/protocol';

/**
 * The ISOLATED-world bridge.
 *
 * It owns the only side of the capture pipeline that can talk to the extension:
 * it reads the recording state, tells the probe what to do, and batches entries
 * to the service worker. Batching keeps `chrome.runtime.sendMessage` traffic
 * low on message-heavy pages.
 */

const FLUSH_DELAY_MS = 60;
const MAX_BATCH = 100;
const MAX_QUEUE = 2000;

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_start',
  matchOriginAsFallback: true,
  // WXT's own "content script started" handshake is not page traffic.
  noScriptStartedPostMessage: true,
  main() {
    const root = window as unknown as { __pmcBridgeInstalled?: boolean };
    if (root.__pmcBridgeInstalled) return;
    root.__pmcBridgeInstalled = true;

    let tabId: number | null = null;
    let masterEnabled = true;
    let perTabRecording = true;
    let mirrorToConsole = false;
    const ownExtensionId = chrome.runtime.id;

    const queue: ProbePayload[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const effectiveRecording = (): boolean => masterEnabled && perTabRecording;

    const send = (message: RuntimeRequest, callback?: (response: unknown) => void): void => {
      try {
        chrome.runtime.sendMessage(message, (response: unknown) => {
          // Reading lastError suppresses the "Unchecked runtime.lastError" warning.
          void chrome.runtime.lastError;
          callback?.(response);
        });
      } catch {
        callback?.(undefined);
      }
    };

    const dispatchConfig = (): void => {
      // Fail closed: until the worker has told us the master switch and the
      // per-tab flag, the probe keeps buffering instead of capturing.
      if (tabId === null) return;
      try {
        document.dispatchEvent(
          new CustomEvent(DOM_EVENTS.config, {
            detail: JSON.stringify({ enabled: effectiveRecording(), mirrorToConsole }),
          }),
        );
      } catch {
        // The probe may be gone; nothing else to do.
      }
    };

    const flush = (): void => {
      flushTimer = null;
      if (queue.length === 0) return;
      const batch = queue.splice(0, MAX_BATCH);
      send({ type: 'pmc:batch', entries: batch });
      if (queue.length > 0) scheduleFlush();
    };

    const scheduleFlush = (): void => {
      if (flushTimer !== null) return;
      flushTimer = setTimeout(flush, FLUSH_DELAY_MS);
    };

    const enqueue = (entry: ProbePayload): void => {
      // Drop our own runtime handshakes (e.g. WXT's content-script-started).
      if (isOwnExtensionMessage(entry.data, ownExtensionId)) return;
      queue.push(entry);
      if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
      if (queue.length >= MAX_BATCH) flush();
      else scheduleFlush();
    };

    const applyHello = (response: unknown): void => {
      const hello = response as Partial<HelloResponse> | undefined;
      if (!hello || hello.ok !== true || typeof hello.tabId !== 'number') return;
      tabId = hello.tabId;
      masterEnabled = hello.enabled === true;
      perTabRecording = hello.recording === true;
      mirrorToConsole = hello.mirrorToConsole === true;
      dispatchConfig();
    };

    send({ type: 'pmc:hello' }, applyHello);

    document.addEventListener(DOM_EVENTS.ready, () => dispatchConfig());
    document.addEventListener(DOM_EVENTS.capture, (event) => {
      const detail = (event as CustomEvent).detail;
      if (typeof detail !== 'string') return;
      try {
        enqueue(JSON.parse(detail) as ProbePayload);
      } catch {
        // Malformed entry: drop it rather than break the page.
      }
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'session' && changes[STORAGE_KEYS.recording] && tabId !== null) {
        const next = changes[STORAGE_KEYS.recording]?.newValue as
          Record<string, boolean> | undefined;
        perTabRecording = next?.[String(tabId)] !== false;
        dispatchConfig();
      }
      if (areaName === 'local' && changes[STORAGE_KEYS.settings]) {
        send({ type: 'pmc:hello' }, applyHello);
      }
    });

    // Direct push from the worker: works even when session storage cannot be
    // watched from a content script.
    chrome.runtime.onMessage.addListener((message: unknown) => {
      if (typeof message !== 'object' || message === null) return;
      const record = message as { type?: unknown; enabled?: unknown };
      if (record.type !== 'pmc:recording' || typeof record.enabled !== 'boolean') return;
      perTabRecording = record.enabled;
      dispatchConfig();
    });

    // Best-effort flush when the document goes away.
    window.addEventListener(
      'pagehide',
      () => {
        if (queue.length > 0) flush();
      },
      { capture: true },
    );
  },
});
