---
title: "Rigging Guide"
description: "Hierarchy design principles for animation-ready rigs."
summary: "Hierarchy design principles for animation-ready rigs."
---

# Rigging Guide

Good rigging is mostly about hierarchy clarity. A clean tree makes animation predictable, while a flat or inconsistent hierarchy usually creates transform side effects that are hard to debug later.

Start with a root bone and attach every movable part under explicit parents. Build from trunk to branches, for example `root -> body -> head/limbs`, instead of creating disconnected peers.

## Suggested construction pattern

```json
{ "name": "root", "pivot": [0, 0, 0], "ifRevision": { "$ref": { "kind": "tool", "tool": "get_project_state", "pointer": "/project/revision" } } }
```

```json
{ "name": "body", "parent": "root", "pivot": [0, 6, 0], "ifRevision": { "$ref": { "kind": "tool", "tool": "get_project_state", "pointer": "/project/revision" } } }
```

```json
{ "name": "head", "parent": "body", "pivot": [0, 12, 0], "ifRevision": { "$ref": { "kind": "tool", "tool": "get_project_state", "pointer": "/project/revision" } } }
```

## Failure patterns to watch

- `Parent bone not found` means creation order is wrong. Create parents first and retry children.
- `invalid_state_revision_mismatch` means your revision is stale. Refresh with `get_project_state` and replay the mutation.

When rig naming and parenting stay stable, downstream animation authoring becomes faster and much more reusable.
