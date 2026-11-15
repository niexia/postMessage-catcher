---
name: release-chrome-extension
description: Use when preparing, tagging, or publishing a postMessage-catcher release — version bump, changelog, docs sync, store assets, zip, GitHub release, and Chrome Web Store submission.
---

# Release postMessage-catcher

Read the repository [`AGENTS.md`](../../../AGENTS.md), then
[`docs/release-process.md`](../../../docs/release-process.md),
[`store/README.md`](../../../store/README.md), and
[`docs/privacy.md`](../../../docs/privacy.md).

## Preconditions

- The user has **explicitly** asked for a release, tag, or store submission.
  Preparing files is not permission to publish.
- The working tree is clean, or the user accepts that unrelated changes will be
  included in the release commit.
- You know the target version (default: let changelogen infer it). Verify the
  latest git tag and the version currently live in the store dashboard; do not
  assume the package version is already published.
- Node 22+ (`nvm use` reads `.nvmrc`) and pnpm are available. Store submission
  needs dashboard access and may not be possible from the agent.
- Store assets and e2e need Chrome for Testing (`CHROME_BIN`); branded Chrome
  refuses `--load-extension`.

## Steps

### 1. Baseline

```bash
git status --short
git tag --sort=-creatordate | head -3
pnpm install --frozen-lockfile
pnpm check
```

If the baseline fails, fix that first; do not fold unrelated fixes into a
release without saying so.

### 2. Choose the version and generate the changelog

```bash
pnpm exec changelogen          # preview; writes nothing
pnpm changelog --minor         # or --patch / --major, or infer from commits
```

`pnpm changelog` runs `changelogen --bump`: it updates `package.json` and
prepends `CHANGELOG.md` using Conventional Commits and
[`changelog.config.json`](../../../changelog.config.json). It does **not** commit,
tag, push, publish, or create a GitHub release.

- Use an explicit `--patch` / `--minor` / `--major` if the commits do not imply
  the intended bump.
- Changelogen uses the latest git tag as its range. If no tag exists, it covers
  the whole history and can duplicate the current entry; tag the current release
  before generating the next changelog entry.
- Review the entry; curate or trim wording if needed.

### 3. Documentation

Read [`docs/AGENTS.md`](../../../docs/AGENTS.md) and the doc-sync matrix in
[`docs/release-process.md`](../../../docs/release-process.md):

1. Update `docs/architecture.md` diagrams/tables/invariants if behaviour,
   storage, messaging, or permissions changed.
2. Bump `<!-- release: X.Y.Z -->` in `docs/architecture.md`,
   `docs/release-process.md`, and `store/README.md`.
3. Update `store/README.md` listing copy, permission answers, and the version
   marker; update `docs/privacy.md` if data handling or contact details changed.
4. Update `README.md` if the user story changed.
5. Run `pnpm test` (release-docs checks are part of the normal test run).

### 4. Store assets (if the UI changed)

```bash
CHROME_BIN="/path/to/chrome" pnpm store:assets
```

Review the screenshots (1280×800), the 440×280 tile, the 1400×560 marquee, and
the 128×128 icon under `store/assets/`. Do not hand-edit generated PNGs.

### 5. Verify

```bash
pnpm check          # compile, lint, test (incl. release docs), build
pnpm test:e2e       # real browser, needs CHROME_BIN
pnpm zip            # builds again and writes .output/postmessage-catcher-X.Y.Z-chrome.zip
node -p "require('./.output/chrome-mv3/manifest.json').version"
ls -lh .output/*-chrome.zip
```

Smoke-test `.output/chrome-mv3` if behaviour changed: DevTools → postMessage on
a page with iframes, reload, record off/on, clear, export.

### 6. Commit and tag

Only after the user confirms publication:

```bash
git add -A
git commit -m "chore(release): vX.Y.Z"
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin main --follow-tags
```

Use an annotated tag; `--follow-tags` does not push lightweight tags. The tag
triggers `.github/workflows/release.yml` (checks, zip, GitHub Release).
Verify the workflow and the attached zip. Do not create a GitHub Release by hand
with a different body than `CHANGELOG.md`.

### 7. Chrome Web Store

**Manual.** Do not claim an automated submit.

1. Upload `.output/postmessage-catcher-X.Y.Z-chrome.zip` in the Developer
   Dashboard.
2. Update the listing from `store/README.md`; upload three 1280×800 screenshots,
   the 440×280 tile, the 1400×560 marquee, and the 128×128 icon.
3. Fill Privacy practices from `store/README.md`; remote code = No; the privacy
   policy URL must be live.
4. Paste the reviewer steps; confirm distribution and submit.
5. Report the review state.

The Chrome Web Store API v1 retired on 2026-10-15. API v2 needs OAuth/service
account setup; treat it as a separate migration with its own tests, not a release
step.

## Guardrails

- Do not publish, tag, or push a release without explicit user permission.
- Do not hand-edit the built manifest, screenshots, or the changelog links.
- Do not add a permission or remote code to make a release easier.
- Do not lower the version; the store requires an increase.
- Do not skip `pnpm check`; CI enforces it. Do not add a second store document.
- Do not run `pnpm store:assets` with branded Chrome; it cannot load the build.
- If a step fails, stop and report the exact command, output, and remaining
  state. Do not tag a partial release.

## Output

Report version and tag, changelog summary, docs updated, assets regenerated,
check/e2e/zip results and path, GitHub Release URL (if pushed), and the store
status.
