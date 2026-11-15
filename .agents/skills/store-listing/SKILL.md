---
name: store-listing
description: Use when updating the postMessage-catcher Chrome Web Store listing — copy, screenshots, promo tiles, permission/privacy answers, or submission checks.
---

# Update the postMessage-catcher store listing

Everything is in [`store/README.md`](../../../store/README.md): listing copy, the
asset map, permission justifications, data disclosures, reviewer steps and the
submission checklist. Images live in [`store/assets/`](../../../store/assets/);
the public policy is a separate page, [`docs/privacy.md`](../../../docs/privacy.md),
because it is linked directly from the Chrome Web Store.

## Facts to keep straight

| Item                | Current value                                                        |
| ------------------- | -------------------------------------------------------------------- |
| Extension ID        | `henlmhlhpgnkeecjjcbhhcfmecohnilo`                                   |
| Version             | Read `package.json`; it must match the built manifest on release     |
| Category / language | Developer Tools / English                                            |
| Screenshots         | exactly 3, 1280×800, full-bleed, opaque PNG                          |
| Small promo tile    | 440×280                                                              |
| Marquee             | 1400×560                                                             |
| Store icon          | 128×128, from `public/icon/128.png`                                  |
| Remote code         | No                                                                   |
| Permissions         | `storage` only                                                       |
| Data usage          | website content + web history — processed locally, never transmitted |
| Privacy policy      | `docs/privacy.md`                                                    |

The manifest name (`postMessage-catcher`) is the store title. Do not change it
without explicit approval.

## Workflow

1. **Behaviour first.** If the feature set changed, update
   `docs/architecture.md` and the code; the store must not promise more than the
   extension does.
2. **Copy.** Update the relevant sections of
   [`store/README.md`](../../../store/README.md): title/summary character counts,
   the description block, permission justifications, data usage, reviewer steps,
   and the version marker. The summary hard limit is 132 characters.
3. **Privacy.** If the manifest or storage changed, update the justifications in
   `store/README.md` and the policy in `docs/privacy.md` in the same change.
4. **Assets.** If the UI changed:

   ```bash
   CHROME_BIN="/path/to/chrome" pnpm store:assets
   ```

   It composes the exact-size images from `docs/screenshots/` and copies the
   128 icon. Review all screenshots and both promo tiles; do not edit PNGs by
   hand.

5. **Validate.**

   ```bash
   pnpm test    # includes scripts/release-docs.test.ts
   ```

   It checks the single store document, three opaque 1280×800 screenshots, promo
   sizes, the icon size, release markers, the changelog entry, relative links and
   agent skill routing.

6. **Submit manually.** Follow the checklist in the store README end to end;
   after upload, verify the dashboard preview, privacy fields and test
   instructions.

## Asset rules

- 1280×800 is preferred over 640×400. Truecolor PNG without alpha.
- Screenshots must match the submitted build. If the panel or popup changes,
  regenerate them (`docs/screenshots` is the source of truth for the composer).
- The small promo tile is effectively required; the marquee is needed for
  marquee placement.
- Keep the icon at 128×128; the source is `public/icon/128.png`.

## Privacy answer guidance

- Single purpose: capture and display `postMessage` traffic for debugging, on
  the user's device only.
- `storage`: settings, per-tab recording flags and the captured message history —
  local only.
- **Website content**: `message` payloads are captured so they can be displayed.
- **Web history**: page URLs and origins are stored with each captured message.
- Do not select PII, health, financial, authentication, personal communications,
  location or user activity unless the implementation actually handles them.
- Remote code: **No**.
- Certifications: no sale/transfer, no unrelated use, no creditworthiness use.

## Reviewer test instructions

```text
postMessage-catcher is a local-only developer tool. No account or credentials
are needed.

1. Open any regular http(s) page, for example https://example.com/.
2. Open DevTools and select the "postMessage" panel.
3. In the page console run: window.postMessage({ type: 'hello' }, '*')
4. The message appears in the list. Select it to see Overview / Payload / Raw.
5. Reload the page and confirm the earlier message is still listed.
6. Click the toolbar icon and use the "Record this tab" switch to pause capture.
```

## Guardrails

- Do not add more store documents; keep the kit in `store/README.md` and the
  legal policy in `docs/privacy.md`.
- Do not change the manifest `name` without explicit approval.
- Do not add a permission to make a screenshot or feature easier.
- Do not use third-party brand icons or screenshots you do not have rights to.
- Do not claim cloud sync, accounts or telemetry: the extension has none.
- Do not submit while a review is pending.

## Output

Report the sections changed, asset sizes, `pnpm test` result, and the dashboard
fields that still need a human (upload, privacy URL, submit).
