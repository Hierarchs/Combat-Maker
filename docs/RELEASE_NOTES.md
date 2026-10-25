Combat Forge v1.3.0 — faster encounter editing, Vault browsing, and crowded deployments.

- Reuses catalogue queries, facets, duplicate groups, and immutable Vault snapshots with invalidation on edits and repairs.
- Retains the unchanged bestiary table during party/quantity updates, renders only the active view, and preserves focus, pagination, and scroll positions.
- NPC HP changes no longer rebuild the compendium catalogue; unrelated actors and token movement no longer refresh the selected party. Party resource, item, effect, and synthetic-token updates remain live.
- Spatial indexing speeds placement on crowded scenes while preserving collision checks, snapping, and deployment rollback. Huge custom footprints use a bounded fallback.
- Generator reuses running totals and detects mathematically unreachable targets before searching. Filters, count caps, and official/swarm scoring remain enforced.
- Local warm mock-world benchmark: 10,026 monsters and 500 encounters; Forge redraw 23.7 → 1.2 ms, Vault 19.7 → 4.3 ms, Ledger 19.3 → 1.3 ms. Crowded 100-token placement 48.8 → 9.7 ms. These are synthetic measurements, not live-world guarantees. See docs/PERFORMANCE.md for methodology and raw results.
- 57 engine/integration tests plus full Chrome workflows, including new cache, hook, DOM-retention, focus, pagination, and collision-oracle checks. Live Foundry V14/D&D5e world testing remains pending.

The parchment interface, Vault organization/JSON transfer, waves, initiative, source repairs, and recommendations remain available. No migration or new settings are required.

Install or update through Foundry using:

`https://github.com/Hierarchs/Combat-Maker/releases/latest/download/module.json`

Requires Foundry VTT 14 and a compatible D&D5e game system. No monster content is bundled; your installed compendiums provide it. See the README for setup, documented estimates, and limitations.
