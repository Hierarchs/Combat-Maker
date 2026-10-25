# Validation and live smoke test

The module is implemented against the public Foundry V14 API and current/legacy D&D5e data fields. Automated tests run independently of the proprietary Foundry runtime. Passing them does not certify compatibility with every system release or third-party compendium.

## Automated verification

Run `npm run check`, `npm test`, `npm run test:browser`, and `npm run build`. Browser tests use mock world documents and installed Chrome; no real world data is read or changed. Screenshots are saved to `test-results/` for visual review. The ZIP is built with production files only.

## In a disposable Foundry V14 D&D5e world

1. Install the packaged module, enable it, reload, and inspect the browser console for errors.
2. Open the hammer from Token Controls and the Actors directory. Verify GM-only access and Ctrl+Shift+E. Close/reopen and confirm draft restoration.
3. Add mixed-level characters, including a full caster, a half caster, a warlock, and a martial. Change HP, spell slots, limited-use features, exhaustion, and incapacitation while the builder is open. Check the explanation panel and toggle dynamic estimates off.
4. Index a system Actor pack, a module Actor pack, and a custom world Actor pack. Exercise both automatic discovery and explicit pack selection. Ensure failed or unavailable sources produce a useful message.
5. Filter every exposed field; test fractional CRs and unknown metadata. Drop a valid homebrew NPC, a character, and an invalid-CR NPC. Confirm source packs are not changed.
6. Generate by each 2014 and 2024 difficulty, and by combined CR. Restrict type/environment/book/edition/size and monster/species limits. Test empty filter results and unreachable targets.
7. Save, inspect, load, edit, update, copy, and delete Vault entries. Reload the world and confirm persistence. Verify saved cards show the saved rating while loaded encounters use live party data.
8. Deploy hidden and visible tokens near the view center and a clicked point, with and without combat. Test Small, Large, Huge, and wildcard tokens on square, hex, and gridless scenes. Check token footprints, prototype appearance, unlinked health, combat membership, and reused imports.
9. Test Escape cancellation of point selection, missing source actors, a full scene, and scene switching during deployment. Confirm errors do not leave partial deployments; inspect rollback notifications if a server operation is rejected.
10. Resize to a compact window around 1060×610 and verify party/monster scrolling, filters, generator, Vault details, and deployment controls remain usable. Test a different Foundry theme and normal module combinations.
11. Open the Ledger with a locked compendium containing invalid CRs, unknown editions, missing source books, and missing habitats. Repair each field; verify filtering and XP change while source documents and pack locks remain unchanged. Reload to verify persistence, then reset to source metadata.
12. Review duplicate candidates across packs and editions. Prefer one copy and restore it through Hidden; verify no source actors are removed and existing encounters still resolve hidden copies.
13. Remove a source used by a saved encounter. Scan references, explicitly map it to another NPC, then load and deploy the old encounter directly from the Vault. Remove the mapping and verify it becomes broken again. Test unavailable replacement targets and a rejected mapping loop.
14. Check the parchment theme in all four views and dialogs, including keyboard focus, errors, scrollbars, compact Ledger tables, and the native Foundry window frame.
15. Load a v1.0/v1.1 journal and verify it becomes one opening wave without an immediate journal write. Save a multi-wave encounter, reload, and check names, triggers, order, quantities, notes, per-wave difficulty, and peak-wave summary.
16. Search the Vault by encounter notes, a wave trigger, a monster, and multiple terms. Combine folder/tag filters and sorting. Create, rename, move into, and delete a native Vault folder; verify deleting it keeps its encounters and unrelated journals block deletion.
17. Export one encounter and filtered matches, then import from both file and pasted JSON. Review the preview, duplicate-name copy behavior, folder reuse, preserved notes/waves, malformed and oversized files, and recovery after a denied journal write.
18. Deploy two waves into an already-started combat. Roll initiative for only the arriving group, verify existing scores and the current combatant are preserved, and verify hidden group's rolls are GM-private. Test a denied initiative operation and ensure only that deployment is cleaned up.
19. Remove an encounter source and verify an automatic repair dialog appears on both load and deployment. Map a replacement, return to the Forge or resume deployment, and cancel the repair dialog without leaving a stale prompt.
20. Generate recommendations using both editions, exhausted/full parties, strict filters, and a sparse catalogue. Confirm every creature exists in enabled sources, closest matches are labelled, caps are respected, reinforcement waves are independent, saved rankings use live party budgets, and changed inputs prompt a refresh.
21. At a compact window size, verify the active wave's creature list retains usable visible scrolling space alongside its controls and the deployment button. Check the new Vault sidebar and Recommended view for horizontal overflow.

Review dynamic/swarm estimates with your table; these modes intentionally use documented house formulas rather than claiming to be official balance rules.
