# @ashfox/backend-engine

Engine backend scaffold for the future Ashfox clean-room runtime.

Current behavior:
- Exposes backend health based on persistence readiness.
- Executes runtime ToolService flows for project mutation and export.
- Supports internal/gecko export writes and cleanroom glTF export via runtime codecs.

This package defines the hand-off point where engine-core execution will be integrated.
