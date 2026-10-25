# Combat Forge

A Foundry Virtual Tabletop **V14** encounter builder for the **D&D5e** game system. Browse installed monsters, balance encounters against your party's current state, keep fights in the Vault, and deploy them to a scene.

![The Forge, shown with mock-world development data](docs/screenshots/forge.png)

<details><summary>Generator, Vault, and Ledger previews</summary>

![Encounter generator](docs/screenshots/generator.png)
![Saved encounters in the Vault](docs/screenshots/vault.png)
![Compendium diagnostics in the Bestiary Ledger](docs/screenshots/ledger.png)
![Correcting metadata without editing the source pack](docs/screenshots/metadata-repair.png)

</details>

## Install

In Foundry's **Add-on Modules → Install Module**, paste this manifest URL:

```text
https://github.com/Hierarchs/Combat-Maker/releases/latest/download/module.json
```

Enable **Combat Forge** in your D&D5e world under **Manage Modules**. Use a D&D5e system release compatible with your installed Foundry V14 version.

Open the builder using the **hammer in Token Controls**, the **Combat Forge button in the Actors directory**, **Configure Settings → Module Settings → Combat Forge**, or **Ctrl+Shift+E** (rebindable). It is a GM tool.

For a manual installation, download `combat-maker.zip` from [Releases](https://github.com/Hierarchs/Combat-Maker/releases), extract its `combat-maker` directory into `Data/modules/`, then restart Foundry. `module.json` must be at `Data/modules/combat-maker/module.json`.

## The Forge

The workspace uses an original parchment-and-ink theme inspired by the classic Oblivion menus: serif type, fine gold borders, engraved controls, and warm paper panels. The layout keeps your party at upper left, encounter and difficulty below, and a searchable monster browser on the right. The Forge, Vault, Ledger, and dialogs share the theme. All textures and ornaments are original SVG/CSS artwork; no game assets or external fonts are required.

1. **Choose a party.** Use the person button or drag character Actors or character tokens into the window. Assigned player characters populate the initial party automatically. Health and resource estimates update when actors, items, effects, or tokens change.
2. **Choose sources.** The books button discovers installed Actor compendiums automatically, or lets you check individual packs, including world and homebrew compendiums. World NPCs are included by default. Indexes load two packs at a time. Full actors are fetched for sheets, uncatalogued encounter sources, drops, deployment, and the Ledger's reference scan; scanning references loads only the actors used by encounters or extra dropped references.
3. **Find monsters.** Search names and books; filter by type, size, book, edition, alignment, environment, legendary status, and fractional CR. Sort columns and page through large catalogues. The eye opens a creature's sheet. Click a row, or focus it and press Enter/Space, to add it. Press `/` inside the window to search.
4. **Build or generate.** Adjust quantities directly or with +/−. The generator targets either party difficulty or **combined CR**, respects bestiary filters, and caps both total monsters and distinct stat blocks. It reports when only a closest match is available. Generation replaces the current draft's monster list.
5. **Read the rating.** Compare the rested party's **Full** rating with the live **Now** estimate. Click the difficulty panel to see all budgets and the calculation.
6. **Save or deploy.** Save a named encounter to the Vault, or place it in the current scene.

### Homebrew and compendium support

Any accessible **D&D5e Actor compendium** can be a source, regardless of its publisher or whether it belongs to a world, module, or system. No integrations with individual publishers are required. Only `npc` Actors with valid CR values (0, 1/8, 1/4, 1/2, and integers 1–30) become usable monster entries. Characters and vehicles are skipped. NPCs with missing or invalid CRs remain available for repair in the Ledger. Failures in one pack do not prevent other packs from loading.

Drop an NPC into the monster list to retain its UUID even when its pack is not selected. Dropping a valid NPC into the encounter panel also adds it to the encounter. An invalid CR opens its metadata repair form. The module does not modify your compendium. Use **Forget manually dropped actor references** in Sources to clear these extra references.

Metadata is read from current and legacy D&D5e fields:

| Filter | Source data |
| --- | --- |
| CR / XP | `system.details.cr`; prepared `system.details.xp.value` when present, otherwise the standard CR table |
| Creature type / swarm | `system.details.type` string or `{value, custom, subtype, swarm}` |
| Size | `system.traits.size` |
| Book | `system.source.book/custom`, legacy `system.details.source`, then pack label |
| Edition | `system.source.rules` (`2014`/`2024`), or an explicit year/SRD version in the book label |
| Environment | Modern `system.details.habitat.value[].type/custom`, or legacy `system.details.environment` |
| Alignment | `system.details.alignment` |
| Legendary | `system.resources.legact.max` or `system.resources.legres.max` |

Unknown metadata stays unknown. The module cannot infer a monster's environment or edition reliably when the source does not supply it. Source authors can optionally override book, edition, and environments with `flags.combat-maker.book`, `flags.combat-maker.edition`, and `flags.combat-maker.environments`. Existing monster documents remain editable through their normal actor sheets.

The package supports D&D5e's data model; other game systems' Actor packs require a separate adapter and are not supported.

## The Bestiary Ledger

Open **The Ledger** to examine catalogue health and repair incomplete entries. Use the quill beside any creature in the Forge to open the same metadata editor directly.

- **Metadata:** Lists the exact NPCs with missing/invalid CR, missing book, unknown edition, or missing environment. Filter by issue, source, name, or saved corrections. A pack's label can still be displayed as a fallback, while the Ledger identifies that an explicit book is missing. Invalid NPCs remain in this report even when they cannot appear in the monster browser.
- **Corrections:** Amend CR, book, edition, environments, creature type, and size. Corrections persist in this world's `combat-maker.catalogRepairs` setting and apply to browsing, filters, encounter loading, and balance calculations. Changing CR recalculates builder XP from the CR table. Unchanged CR preserves any explicit source XP. Blank optional fields use source values; **Reset to source metadata** removes all local corrections for that entry, including its hidden preference.
- **Duplicates:** Identifies possible copies with matching name, CR, edition, creature type, and size. Full stat blocks may still differ. Nothing is merged automatically. **Prefer this copy** keeps one visible and hides the others from browsing and generation; the Hidden section can restore any copy. Existing encounters can still load and deploy hidden source actors. Different editions and CRs stay separate.
- **References:** Checks monster UUIDs used by Vault encounters, the current draft, dropped actors, and saved replacement mappings. Missing sources and actors requiring CR repair are shown with their affected encounters. Available actors in unselected packs are checked without enabling the whole pack.
- **Replacement actors:** Search for an available NPC and explicitly map the missing UUID to it. The mapping applies across Combat Forge in this world, including direct deployment from old Vault entries. It does not rewrite source packs or existing Vault journals. Loading refreshes the creature's metadata; re-saving that encounter stores the new UUID and recalculated rating. If an original source returns later, its browser entry remains suppressed while its replacement mapping is active, so selecting a displayed creature always uses that creature. Remove the mapping under References to restore the original. Mappings can be changed or removed, and cyclic mappings are rejected.

Corrections change catalogue metadata, not the source stat block. Deployment continues to use the actual actor's abilities and statistics. Duplicate suppression is also confined to Combat Forge; it never deletes actors or compendium entries. Normal Foundry world backups include corrections and replacement settings. v1.0 Vault journals and drafts remain compatible with v1.1.

## Difficulty rules

Choose the sliders button to switch encounter rules and the optional estimates independently of each monster's edition.

**2014 official DMG:** Adds each character's level-based Easy/Medium/Hard/Deadly thresholds. Raw XP is multiplied by the standard monster-count ladder, shifted for parties below three or above five characters. The displayed rating is the highest reached threshold. All selected monsters are assumed to contribute meaningfully to the encounter. Awarded XP stays separate from adjusted XP.

**2024 official DMG:** Uses the level-based Low/Moderate/High XP budget **ceilings**, with no official monster-count multiplier. XP at or below the Low budget is Low; above Low through Moderate is Moderate; above Moderate through High is High. Exceeding High is marked **Over budget** as a module advisory, not an additional official category.

**Adjusted swarms (optional house rule):** Uses the 2014 monster-count multiplier ladder in either edition. Creatures worth less than 10% of the strongest creature's XP add their XP but do not increase the count used for that multiplier. This is a documented, deterministic interpretation of weak enemies for large groups; it is not an official WotC rule, and does not change stat blocks or the XP awarded. You may leave it disabled.

**Dynamic party capacity (optional house estimate):** Scales each character's budget before comparing difficulty. The Full rating always uses unmodified level budgets.

- HP loss removes up to 60% of capacity; temporary HP counts up to the maximum HP cap.
- Weighted spell-slot depletion removes up to 30%, scaled by spellcasting-class levels divided by total level. Full, half, third, artificer, and pact progressions are handled. Higher-level slots have proportionately more weight.
- Depleted tracked resources and limited-use feat items remove up to 10%. Modern item `spent` and older `value` storage are supported.
- Exhaustion reduces the remainder by 8% per level, to a 40% factor. Other than incapacitation, final capacity is bounded between 10% and 100%.
- Zero HP, dead, unconscious, incapacitated, or petrified characters contribute no current capacity. Missing resource pools are treated as full.

This model is advisory and cannot know tactics, custom automation, magic-item power, untracked class abilities, terrain, or every special ability. High monster CR relative to party level is flagged. Disable dynamic capacity for the full-strength official rating.

## The Vault

Saved encounters are individual **JournalEntry documents** in **Combat Forge — The Vault**, with GM-only default ownership. They include monster references and metadata, quantities, party snapshots and references, rule choices, save date, and the difficulty at save. No commercial stat blocks are copied into the Vault.

- Click a card's name to inspect monsters and the saved party.
- **Load into Forge** refreshes actor data and party resources so you can edit a previous fight. **Save** updates that encounter; **Save as a new encounter** creates a copy.
- **Deploy** works directly from a card or its detail view.
- Deleting a Vault entry deletes that encounter's journal, leaving its actors and scene tokens in place.

The current draft is saved per client in Foundry settings. World sources, dropped homebrew references, and default rules are world settings. Normal Foundry world backups include the Vault journals and world settings. Each encounter has its own document, so two GMs saving different encounters do not overwrite a shared list. Concurrent edits to the same encounter follow Foundry's normal document update behavior.

## Deployment

Open a scene and choose a point or the center of the current view. Hidden tokens are the default; optionally add them to the scene's active combat, creating one if necessary.

Compendium Actors are imported once, tagged by source UUID, and reused on subsequent deployments. Imported world Actors can be edited normally; later deployments use those edited copies. Tokens are unlinked, hostile, and preserve prototype artwork, wildcard selection, and size. Placement snaps with Foundry's token API and avoids token footprint overlaps within scene bounds, including larger tokens. Wall, region, terrain, and elevation suitability still need GM review. At most 100 monsters can be in one encounter.

Every source is resolved before deployment starts. Missing sources stop the operation with an actionable error. Failed deployment attempts roll back created tokens, newly created combats, and unused imports where possible. If a cleanup operation itself fails, the module reports it so the scene can be checked.

## Development

No build step is required to load the source module in Foundry. For tests and distributable packaging, use Node.js 22 or later:

```sh
npm ci
npm run check
npm test
npm run test:browser
npm run build
```

`npm run test:browser` uses an installed Chrome browser by default. Set `CF_BROWSER_CHANNEL` to an installed Playwright-supported channel, or install Chrome. The development preview uses **mock Foundry documents**, not your world:

```sh
npm run preview
# Open http://127.0.0.1:4314
```

Automated coverage includes official rules examples and boundaries, dynamic readiness, legacy/current metadata, filtering, constrained generation, source failures, homebrew, independent Vault saves, deployment and rollback, metadata repair/reset and source immutability, duplicate preference/restore, missing-reference resolution and cycle rejection, large duplicate scans, browser interactions, and compact Forge/Ledger layouts. Browser fixtures exercise the actual controller and views using a mock adapter. **A live Foundry V14/D&D5e world smoke test is still required for runtime certification.** See [docs/TESTING.md](docs/TESTING.md).

The package uses V14 `ApplicationV2`, the current scene-control record format, namespaced document APIs, UUIDs, compendium indexes, and token snapping. It does not embed the VTT or system runtime. The production ZIP excludes tests, development fixtures, dependencies, and development servers.

## Releases

The GitHub Actions release workflow checks, tests, packages, and publishes `combat-maker.zip` and `module.json` when a `v*` tag is pushed. The tag must match the manifest and package version. Update `module.json`'s download URL with each version, then push the tag. The stable installation URL always points to the latest release's manifest.

## References and license

- [Foundry V14 API](https://foundryvtt.com/api/v14/)
- [Official D&D5e system source](https://github.com/foundryvtt/dnd5e)
- [2014 encounter rules](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/building-combat-encounters)
- [2024 encounter rules](https://www.dndbeyond.com/sources/dnd/br-2024/dms-toolbox)
- [MIT software license](LICENSE) and [SRD attribution](THIRD_PARTY.md)

No monster content is bundled. Your installed compendiums supply the creatures and artwork.
