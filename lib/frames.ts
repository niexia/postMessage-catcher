import type { SenderKind, SenderRef } from './protocol';

/**
 * Sender attribution for a received `message` event.
 *
 * We only ever observe deliveries, never sends, so the best we can do is relate
 * the event source to the receiving window. Everything here is best-effort and
 * must never throw: a page that hides its URL simply gets a `sender.url` of
 * `undefined`.
 */

export interface FrameLike {
  contentWindow: Window | null;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
}

export interface DocumentLike {
  querySelectorAll(selector: string): ArrayLike<FrameLike>;
}

export function readUrl(win: Window | null): string | undefined {
  if (!win) return undefined;
  try {
    const href = win.location.href;
    return typeof href === 'string' ? href : undefined;
  } catch {
    // Cross-origin: the sender's URL is intentionally unreadable.
    return undefined;
  }
}

/**
 * `event.source` is a `WindowProxy`, a `MessagePort` or a `ServiceWorker`.
 * `instanceof Window` is useless here: a same-origin parent lives in another
 * realm, so it is not an instance of this frame's `Window` constructor. Detect
 * windows structurally instead, and treat everything else as opaque.
 */
export function isWindowLike(source: unknown, self: Window): source is Window {
  if (source === null || source === undefined) return false;
  if (source === self) return true;
  try {
    if (source === self.parent || source === self.top) return true;
  } catch {
    return false;
  }
  try {
    return typeof source === 'object' && 'location' in (source as object);
  } catch {
    return false;
  }
}

export function findChildFrame(source: Window | null, doc: DocumentLike): FrameLike | null {
  if (!source) return null;
  let frames: ArrayLike<FrameLike>;
  try {
    frames = doc.querySelectorAll('iframe');
  } catch {
    return null;
  }
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    if (!frame) continue;
    try {
      if (frame.contentWindow === source) return frame;
    } catch {
      // Ignore frames whose window proxy cannot be compared.
    }
  }
  return null;
}

export function classifySender(source: Window | null, self: Window): SenderKind {
  if (!source) return 'unknown';
  try {
    if (source === self) return 'self';
    if (source === self.parent) return 'parent';
    if (source === self.top) return 'top';
  } catch {
    return 'unknown';
  }
  return 'other';
}

/**
 * Build the sender descriptor shown in the panel. `origin` always comes from
 * `event.origin`, which is accurate even when `source` is opaque.
 */
export function describeSender(
  event: { origin: string; source: Window | null },
  self: Window,
  doc: DocumentLike,
): SenderRef {
  const origin = typeof event.origin === 'string' ? event.origin : '';
  const source = event.source;
  const kind = classifySender(source, self);

  if (kind === 'self') return { kind, origin, url: readUrl(self) };
  if (kind === 'parent' || kind === 'top') {
    return { kind, origin, url: readUrl(source) };
  }

  const child = findChildFrame(source, doc);
  if (child) {
    if (child.hasAttribute('srcdoc')) return { kind: 'child', origin, url: 'about:srcdoc' };
    const raw = child.getAttribute('src');
    if (raw) {
      try {
        return { kind: 'child', origin, url: new URL(raw, safeHref(self)).href };
      } catch {
        return { kind: 'child', origin, url: raw };
      }
    }
    return { kind: 'child', origin };
  }

  return { kind, origin, url: readUrl(source) };
}

function safeHref(win: Window): string {
  try {
    return win.location.href;
  } catch {
    return 'about:blank';
  }
}
