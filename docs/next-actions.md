# Next Actions (`nextActions` and `_meta.nextActions`)

This server can include suggested follow-up actions in tool responses.

- ToolResponse includes `nextActions` at the top level (used by internal calls and the sidecar).
- MCP `tools/call` responses copy that array into `_meta.nextActions`.

`_meta` is MCP-standard metadata and is not part of `structuredContent`.

## Shape

`nextActions` is an array of action objects:
- `call_tool`: ask the client to call another tool
- `read_resource`: fetch a resource URI
- `ask_user`: prompt the user for missing context
- `noop`: a terminal marker (no further action)

`ensure_project` may return `ask_user` actions when the Blockbench new-project dialog requires input. The response includes a missing-field list so the client can fill `ensure_project.dialog` and retry with the same payload.

### MCP response example
```json
{
  "content": [{ "type": "text", "text": "..." }],
  "structuredContent": { "applied": true },
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

### Direct ToolResponse example
```json
{
  "ok": true,
  "data": { "applied": true },
  "nextActions": [
    { "type": "call_tool", "tool": "render_preview", "arguments": { "mode": "fixed" } }
  ]
}
```

### Example: ensure_project dialog retry
```json
{
  "ok": false,
  "error": {
    "code": "invalid_state",
    "message": "Project dialog requires input.",
    "details": { "missing": ["format", "parent"] }
  },
  "nextActions": [
    {
      "type": "ask_user",
      "question": "Provide ensure_project.dialog values for: format, parent. (Example: {\"format\":\"<id>\",\"parent\":\"<id>\"})",
      "reason": "Project dialog requires input."
    }
  ]
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
  "reason": "Recover by re-packing UVs, then preflight and repaint.",
  "priority": 3
}
```
