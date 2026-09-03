# Test organization

Tests mirror source responsibilities so related coverage stays easy to find.

- `core/`: metadata parsing, indexing, shared types, and errors.
- `graph/model/`: runtime graph construction and loading.
- `graph/renderers/`: renderer adapters, Sigma, G6, Cube, and Canvas behavior.
- `graph/styles/`: graph style resolution and rules.
- `layouts/`: Force, Flow, Arc, HEB, Cube, and Group geometry.
- `interactions/`: keyboard, connection, graph, dock, and drag behavior.
- `settings/`: plugin-wide settings.
- `ui/`: panel and UI helper state.
- `workspace/actions/`: workspace command/action behavior.
- `workspace/controller/`: controller and settings-port coordination.
- `workspace/persistence/`: codecs, autosave, serialization, and theme persistence.
- `workspace/rendering/`: render planning, lifecycle, events, and display sync.
- `workspace/runtime/`: runtime graph and debug snapshots.
- `workspace/services/`: IO-backed workspace services.
- `workspace/state/`: pure workspace state transitions and selectors.

Vitest discovers every nested `*.test.ts` file. Run one category with, for
example, `pnpm exec vitest run src/__tests__/graph/renderers`.
