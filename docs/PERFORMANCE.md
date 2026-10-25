# Performance in v1.3.0

Routine encounter edits previously rebuilt catalogue filters, every saved encounter's derived report, and hidden views. v1.3.0 reuses validated Vault snapshots, catalogue facets/duplicate groups, and sorted search results. Party, quantity, and notification updates replace the sidebar while retaining the bestiary DOM and loaded portraits. Other tabs render only their active content. Focus, pagination, and scroll positions survive updates and tab switches.

Vault snapshots are immutable copies, cached by Journal document in a WeakMap. Replaced encounter flags and document hooks invalidate them; journal names and native folder names are read live. Source repairs and catalogue scans invalidate catalogue/query caches. No cache is stored in a world setting or written back to source compendiums.

NPC HP changes no longer schedule a catalogue scan. Selected characters, their embedded items/effects, and token resource deltas still refresh party capacity; unrelated actors and token movement do not. Actor compendium content changes remain covered by Foundry's [V14 updateCompendium hook](https://foundryvtt.com/api/v14/functions/hookEvents.updateCompendium.html), alongside individual Actor metadata hooks. Manual re-indexing remains available.

Placement uses spatial buckets and direct token-document lookups. Oversized custom footprints fall back to a bounded list, avoiding an enormous bucket allocation. Collision margins, ring-search order, token snapping, deployment limits, and rollback behavior remain unchanged. The generator carries running XP/CR totals, caches search distances, and directly returns the strongest permitted group when the target exceeds the mathematically reachable maximum. Filters and species/count caps still apply.

## Measured results

Same-machine local Windows measurements against v1.2.1 (`e392d84`), using Node 24.18.0 and installed headless Chrome. These are **warm synthetic benchmarks**, not live Foundry server measurements. The browser runs the actual controller and views with mock Foundry documents, 10,026 monsters, and 500 one-wave saved encounters. Each timed redraw forces layout. Engine cases use 10,000 monsters and 500 three-wave encounters. Initialization, compendium/server latency, and first-load cache costs are excluded.

| Workload | v1.2.1 median | v1.3.0 median |
| --- | ---: | ---: |
| Forge redraw, unchanged catalogue/query | 23.7 ms | 1.2 ms |
| Vault redraw | 19.7 ms | 4.3 ms |
| Ledger redraw | 19.3 ms | 1.3 ms |
| Read 500 saved encounters ten times | 402.8 ms | 0.24 ms |
| Catalogue summaries, ten reads | 55.7 ms | <0.01 ms |
| Feasible CR search, 60-monster/4-species caps | 3.8 ms | 4.0 ms |
| Unreachable CR search, same caps | 135.7 ms | 2.2 ms |
| Place 100 tokens around 900 occupied spaces | 48.8 ms | 9.7 ms |

The ordinary feasible search stays around 4 ms; the main generator gain is avoiding futile searches. Cache hits and redraw savings depend on whether sources or filters have changed. Timings vary with hardware, Foundry/system version, other modules, and document sizes. See the [recorded medians and p95 samples](benchmarks/v1.3.0-comparison.json).

## Reproduce and verify

```sh
npm ci
npm run benchmark
npm run benchmark:browser
```

Browser benchmarks require installed Chrome, as does `npm run test:browser`. Set `CF_BROWSER_CHANNEL` for another installed Playwright channel. Each engine case has one warm-up and seven timed samples; each browser view has one warm-up and 25 samples. Optional raw JSON output: `node tools/benchmark.mjs test-results/bench.json` or `node tools/browser-benchmark.mjs test-results/browser-bench.json`. The benchmark tools are development-only and excluded from the module ZIP.

The regression suite verifies cache invalidation and source immutability; incremental generator scores across editions, swarm mode and party sizes; and spatial placement against an independent brute-force oracle, including mixed and huge footprints. Browser checks cover unchanged-row retention, query/catalogue invalidation, focus/scroll/pagination, selective resource hooks, in-place journal edits, and all existing feature workflows. Timing thresholds are intentionally not used as CI pass/fail criteria. Live Foundry V14/D&D5e world testing remains required; follow [TESTING.md](TESTING.md).
