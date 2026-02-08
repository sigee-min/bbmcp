# Ashfox Desktop Plugin App

This app is the desktop plugin entry layer.

Current role:
- Own the plugin bundle entrypoint (`apps/plugin-desktop/src/index.ts`).
- Delegate runtime logic to the shared runtime package (`packages/runtime/src`).

Build output is still produced at:
- `dist/ashfox.js`

Migration intent:
- Keep runtime behavior stable while keeping plugin-specific wiring at this app boundary.
