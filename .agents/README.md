# `.agents/` — portable agent context

This directory keeps the repository's engineering context next to the code:

```
AGENTS.md                 ← project rules, commands, invariants
docs/AGENTS.md            ← nested rules for work under docs/
.agents/
  skills/
    release-chrome-extension/SKILL.md
    store-listing/SKILL.md
  notes/                  ← dated design records (historical, not auto-loaded)
```

`AGENTS.md` is the single source of truth for commands and rules.
`docs/AGENTS.md` adds documentation-specific conventions. Skills are on-demand
procedures, not always-loaded instructions. Notes explain past decisions; they
may mention removed files or tooling and should not be treated as current rules.

## Skills

Current skill routes live in the Agent skills table in
[`AGENTS.md`](../AGENTS.md#agent-skills); the test suite checks that every skill
directory is routed there.

Docs work does not need a skill: read `docs/AGENTS.md`, `docs/README.md`, and the
doc-sync matrix in `docs/release-process.md`.

## Adding or changing a skill

1. Create `.agents/skills/<kebab-name>/SKILL.md`.
2. Start the file with:

   ```yaml
   ---
   name: <kebab-name>
   description: Use when ...
   ---
   ```

3. Keep the body procedural: preconditions, exact commands, guardrails, output.
   Link to repository files with relative paths; the skill base directory is the
   bundle directory, so `../../../` reaches the repo root.
4. Make the description specific enough to route from the skill catalog — it is
   the only text the model sees before loading the body.
5. Do not put secrets or machine-specific absolute paths in a skill.

## Skills are guidance; tests and CI are enforcement

A skill is loaded on demand and can be skipped. The guarantees come from:

- `pnpm check` (compile/lint/test/build); `pnpm test` includes the release-docs
  checks for markers, changelog, store assets, relative links, skill frontmatter,
  and skill routing;
- `pnpm test:e2e` for browser behaviour (needs `CHROME_BIN`);
- the release workflow on `v*` tags;
- `changelogen` reading Conventional Commits and the latest tag;
- `scripts/release-docs.test.ts`.

Write skills so that following them produces the same result as the tests.

## Compatibility

`AGENTS.md` is the portable layer (Codex, Cursor, Copilot, DSH, and others read
it or a compatible file). `.agents/skills` is supported by DSH and a growing set
of harnesses; tools that do not discover it can still read the skill files
manually. Do not duplicate commands in multiple agent-specific files unless a
tool requires it; edit `AGENTS.md` as the single source of truth.
