# Docs

Reference material for maintainers and agents.

| Document                                             | What it covers                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------------ |
| [architecture.md](architecture.md)                   | Runtime topology, capture pipeline, data model, storage, UI, limitations |
| [privacy.md](privacy.md)                             | What the extension handles, where it stays, your controls                |
| [release-process.md](release-process.md)             | Version bump, changelog, store assets, zip, publish                      |
| [architecture-research.md](architecture-research.md) | The November 2026 research that led to v3 (historical)                   |
| [AGENTS.md](AGENTS.md)                               | Documentation conventions for agents                                     |

Raw UI captures live in [screenshots/](screenshots/); `pnpm store:assets` turns
them into the composed images in [../store/assets/](../store/assets/) that the
README and the store listing use. The store kit itself is
[../store/README.md](../store/README.md).

Historical material: [screenshot-v2.png](screenshot-v2.png) shows the v2
console-based experience, and the v2 source is kept in [../legacy/](../legacy/).
