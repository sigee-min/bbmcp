# Block Pipeline (bbmcp)

## Goal
Generate Minecraft block assets (blockstates + models + item models) with a single MCP tool call.

## Tool
`block_pipeline`

### Minimal request
```json
{
  "name": "adamantium_ore",
  "texture": "adamantium_ore"
}
```

### Variants + namespace
```json
{
  "name": "adamantium_ore",
  "texture": "adamantium_ore",
  "variants": ["block", "slab", "stairs", "wall"],
  "namespace": "mymod"
}
```

### With Blockbench base model
```json
{
  "name": "adamantium_ore",
  "texture": "adamantium_ore",
  "mode": "with_blockbench",
  "ifRevision": { "$ref": { "kind": "tool", "tool": "get_project_state", "pointer": "/project/revision" } }
}
```
Notes:
- Creates a new Java Block/Item project named after `name`.
- Adds a base 16x16x16 cube; textures are not imported automatically.

## Output (structuredContent)
- `applied: true`
- `steps.generate.resources` count
- `assets.blockstates` map (e.g., `adamantium_ore`, `adamantium_ore_slab`, ...)
- `assets.models` map (e.g., `block/adamantium_ore`, `block/adamantium_ore_stairs`, ...)
- `assets.items` map (e.g., `item/adamantium_ore`, `item/adamantium_ore_slab`, ...)
- `resources[]` list with MCP URIs for each JSON file

## Resources
Use MCP resources to fetch JSON:
- `bbmcp://blockstate/{namespace}/{name}`
- `bbmcp://model/block/{namespace}/{name}`
- `bbmcp://model/item/{namespace}/{name}`

Call `resources/list` to enumerate and `resources/read` with the URI to fetch content.

## Resource Templates
`resources/templates/list` returns the same URI patterns:
- `bbmcp://blockstate/{namespace}/{name}`
- `bbmcp://model/block/{namespace}/{name}`
- `bbmcp://model/item/{namespace}/{name}`
