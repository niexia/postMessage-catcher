# Release process

<!-- release: 3.0.0 -->

## 1. Prepare

```bash
git status --short
git tag --sort=-creatordate | head -3
pnpm install --frozen-lockfile
pnpm check
```

Then bump and generate the changelog:

```bash
pnpm exec changelogen          # preview; writes nothing
pnpm changelog --minor         # or --patch / --major
```

`pnpm changelog` runs `changelogen --bump`. It updates `package.json` and
prepends an entry to `CHANGELOG.md` from Conventional Commits and
[`changelog.config.json`](../changelog.config.json). It does **not** commit, tag,
push, publish, or create a GitHub release.

WXT derives `manifest.version` from `package.json`. Do not edit the built
manifest by hand. The version must be four dot-separated integers or fewer and
strictly greater than the published one.

## 2. Documentation

Update the affected surfaces before building:

| Change                                   | Update                                     |
| ---------------------------------------- | ------------------------------------------ |
| Capture, storage, messaging, permissions | [`architecture.md`](architecture.md) first |
| Data handling, retention, contact        | [`privacy.md`](privacy.md)                 |
| Feature set, install steps               | [`../README.md`](../README.md)             |
| Listing copy, assets, permission answers | [`../store/README.md`](../store/README.md) |

Then bump the `<!-- release: X.Y.Z -->` marker in `docs/architecture.md`, this
file, and `store/README.md`. `pnpm test` enforces all three plus a matching
changelog entry.

## 3. Store assets

Store images are composed from the screenshots in `docs/screenshots/` so they
always show the real UI:

```bash
CHROME_BIN="/path/to/chrome" pnpm store:assets
```

The composer renders `scripts/store/frames/*.html` in Chrome for Testing and
writes exact-size, alpha-free PNGs to `store/assets/`:

| File                        | Size     |
| --------------------------- | -------- |
| `screenshot-1-messages.png` | 1280×800 |
| `screenshot-2-payload.png`  | 1280×800 |
| `screenshot-3-popup.png`    | 1280×800 |
| `small-promo-440x280.png`   | 440×280  |
| `marquee-1400x560.png`      | 1400×560 |
| `store-icon-128.png`        | 128×128  |

Do not hand-edit the PNGs. If the panel or popup changed, refresh
`docs/screenshots/` first (the e2e harness and the ad-hoc CDP captures are the
source), then rerun the composer.

## 4. Build and verify

```bash
pnpm build
cat .output/chrome-mv3/manifest.json   # permissions, content scripts, version
pnpm test:e2e                          # real browser, needs CHROME_BIN
pnpm zip                               # .output/postmessage-catcher-<version>-chrome.zip
```

The zip must contain `manifest.json` at its root. Load `.output/chrome-mv3`
unpacked and run the manual smoke test in
[`AGENTS.md`](../AGENTS.md#verification).

## 5. Commit, tag, release

Only after the user confirms publication:

```bash
git add -A
git commit -m "chore(release): vX.Y.Z"
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin main --follow-tags
```

A `v*` tag triggers [`.github/workflows/release.yml`](../.github/workflows/release.yml):
it checks the tag against `package.json`, runs `pnpm check`, builds the zip,
extracts the matching CHANGELOG section as release notes, and creates a GitHub
Release with the zip attached. Verify the workflow and the attachment.

**Push `main` before the tag.** GitHub only triggers tag-push workflows when the
workflow file already exists on the default branch. If you push `main` and the
tag together and the workflow is new, the tag run is silently skipped; delete and
re-push the tag after `main` lands.

## 6. Chrome Web Store

Submission is manual:

1. Upload `.output/postmessage-catcher-X.Y.Z-chrome.zip` in the
   [developer dashboard](https://chrome.google.com/webstore/devconsole).
2. Apply the listing copy from [`../store/README.md`](../store/README.md) and
   upload the six files from `store/assets/`.
3. Fill the privacy practices: single purpose, `storage` justification, data
   usage (website content + web history, local only), remote code = No, and the
   public privacy-policy URL.
4. Paste the reviewer steps; confirm distribution and submit.
5. Report the review state.

The Chrome Web Store API v1 retired on 2026-10-15 and this project does not
configure v2, so do not claim an automated submission. Treat API v2 (OAuth or a
service account) as a separate migration with its own tests.

## Notes

- Build artifacts belong in GitHub Releases, not in git. `assets/*.zip` must not
  come back.
- `legacy/` documents the v2 implementation used by
  [the research notes](architecture-research.md); leave it untouched.
- Changelogen uses the latest git tag as its range. If no tag exists yet, tag the
  current release before generating the next entry, or it will cover the whole
  history.
