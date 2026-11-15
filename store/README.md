# postMessage-catcher — Chrome Web Store submission

<!-- release: 3.0.0 -->

Copy-paste sheet for updating the store. Assets are in [`assets/`](assets/); the
public policy is [`../docs/privacy.md`](../docs/privacy.md); the end-to-end
release steps are in [`../docs/release-process.md`](../docs/release-process.md).

- Dashboard: <https://chrome.google.com/webstore/devconsole>
- Extension ID: `henlmhlhpgnkeecjjcbhhcfmecohnilo`
- Current version: `3.0.0`
- Homepage: <https://github.com/niexia/postMessage-catcher>
- Support: <https://github.com/niexia/postMessage-catcher/issues>
- Privacy policy: <https://github.com/niexia/postMessage-catcher/blob/main/docs/privacy.md>

## Product details

| Field                            | Value                                                                                  | Limit    |
| -------------------------------- | -------------------------------------------------------------------------------------- | -------- |
| Title (manifest `name`)          | `postMessage-catcher`                                                                  | 20 / 75  |
| Summary (manifest `description`) | `Capture, inspect and audit postMessage traffic between windows, iframes and workers.` | 84 / 132 |
| Category                         | **Developer Tools**                                                                    | —        |
| Language                         | **English**                                                                            | —        |
| Visibility                       | **Public**                                                                             | —        |
| Mature content                   | **No**                                                                                 | —        |
| Official URL                     | leave empty                                                                            | —        |
| Homepage / Support               | repository / issues URLs above                                                         | —        |

Title and summary come from the manifest. Change `wxt.config.ts`, rebuild, and
upload a new package rather than editing only the dashboard.

### Description

Plain text, **2212 / 16,000** characters. Paste the block:

```text
postMessage-catcher shows the postMessage traffic of any page in a proper DevTools panel, instead of asking you to read a flooded console.

What you get:
• A live list of every message any frame of the page receives, with timestamp, origin, sender relationship, inferred type and size.
• A detail pane with Overview, a collapsible Payload tree and the Raw snapshot.
• Capture starts at document_start in every frame, including iframes, about:blank, srcdoc, data: and blob: frames, so handshakes and OAuth callbacks that fire during load are not missed.
• Sender attribution you can trust: event.origin plus self / parent / child / other, even when the sender is cross-origin.
• JSON string payloads are parsed automatically, with a Parsed / Text switch. That is how many widget and chat SDKs post their data.
• History that survives reloads: the worker keeps a per-tab ring buffer, so you can open the panel after the bug happened.
• Search, sender filters, keyboard navigation (Cmd/Ctrl+F, arrow keys) and JSON export. The active detail tab is kept while you move between messages.

Built to do no harm:
• The extension never wraps window.postMessage. Replacing that function would rewrite event.source and break pages that validate the sender, so capture is receive-only.
• Page payloads are snapshotted with bounded budgets; cycles, Map, Set, BigInt, typed arrays and DOM nodes are represented, never thrown.
• No network requests, no accounts, no telemetry, no remote code. Everything is processed and stored on your device.

Good to know:
• Works on regular http(s) pages. Chrome's own pages, extension pages, the Chrome Web Store and the PDF viewer cannot run content scripts.
• targetOrigin is not shown: it is only visible on the sending side.
• The sender's frameId is not knowable cross-origin; the panel shows origin and relationship instead.
• MessagePort, BroadcastChannel and Worker traffic is not captured yet.
• Frames that do not execute scripts (sandbox without allow-scripts) are invisible.

Permissions:
• storage — save your settings, per-tab recording flags and the captured history on your device.

Open source under the MIT license. Source, issues and the privacy policy are linked below.
```

## Graphic assets

Truecolor PNGs, exact sizes, no store-added padding.

| Field        | File                                                                   | Size     |
| ------------ | ---------------------------------------------------------------------- | -------- |
| Store icon   | [`assets/store-icon-128.png`](assets/store-icon-128.png)               | 128×128  |
| Screenshot 1 | [`assets/screenshot-1-messages.png`](assets/screenshot-1-messages.png) | 1280×800 |
| Screenshot 2 | [`assets/screenshot-2-payload.png`](assets/screenshot-2-payload.png)   | 1280×800 |
| Screenshot 3 | [`assets/screenshot-3-popup.png`](assets/screenshot-3-popup.png)       | 1280×800 |
| Small promo  | [`assets/small-promo-440x280.png`](assets/small-promo-440x280.png)     | 440×280  |
| Marquee      | [`assets/marquee-1400x560.png`](assets/marquee-1400x560.png)           | 1400×560 |

Regenerate after a UI change:

```bash
CHROME_BIN="/path/to/chrome" pnpm store:assets
```

The composer renders `scripts/store/frames/` with Chrome for Testing, composes
from `docs/screenshots/`, writes the files above, and strips the alpha channel.
Do not hand-edit the PNGs.

## Privacy practices

**Single purpose:**

```text
postMessage-catcher has one purpose: capture postMessage traffic between the windows and frames of a page the user is inspecting and display it in a DevTools panel, entirely on the user's device.
```

**Permission justifications** (one per dashboard field; both are required even
though the manifest requests no `host_permissions`, because the dashboard treats
`content_scripts` match patterns as host access):

`storage` justification:

```text
Stores the extension's settings (master switch, theme), per-tab recording flags, and the captured message history: payload snapshots, sender and receiver origins, page URLs, timestamps, frame and document ids. The DevTools panel reads this history so traffic captured before it was opened is not lost, and so the recording state survives service-worker restarts. Everything stays in chrome.storage on the user's device; nothing is transmitted, and the Clear action removes the buffered history.
```

Host permission justification:

```text
postMessage-catcher has one purpose: show the postMessage traffic of the page the user is inspecting. Its declarative content scripts therefore run on any http(s) page, in all frames, so the user can inspect any site. The scripts only add a passive message listener, snapshot the delivered payload plus origin and source, and forward it to the extension. They never modify the page, never replace window.postMessage, and do not read form values, cookies, web storage, network requests, or page text. Captured data stays in local chrome.storage and is never transmitted. A narrower match pattern is not possible because the user chooses which site to inspect.
```

Replace the older v2 text in the dashboard when uploading v3: it described a
"configuration" toggle and mentioned executing methods on the page, which no
longer matches the implementation.

**Remote code:** select **No**.

```text
All JavaScript and CSS are bundled in the extension package. The extension does not load remote scripts, WebAssembly, or eval, and it makes no network requests.
```

**Data usage:** select **Website content** and **Web history**.

- Website content: message payloads are captured so they can be displayed.
- Web history: the page URL and origin of each captured message are stored with
  it.

Do not select PII, health, financial, authentication, personal communications,
location or user activity unless a reviewer classifies the captured payloads
that way; the policy discloses that payloads may contain arbitrary page data.
Nothing is transmitted or sold.

**Certifications:** check all three — no sale/transfer, no unrelated use, no
creditworthiness/lending use.

Privacy policy URL:
`https://github.com/niexia/postMessage-catcher/blob/main/docs/privacy.md`. A
GitHub Pages URL is better long-term; update this field if the policy moves.

## Reviewer test instructions

```text
postMessage-catcher is a local-only developer tool. No account or credentials are needed.

1. Open any regular http(s) page, for example https://example.com/.
2. Open DevTools and select the "postMessage" tab/panel.
3. In the page console run: window.postMessage({ type: 'hello' }, '*')
4. The message appears in the list. Select it to see Overview, Payload and Raw.
5. Reload the page and confirm the earlier message is still listed (the worker keeps a per-tab buffer).
6. Click the toolbar icon: the popup shows this tab's recording state and a message count; the theme button cycles System / Light / Dark.
```

## Submission checklist

1. `pnpm check` and, if Chrome for Testing is available, `pnpm test:e2e`.
2. Bump the version and generate the changelog (`pnpm changelog --minor`).
3. Update the `<!-- release: X.Y.Z -->` marker here, in
   `docs/architecture.md`, and in `docs/release-process.md`.
4. Regenerate `store/assets/` and review every image.
5. `pnpm zip` and verify `manifest.json` is at the zip root.
6. Upload, update the listing, fill privacy practices, paste the reviewer steps,
   and submit.
7. Record the review state; do not resubmit while a review is pending.

## Notes

- The extension has no network access, no accounts and no telemetry. Never claim
  cloud sync or cross-device history.
- `docs/privacy.md` is the linked policy; keep it public and current.
- Keep this as the only store document; the legal policy belongs in `docs/`.
