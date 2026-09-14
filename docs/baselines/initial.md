# Initial baseline

Base revision: `7d2bd93318a8505aa508520d71cf6cb69dda982b`. Working tree includes baseline tooling; see [raw records](initial.json) for timestamps, machine and lock hash.

JS: **5,793,933 bytes**; gzip level 9: **1,665,909 bytes**. Analysis and production build sizes matched.

| Contribution    | Emitted bytes | Share of JS |
| --------------- | ------------: | ----------: |
| elkjs           |     1,483,139 |      25.60% |
| three           |     1,384,785 |      23.90% |
| (project)       |       881,187 |      15.21% |
| @antv/g6        |       319,033 |       5.51% |
| @antv/g-lite    |       225,469 |       3.89% |
| html2canvas     |       209,743 |       3.62% |
| @antv/component |       163,134 |       2.82% |
| @antv/layout    |       117,008 |       2.02% |
| sigma           |        97,553 |       1.68% |
| svelte          |        76,071 |       1.31% |

Package figures are direct emitted contributions, not full transitive feature costs. ELK and Three.js together account for 49.50% of JS. G6-related transitive packages are listed separately; do not count them twice.

## CPU results

Three serial runs; values below are medians of the three per-run percentiles. Default styles, fixed positions, 3 edges/node. Units: ms.

| Nodes | Operation                |    p50 |     p95 |
| ----: | ------------------------ | -----: | ------: |
|   200 | classify-style           |  0.535 |   0.994 |
|   200 | classify-copied-topology |  0.312 |   0.673 |
|   200 | capture-render-baseline  |  0.264 |   0.501 |
|   200 | create-runtime-graph     |  1.568 |   3.825 |
|   200 | sync-runtime-styles      |  0.656 |   1.250 |
|  1000 | classify-style           |  0.513 |   1.138 |
|  1000 | classify-copied-topology |  2.018 |   3.178 |
|  1000 | capture-render-baseline  |  1.927 |   3.154 |
|  1000 | create-runtime-graph     |  8.712 |  10.860 |
|  1000 | sync-runtime-styles      |  2.166 |   2.740 |
|  5000 | classify-style           |  6.977 |   8.983 |
|  5000 | classify-copied-topology | 11.733 |  13.085 |
|  5000 | capture-render-baseline  | 10.617 |  11.392 |
|  5000 | create-runtime-graph     | 71.816 | 265.713 |
|  5000 | sync-runtime-styles      | 16.699 |  18.489 |

Graph construction shows substantial tail latency in this environment. GC/allocation and scheduling are included; this measurement does not identify the cause. Do not use these figures as browser frame times or cross-machine thresholds.

## Follow-up candidates

- Inspect ELK and Three.js import contributions before changing bundling.
- Investigate multiple package roots in the raw bundle report; repeated roots alone do not establish removable duplication.
- Profile signature capture, copied-topology classification, and graph allocation at 5,000 nodes.
- Complete the [Obsidian runtime protocol](README.md#obsidian-runtime-protocol-not-yet-measured) before drawing startup, rendering or memory conclusions.

Obsidian runtime measurements were not available in this execution environment and remain unmeasured.
