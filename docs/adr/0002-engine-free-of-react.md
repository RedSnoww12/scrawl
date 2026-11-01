# 0002. The canvas engine stays free of React

- **Status**: Accepted
- **Date**: 2026-10-31

## Context

Drawing needs to respond on every pointer move: hit-testing, rendering with rough.js, history and snapping. Running that through React state would re-render on every frame and tie the drawing logic to one UI library.

## Decision

Everything in `src/engine/` (the scene model, rendering, input, history, export) is plain TypeScript and never imports React or anything from `src/components/` or `src/lib/`. The React UI in `src/components/` drives the engine through its methods and reads a snapshot of its state.

## Consequences

- The engine can be tested, reused or moved to a worker without the UI.
- New drawing features land in the engine first, then get a button or shortcut in the UI.
- Code that needs both (for example, showing a toast after an export) lives in the component and calls the engine, never the reverse.
