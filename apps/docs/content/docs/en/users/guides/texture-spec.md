---
title: "Texture and UV Behavior"
description: "Operational expectations for texture mapping, UV integrity, and paint requests."
summary: "Operational expectations for texture mapping, UV integrity, and paint requests."
---

# Texture and UV Behavior

This document explains how texture operations are expected to behave during normal production use. It is written as an operational guide rather than a schema dump so teams can make consistent decisions while modeling and painting.

Ashfox uses per-face UV mapping and keeps UV management internal. In practice, this means you focus on texture intent and paint operations, while atlas placement and remapping logic are handled by the runtime.

## What to treat as invariants

1. UV overlap is treated as an error condition.
2. UV scale mismatch is treated as an error condition.
3. Per-face density is derived from project `uvPixelsPerBlock` (default `16`).
4. Paint requests are single-write by design, with one target and one operation.

## Request-shape expectations

`paint_faces` and `paint_mesh_face` are strict about payload shape. Legacy multi-write fields like `targets` or `ops` should not be used. If you want multiple visual edits, submit them as a sequence of intentional single operations.

For mesh painting, `scope` can be `single_face` or `all_faces`. If omitted, it is inferred from whether `target.faceId` is present.

## Coordinate strategy

Default coordinate space is `face`, which is usually what you want for local paint intent. Use `coordSpace: "texture"` only when you need absolute texture-space control, and provide explicit `width` and `height` that match the texture.

`fill_rect` shading is enabled by default to provide deterministic tonal variation. Disable it with `shade: false` when flat color is required.

## Practical implication

When geometry changes, auto-UV and texture reprojection may run internally. Plan your texture pass as an iterative process with frequent preview checks instead of assuming layout remains fixed after early modeling.
