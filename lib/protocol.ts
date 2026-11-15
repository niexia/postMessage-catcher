/**
 * The wire contract between the MAIN-world probe, the ISOLATED-world bridge,
 * the service worker and every UI surface.
 *
 * Everything in this file must stay JSON-safe: it crosses `chrome.runtime`
 * messaging, which is JSON-only, and `storage.session`, which is JSON-only too.
 * Page payloads are converted with `snapshot()` before they ever get here.
 */

export const PROTOCOL_VERSION = 1;

/** Where a message was captured. Only `window` exists today. */
export type Channel = 'window' | 'port' | 'broadcast' | 'worker';

/** How the receiver can relate the sender to itself. */
export type SenderKind = 'self' | 'parent' | 'top' | 'child' | 'other' | 'unknown';

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** Marker used for values that JSON or structured clone cannot represent. */
export const MARKER = '$pmc';

export interface FrameRef {
  /** URL of the document that received the message. */
  url: string;
  /** `location.origin` of the receiver; `null` for opaque origins. */
  origin: string;
}

export interface SenderRef {
  kind: SenderKind;
  /** `event.origin` — always accurate, even cross-origin. */
  origin: string;
  /** URL of the sender when the browser lets us read it. */
  url?: string;
}

export interface TruncationCounts {
  depth: number;
  keys: number;
  items: number;
  strings: number;
  nodes: number;
}

/** What one frame reports about the listeners that could handle a message. */
export interface HandlerSummary {
  /** Number of `message` listeners registered on the receiving window. */
  count: number;
  /** How many of them registered in the capture phase. */
  capture: number;
  /**
   * Heuristic: at least one listener body mentions `origin`.
   * `null` means the registry was unavailable (e.g. it was disabled).
   */
  originChecked: boolean | null;
}

/** A message as the probe sees it, before the service worker stamps it. */
export interface ProbePayload {
  seq: number;
  ts: number;
  channel: Channel;
  receiver: FrameRef;
  sender: SenderRef;
  data: JsonValue;
  /** UTF-8 byte size of the serialized payload. */
  size: number;
  truncated?: TruncationCounts;
  handlers?: HandlerSummary;
}

/** A message as everyone downstream of the service worker sees it. */
export interface CapturedMessage extends ProbePayload {
  v: number;
  id: string;
  tabId: number;
  frameId: number;
  /** Chrome's document id: groups messages by navigation. */
  documentId?: string;
  documentLifecycle?: string;
}

export interface Settings {
  /** Master switch. When off, probes do not capture at all. */
  enabled: boolean;
  /** Mirror captured traffic to the page console (legacy behaviour). */
  mirrorToConsole: boolean;
  /** Ring-buffer size per tab. */
  maxEntriesPerTab: number;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  mirrorToConsole: false,
  maxEntriesPerTab: 2000,
};

export const STORAGE_KEYS = {
  settings: 'pmc:settings',
  recording: 'pmc:recording',
  buffers: 'pmc:buffers',
  /** Popup colour scheme: 'system' | 'light' | 'dark'. */
  theme: 'pmc:theme',
} as const;

/** tabId -> whether this tab is recording. Survives service-worker restarts. */
export type RecordingMap = Record<string, boolean>;

export type RuntimeRequest =
  | { type: 'pmc:hello' }
  | { type: 'pmc:batch'; entries: ProbePayload[] }
  | { type: 'pmc:set-recording'; tabId: number; enabled: boolean }
  | { type: 'pmc:get-state'; tabId: number }
  | { type: 'pmc:clear'; tabId: number };

export interface HelloResponse {
  ok: true;
  tabId: number;
  recording: boolean;
  enabled: boolean;
  maxEntriesPerTab: number;
  mirrorToConsole: boolean;
}

export interface StateResponse {
  ok: true;
  recording: boolean;
  count: number;
}

export type RuntimeResponse =
  HelloResponse | StateResponse | { ok: true } | { ok: false; error: string };

export type PanelInbound =
  | {
      type: 'snapshot';
      tabId: number;
      entries: CapturedMessage[];
      recording: boolean;
      enabled: boolean;
    }
  | { type: 'entries'; entries: CapturedMessage[] }
  | { type: 'cleared'; tabId: number }
  | { type: 'recording'; recording: boolean };

export type PanelOutbound =
  | { type: 'subscribe'; tabId: number }
  | { type: 'clear'; tabId: number }
  | { type: 'set-recording'; tabId: number; enabled: boolean };

export const PANEL_PORT_NAME = 'pmc:panel';

/** Event names used inside a document to cross the two worlds. */
export const DOM_EVENTS = {
  /** probe -> bridge: a captured message (detail is JSON text). */
  capture: 'pmc:capture',
  /** probe -> bridge: the probe is installed. */
  ready: 'pmc:ready',
  /** bridge -> probe: apply configuration (detail is JSON text). */
  config: 'pmc:config',
} as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isRuntimeRequest(value: unknown): value is RuntimeRequest {
  if (!isObject(value) || typeof value.type !== 'string') return false;
  switch (value.type) {
    case 'pmc:hello':
      return true;
    case 'pmc:batch':
      return Array.isArray(value.entries);
    case 'pmc:set-recording':
      return typeof value.tabId === 'number' && typeof value.enabled === 'boolean';
    case 'pmc:get-state':
    case 'pmc:clear':
      return typeof value.tabId === 'number';
    default:
      return false;
  }
}

export function isPanelOutbound(value: unknown): value is PanelOutbound {
  if (!isObject(value) || typeof value.type !== 'string') return false;
  switch (value.type) {
    case 'subscribe':
    case 'clear':
      return typeof value.tabId === 'number';
    case 'set-recording':
      return typeof value.tabId === 'number' && typeof value.enabled === 'boolean';
    default:
      return false;
  }
}

/** `event.origin` is the string `"null"` for opaque origins — worth flagging. */
export function isOpaqueOrigin(origin: string): boolean {
  return origin === 'null' || origin === '';
}

/**
 * WXT — and any future extension code — talks to content scripts with messages
 * whose `type` starts with `<extension id>:`. That is our own traffic, not page
 * traffic, so it must never reach the panel.
 */
export function isOwnExtensionMessage(data: JsonValue, extensionId: string): boolean {
  if (!extensionId) return false;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return false;
  const type = (data as Record<string, JsonValue>).type;
  return typeof type === 'string' && type.startsWith(`${extensionId}:`);
}
