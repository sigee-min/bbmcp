# Trace Runner (Blockbench + MCP)

This repo supports trace-driven testing by running the same MCP steps against:
1) the real Blockbench adapters, or
2) the BlockbenchSim engine (spec-backed simulator).

The trace runner uses:
- `ToolDispatcherImpl` for tool calls (`list_capabilities`, `preflight_texture`, etc.)

## Why this exists
We want to validate MCP workflows using the same API surface that production uses,
while remaining able to run fully offline tests.

## Usage (conceptual)
1) Build a `ToolService` with either:
   - Blockbench adapters (real runtime), or
   - BlockbenchSimEngine (tests)
2) Create:
   - `ToolDispatcherImpl`
3) Run steps via `runTrace`.

## Capture
You can set `captureState: true` per step to capture the project snapshot after that step.
This makes it easier to compare or record trace diffs.
