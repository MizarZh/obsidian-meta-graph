# Workspace state sources

Chart-local style configuration lives only in `charts[].style`.
`getActiveChartStyle(state)` selects the active chart's existing style object; it does
not clone or merge values. A missing active chart remains an invariant error.

The seven former flattened WorkspaceState fields (node/link overrides, unresolved
node/link overrides, plain-link overrides, and node/link rules) are removed. Settings
view ports, style composition, legends, style editor targets and connection previews
read the canonical configuration. Component props can still project individual fields.

Global defaults and global style rules remain workspace-owned. Effective style helpers
combine global values with chart-local values at read time, retaining existing rule
order and fallback semantics. No persisted schema or renderer contract changes.

Reducers own writes:

- Style-only updates clone the incoming style, replace the active chart, and preserve
  references to unrelated charts, query, grouping, display, manual layout and projection.
- Unrelated chart updates retain the current style reference.
- Copying a chart creates an independent style copy; switching selects that chart's style.
- Import/configuration and serialization keep using the existing chart format.

The renderer baseline retains a `chartStyle` reference, along with global style fields.
Style comparison still considers projection-dependent rule matches. Pure style edits
produce style synchronization, not graph reconstruction or layout work.

Snapshots are treated as immutable. Call reducers/controller actions instead of mutating
objects returned by selectors. Other duplicated configuration domains are unchanged and
can be migrated separately after measuring and testing their own read/write paths.
