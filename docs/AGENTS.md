# Agent instructions for `docs/`

These instructions apply to work under `docs/`. They add to the repository
[`AGENTS.md`](../AGENTS.md); more specific instructions take precedence for
files in this directory.

## When editing

1. **Behaviour changes first.** If a change touches capture, storage, messaging,
   the panel, permissions or the release pipeline, update `architecture.md`
   before touching store copy.
2. **Update the marker.** Bump `<!-- release: X.Y.Z -->` in `architecture.md`,
   `release-process.md` and `../store/README.md` when preparing a release, after
   verifying the content.
3. **Keep diagrams truthful.** Edit the Mermaid source in place. Do not replace a
   diagram with a screenshot of a diagram.
4. **Do not rename linked sections** without updating every link in `README.md`,
   `docs/README.md`, `store/` and `.agents/skills/`.
5. **Run `pnpm test`** after changes. The release-docs test is part of `pnpm test`
   and CI; use `pnpm exec vitest run scripts/release-docs.test.ts` for the fast
   loop.

## Diagram conventions

- `flowchart TD/LR` for component structure, storage and capture pipelines.
- `sequenceDiagram` for anything where order matters (init, capture, panel
  subscribe, release).
- `stateDiagram-v2` for recording state and other lifecycle machines.
- Quote node labels that contain punctuation; avoid `{}` inside quoted labels.
- Put the happy path first, then `alt`/`opt` blocks for fallbacks and errors.
- Name the actual functions and storage keys in labels when it aids debugging.

## Language

Write in English, matching the rest of the repository. Be concise and specific.
Avoid marketing adjectives in `docs/`; the store listing is the place for
positioning.
