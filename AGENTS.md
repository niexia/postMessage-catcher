# postMessage-catcher — agent instructions

This file is the repository's operating manual for coding agents. Read it before
changing runtime behaviour.

## What this project is

A Chrome Manifest V3 extension that captures and inspects `window.postMessage`
traffic between windows, iframes and workers. It is built with **WXT 0.21 +
React 19 + TypeScript + Tailwind 4**, tested with Vitest, packaged with pnpm.

- Version: `package.json`. WXT derives the manifest version from it.
- Target: Chrome MV3, `minimum_chrome_version: 114`.
- Runtime shape: a MAIN-world probe in every frame → an ISOLATED-world bridge →
  a service worker router → a DevTools panel and a small popup.

## Commands

Prerequisites: Node 22+ (`.nvmrc`) and pnpm 12 (pinned in `package.json`).

```bash
pnpm install             # install; postinstall runs wxt prepare
pnpm dev                 # WXT dev server (Chrome)
pnpm build               # production build → .output/chrome-mv3
pnpm zip                 # build + zip → .output/postmessage-catcher-<version>-chrome.zip
pnpm compile             # tsc --noEmit
pnpm lint                # ESLint
pnpm test                # Vitest
pnpm test:probe          # executes the built probe against a fake window
pnpm test:e2e            # real browser; needs CHROME_BIN (Chrome for Testing)
pnpm check               # compile + lint + test + build + probe smoke test
```

`pnpm check` is the definition of done for runtime changes. It must pass before
a commit.

## Non-negotiable invariants

1. **Receive-only capture.** Never wrap or replace `window.postMessage`. Wrapping
   it rewrites `event.source` to the receiving window and breaks pages that
   validate the sender. This is measured, not theoretical — see
   [`docs/architecture.md`](docs/architecture.md#why-receive-only).
2. **The probe never throws and never uses `chrome.*`.** It runs in the page's
   MAIN world. Every capture path is wrapped so a hostile payload cannot break
   the page. `pnpm test:probe` fails if the built probe references `chrome`.
3. **Captured data is untrusted page data.** The panel renders it with React text
   nodes only: no `innerHTML`, no `eval`, no `new Function`, no remote images.
4. **No network, no telemetry, no remote code.** Everything stays on the device.
5. **`lib/protocol.ts` is the contract.** Any change to a captured field needs a
   version bump and a migration path for stored buffers.
6. **Permissions stay at `storage`.** `content_scripts` in the manifest are
   exempt from host permissions. Do not add `tabs`, `debugger`, `scripting` or
   `webNavigation` without an explicit request.
7. **The probe must not change page semantics.** It may only add passive
   listeners. The day it mutates page objects is the day it becomes a liability.

## Where things live

| Path                            | Role                                                           |
| ------------------------------- | -------------------------------------------------------------- |
| `entrypoints/probe.content.ts`  | MAIN-world observer; snapshots payloads; emits DOM events      |
| `entrypoints/bridge.content.ts` | ISOLATED-world bridge; recording state; batching to the worker |
| `entrypoints/background.ts`     | Stamps entries, per-tab ring buffer, fan-out to panels, badges |
| `entrypoints/devtools/`         | Creates the DevTools panel                                     |
| `entrypoints/panel/`            | DevTools panel UI (React)                                      |
| `entrypoints/popup/`            | Toolbar popup (React)                                          |
| `lib/protocol.ts`               | Messages, storage keys, DOM event names, types                 |
| `lib/snapshot.ts`               | Bounded, cycle-safe JSON snapshot of page data                 |
| `lib/frames.ts`                 | Sender attribution (`self` / `parent` / `child` / `other`)     |
| `lib/ring.ts`, `lib/storage.ts` | Buffer cap and settings normalisation                          |
| `components/`                   | Panel and popup components                                     |
| `scripts/smoke-probe.mjs`       | Runs the built probe without a browser                         |
| `docs/`                         | Architecture, privacy, release process                         |
| `legacy/`                       | The v2 implementation, kept for reference only                 |

## Verification

| Change                 | Minimum verification                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------- |
| Pure helper in `lib/`  | `pnpm test` + `pnpm compile`, with a new `*.test.ts`                                    |
| Probe / bridge         | `pnpm check` **and** `pnpm test:e2e` (document_start, srcdoc, child deliveries)         |
| Panel / popup UI       | `pnpm check` + manual load in DevTools at both themes                                   |
| Manifest / permissions | `pnpm build`, inspect `.output/chrome-mv3/manifest.json`, update `docs/architecture.md` |
| Docs only              | `pnpm test`                                                                             |

Manual smoke test (load `.output/chrome-mv3` unpacked):

1. Open a page with iframes, open DevTools → **postMessage**.
2. Reload: messages that arrive during load must appear (the probe runs at
   `document_start`).
3. Check a `srcdoc` or `about:blank` iframe: its messages must appear.
4. In the page console run `window.postMessage({type:'probe'}, '*')`; the panel
   must show it with the right sender kind.
5. Toggle recording off in the popup; interaction stops adding entries.
6. Reload the page; previously captured entries are still in the panel.

## Known constraints

- We cannot show `targetOrigin`: it is only visible on the sending side, and
  patching the sending side is forbidden by invariant 1.
- The sender's `frameId` is not knowable cross-origin; attribution is
  origin + relationship, not a frame id.
- Frames that do not execute scripts (`sandbox` without `allow-scripts`) cannot
  be probed.
- `chrome://`, extension pages and the Chrome Web Store cannot run content
  scripts.
- The DevTools panel only exists while DevTools is open; the worker keeps
  buffering either way.
- Turning the master switch off stops capture but cannot unregister the
  declarative content scripts (that would need `scripting`).

## Commit and review style

- Leave changes uncommitted unless the user asks for a commit.
- Conventional Commits: `feat(probe): …`, `fix(panel): …`, `docs: …`.
- Keep the probe and the protocol in sync; a field added in one without the
  other is a bug.
