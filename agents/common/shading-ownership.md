# ashfox Shading Ownership

## Principle
Shading algorithm ownership is in MCP server logic.
Skill logic must not duplicate server shading implementation.

## Why
- Prevents split-brain behavior between skill and server.
- Keeps one source of truth for shading quality and regression fixes.
- Reduces drift when server shading logic evolves.

## Skill responsibilities
- Select style intent and shading policy.
- Request server-side shading path.
- Verify output quality through preview and rubric.
- Escalate with evidence when server output violates expectations.

## Server responsibilities
- Apply deterministic shading algorithm.
- Expose stable params and predictable defaults.
- Provide enough metadata for quality verification and debugging.

## Failure handling
- If output is wrong, first validate inputs and revision chain.
- If inputs are valid and defect persists, file QA report with raw payloads and traces.

