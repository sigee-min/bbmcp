---
title: "Vision Fallback"
description: "Image-handling fallback strategy for clients that cannot consume inline image payloads."
summary: "Image-handling fallback strategy for clients that cannot consume inline image payloads."
---

# Vision Fallback

The preferred integration path is to consume image payloads directly from `render_preview` and `read_texture`. Some clients, however, cannot process inline image blocks reliably. For those environments, Ashfox provides a file-based fallback.

When fallback mode is needed, request snapshots with `saveToTmp: true`, then upload those files through your client's supported file channel.

## Preview snapshot example

```json
{
  "mode": "fixed",
  "output": "single",
  "angle": [30, 45, 0],
  "saveToTmp": true,
  "tmpPrefix": "preview"
}
```

## Texture snapshot example

```json
{
  "name": "pot_wood",
  "saveToTmp": true,
  "tmpPrefix": "texture"
}
```

Snapshots are written under `<project_root>/.ashfox/tmp`. Treat this directory as transient storage. Remove files after upload to avoid stale references and unnecessary disk growth.

Use this fallback only when required by client constraints. Direct image transport remains the cleaner and faster path whenever available.

