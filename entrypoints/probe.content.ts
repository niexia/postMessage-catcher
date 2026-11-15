import { defineContentScript } from '#imports';
import { describeSender, isWindowLike } from '../lib/frames';
import { DOM_EVENTS, MARKER, type ProbePayload } from '../lib/protocol';
import { byteLength, snapshot } from '../lib/snapshot';

/**
 * The MAIN-world probe.
 *
 * It runs in every frame before any page script, so it sees messages that the
 * old `document_idle` + `<script>` injection could never reach. It only ever
 * *observes* deliveries: wrapping `window.postMessage` would rewrite
 * `event.source` and break pages that validate the sender, so we deliberately
 * never touch it.
 *
 * This file runs in the page's world: no `chrome.*` here. Captured entries are
 * handed to the isolated-world bridge with DOM events.
 */

const MAX_PENDING_EVENTS = 200;
const MAX_PAYLOAD_BYTES = 512 * 1024;

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_start',
  matchOriginAsFallback: true,
  world: 'MAIN',
  main() {
    const root = window as unknown as { __pmcProbeInstalled?: boolean };
    if (root.__pmcProbeInstalled) return;
    root.__pmcProbeInstalled = true;

    // Capture natives before any page script can replace them.
    const nativeDispatch = document.dispatchEvent.bind(document);
    const NativeCustomEvent = CustomEvent;
    const stringify = JSON.stringify;
    const byteLengthOf = byteLength;

    let configured = false;
    let enabled = false;
    let mirrorToConsole = false;
    let seq = 0;
    const pending: MessageEvent[] = [];

    const emit = (payload: ProbePayload): void => {
      try {
        nativeDispatch(new NativeCustomEvent(DOM_EVENTS.capture, { detail: stringify(payload) }));
      } catch {
        // Never let the observer break the page.
      }
    };

    const capture = (event: MessageEvent): void => {
      try {
        const source = isWindowLike(event.source, window) ? event.source : null;
        const sender = describeSender({ origin: event.origin, source }, window, document);
        const snapshotResult = snapshot(event.data);
        let data = snapshotResult.value;
        let size = byteLengthOf(stringify(data));

        if (size > MAX_PAYLOAD_BYTES) {
          data = { [MARKER]: 'Oversize', bytes: size };
          size = byteLengthOf(stringify(data));
        }

        seq += 1;
        const payload: ProbePayload = {
          seq,
          ts: Date.now(),
          channel: 'window',
          // `location.origin` is "null" for about:srcdoc / opaque documents;
          // `window.origin` keeps the origin inherited from the parent frame.
          receiver: { url: location.href, origin: window.origin || location.origin },
          sender,
          data,
          size,
        };

        const truncation = snapshotResult.truncated;
        if (
          truncation.depth ||
          truncation.keys ||
          truncation.items ||
          truncation.strings ||
          truncation.nodes
        ) {
          payload.truncated = truncation;
        }

        emit(payload);

        if (mirrorToConsole) {
          try {
            console.log(
              '%c[postMessage-catcher]',
              'color:#2563eb;font-weight:600',
              `${sender.kind} ${sender.origin} → ${payload.receiver.origin}`,
              snapshotResult.value,
            );
          } catch {
            // Console formatting must not affect capture.
          }
        }
      } catch {
        // A single hostile payload must not disable the probe.
      }
    };

    const onMessage = (event: MessageEvent): void => {
      if (!configured) {
        // The bridge needs one storage read before it knows the switch state.
        // Hold a bounded number of events so early traffic is not lost.
        if (pending.length < MAX_PENDING_EVENTS) pending.push(event);
        return;
      }
      if (!enabled) return;
      capture(event);
    };

    const applyConfig = (raw: unknown): void => {
      try {
        const config = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw;
        if (typeof config !== 'object' || config === null) return;
        const record = config as { enabled?: unknown; mirrorToConsole?: unknown };
        configured = true;
        enabled = record.enabled === true;
        mirrorToConsole = record.mirrorToConsole === true;

        if (!enabled) {
          pending.length = 0;
          return;
        }
        const queued = pending.splice(0, pending.length);
        for (const queuedEvent of queued) capture(queuedEvent);
      } catch {
        // Malformed config keeps the previous state.
      }
    };

    window.addEventListener('message', onMessage, true);
    document.addEventListener(DOM_EVENTS.config, (event) => {
      applyConfig((event as CustomEvent).detail);
    });
    nativeDispatch(new NativeCustomEvent(DOM_EVENTS.ready));
  },
});
