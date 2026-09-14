# Bundle and performance baselines

Recorded starting point: [initial results](initial.md), with [raw measurements](initial.json).

Run from the repository root with installed dependencies:

```bash
pnpm baseline
```

Individual commands: `pnpm baseline:bundle` and `pnpm baseline:performance`.
Reports overwrite `reports/baseline/{bundle,metafile,performance}.json` (ignored by Git).
Copy reports elsewhere before comparing revisions. Run serially on an otherwise idle machine.
No production runtime instrumentation is added by these scripts.

## Bundle measurement

Analysis uses the production esbuild configuration, with minification and no source map,
without writing `main.js`. The report records raw JS bytes, gzip level-9 bytes,
per-package emitted contributions, the 30 largest inputs, and packages resolved from
multiple installation roots. Multiple roots are investigation candidates, not proof of
redundant emitted code. The raw metafile retains all import paths for deeper analysis.

Package contributions exclude esbuild wrapper/banner overhead, reported separately.
Gzip is a transfer-size reference; raw bytes are the installed JS size. This is a JS
baseline, not total release size: CSS, manifest and other assets are excluded.

## CPU measurement

The runner bundles the real TypeScript pipeline into a temporary Node module, runs it,
and removes the temporary file. No browser or Obsidian mocks are used.

A deterministic directed ring has 200/1,000/5,000 nodes and three edges per node
(offsets 1, 7 and 31), with fixed coordinates and default styles. Each operation gets
10 warmups and 40 measured samples. Reports contain nearest-rank p50/p95 and max in ms.
Fixture creation is outside timed sections; graph creation includes allocation.
GC is not forced, so allocation/GC costs and scheduler noise can appear in samples.

Measured operations:

- Style-only change classification with shared topology references.
- Classification after copying topology arrays without changing their contents.
- Render-baseline signature capture.
- Runtime Graphology graph construction.
- In-place style synchronization, alternating default and red node styles.

Assertions check graph counts, style-only/no-topology-change rebuild policy, applied
color and preserved node coordinates. There are no timing pass/fail thresholds yet.
These fixtures do not model conditional rules, groups, dense/parallel graphs, indexing,
ELK, ForceAtlas2, browser paint, input latency or plugin startup.

Before judging a regression, run each revision three times on the same Node version,
hardware and power mode; compare per-operation medians of the three p50/p95 results.
Keep fixture/schema, dependency lock hash and environment metadata with every report.
A working-tree run is explicitly marked dirty; its commit is only the base revision.
Do not treat differences between machines as regressions.

## Obsidian runtime protocol (not yet measured)

Use a dedicated synthetic vault with the same node counts and three metadata links per
note. Keep workspace files, viewport size, device pixel ratio, theme, label settings,
Obsidian/plugin versions and hardware fixed. Save these alongside captures. Test Sigma
and G6 separately; record the chart mode and renderer for each scenario.

Enable Settings -> Community plugins -> Meta Graph -> Performance logs. Existing
`[Meta Graph performance]` records provide five-second aggregate windows. Debug
snapshots also contain refresh/index diagnostics. Active paint interval is an interval
between redraws, not monitor FPS or end-to-end input latency.

| Scenario         | Procedure                                                                 | Evidence                                                                     |
| ---------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Cold open        | Restart Obsidian, open one workspace; repeat five times                   | Performance trace from open to first usable graph; index/refresh diagnostics |
| Style drag       | After layout settles, drag node color for ten seconds; repeat three times | Frame/main-thread trace and performance windows; no layout/rebuild           |
| Flow connections | With automatic relayout off, create ten links then undo ten               | Refresh/layout counts; existing node coordinates remain stable               |
| Chart switch     | Alternate two saved charts twenty times                                   | Switch-to-visible trace; stale renderer errors and retained hosts            |
| Close/reopen     | Warm once, record heap; open/close twenty times, collect GC, record heap  | Retained canvases/listeners/renderer objects and heap trend                  |

Collect traces separately with diagnostics disabled when estimating instrumentation
cost. Do not combine cold and warm results. Keep raw captures; report p50/p95 only when
sample counts support them. Heap snapshots require the same collection procedure and
should be compared by retained objects as well as bytes.

The automated report is a CPU/bundle baseline only. Browser/GPU, startup and memory
results remain pending until this protocol is run in a real Obsidian session.
