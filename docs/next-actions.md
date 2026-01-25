# Next Actions (`_meta.nextActions`)

This server can include suggested follow-up actions in MCP tool results under `_meta.nextActions`.

`_meta` is an MCP-standard metadata field (not part of `structuredContent`).

## Shape

`nextActions` is an array of action objects:

- `call_tool`: ask the client to call another tool
- `read_resource`: fetch a resource URI
- `ask_user`: prompt the user for missing context
- `noop`: a terminal marker (no further action)

Example:

```json
{
  "_meta": {
    "nextActions": [
      {
        "type": "read_resource",
        "uri": "bbmcp://guide/texture-workflow",
        "reason": "Review the recommended workflow.",
        "priority": 1
      },
      {
        "type": "call_tool",
        "tool": "get_project_state",
        "arguments": { "detail": "summary" },
        "reason": "Fetch the latest revision before mutations.",
        "priority": 2
      }
    ]
  }
}
```

## Argument References (`$ref`)

Some nextActions require values that are not yet known at the time the server emits the suggestion (for example `ifRevision`, `uvUsageId`, or a list of cube names).

Historically this project used placeholder strings like `"<from get_project_state>"`. This project now uses a structured reference form:

### Reference to another tool's output

```json
{
  "$ref": {
    "kind": "tool",
    "tool": "get_project_state",
    "pointer": "/project/revision"
  }
}
```

- `tool`: the tool that must be called first
- `pointer`: a JSON Pointer into that tool's `structuredContent`

### Reference to user input

```json
{
  "$ref": {
    "kind": "user",
    "hint": "cubeNames (or \"all\" if safe)"
  }
}
```

## Example: Revision-gated follow-up

```json
{
  "type": "call_tool",
  "tool": "auto_uv_atlas",
  "arguments": {
    "apply": true,
    "ifRevision": {
      "$ref": { "kind": "tool", "tool": "get_project_state", "pointer": "/project/revision" }
    }
  },
  "reason": "Recover by repacking UVs, then repaint.",
  "priority": 3
}
```
