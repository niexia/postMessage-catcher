# 2026-11-15 — v3: receive-only capture and a real panel

Historical note. Current rules live in [`AGENTS.md`](../../AGENTS.md) and
[`docs/architecture.md`](../../docs/architecture.md); do not treat this file as a
source of current commands.

## Context

v2 logged postMessage to the page console from a `document_idle` content script
in the top frame only. It missed load-time traffic, iframes, `srcdoc` frames and
any page whose CSP blocked the injected `<script>` tag.

## Decisions

1. **Receive-only capture.** Wrapping `window.postMessage` was measured to flip
   `event.source` to the receiving window, breaking pages that validate the
   sender. The probe therefore only listens for `message` events, in every
   frame, and the panel shows deliveries rather than sends. Consequence: no
   `targetOrigin`, and dropped sends are invisible.
2. **MAIN world at `document_start`.** This replaced web-accessible-resource
   script injection: it runs before page scripts, survives strict CSP, and needs
   no `web_accessible_resources`. The probe talks to the ISOLATED world through
   DOM `CustomEvent`s only.
3. **WXT + React 19 + TypeScript + Tailwind 4.** Chosen to match the maintainer's
   other extension; the service worker is the one deliberate deviation from that
   repo's "no worker" rule, because capture must start before any user gesture.
4. **One recording control.** A separate "pause the view" mode was added and then
   removed: the list already stops following when you scroll away or select a
   message, so a second stop-like control only caused confusion.
5. **JSON strings are parsed.** Widget SDKs stringify their payloads; the Payload
   tab parses them into a tree with a Parsed / Text switch, and the list shows the
   inner discriminator.

## Browser-only bugs found by the e2e harness

- `SharedArrayBuffer` is undefined without cross-origin isolation; an
  `instanceof` check threw and silently dropped every capture.
- `event.source instanceof Window` is false across realms, so every non-self
  message was attributed as unknown.
- `location.origin` is `"null"` in `srcdoc`; `window.origin` inherits the parent.

Each has a regression test. `pnpm test:e2e` needs Chrome for Testing
(`CHROME_BIN`) because branded Chrome no longer honours `--load-extension`.
