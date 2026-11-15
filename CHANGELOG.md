# Changelog

## [3.0.0] - 2026-11-15

The v3 rewrite. Capture moved from the page console to a DevTools panel, from the
top frame to every frame, and from modifying the page to observing it.

### Features

- **DevTools panel**: virtualised message list plus Overview / Payload / Raw
  detail, sender attribution, search, direction filters, keyboard navigation and
  JSON export.
- **Full-frame capture**: a MAIN-world probe runs at `document_start` in every
  frame — including `about:blank`, `srcdoc`, `data:` and `blob:` frames — so
  messages sent before the page finishes loading are captured.
- **Receive-only by design**: the probe never wraps `window.postMessage`, which
  would rewrite `event.source` and break pages that validate the sender.
- **History across reloads**: the service worker keeps a per-tab ring buffer and
  persists a compact copy to `storage.session`, so the panel can be opened after
  the bug happened.
- **JSON strings, parsed**: payloads that were `JSON.stringify`-ed are shown as a
  tree with a Parsed / Text switch, and the list shows the inner discriminator
  instead of `<string>`.
- **Recording controls**: per-tab recording plus a master switch in the popup.
- **Popup theme switch**: System / Light / Dark, remembered across sessions.
- **Engineering**: WXT 0.21 + React 19 + TypeScript + Tailwind 4, unit tests, a
  dependency-free probe smoke test and a real-browser end-to-end check.

### Bug Fixes

- Capture no longer starts at `document_idle`, which missed everything sent
  during page load.
- Sub-frames, `srcdoc` frames and pages with a strict `script-src` CSP are
  captured now; the old script-tag injection silently failed on them.
- `SharedArrayBuffer` is treated as optional in the snapshot code, so browsers
  without cross-origin isolation no longer drop every message.
- Sender attribution no longer uses `event.source instanceof Window`, which is
  false for same-origin windows in another realm.
- `srcdoc` frames report the origin inherited from their parent instead of
  `"null"`.
- Turning recording off no longer broadcasts to every tab in the window.
- Icon sizes are mapped correctly (16 / 32 / 48 / 128).

### Refactoring

- The v2 implementation moved to `legacy/` for reference only.
- Settings, recording state and buffered history share one typed contract in
  `lib/protocol.ts`.
- The stale 1.6 MB zip and duplicate icons were removed from the repository.
