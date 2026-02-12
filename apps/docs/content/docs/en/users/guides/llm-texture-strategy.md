---
title: "LLM Texture Strategy"
description: "Prompting and execution strategy for reliable texture generation loops."
summary: "Prompting and execution strategy for reliable texture generation loops."
---

# LLM Texture Strategy

LLM-assisted texture generation works best when the model follows a tight feedback loop instead of trying to paint everything in one request. The objective is not maximum operation count per call, but maximum visual confidence per iteration.

Use a three-step rhythm: bind texture context, apply one intentional paint operation, and check the result with preview. This cadence keeps outputs explainable and makes rollback or correction cheap.

## Recommended loop

1. Prepare texture context with `assign_texture`.
2. Apply a single paint operation with `paint_faces` or `paint_mesh_face`.
3. Inspect with `render_preview` and decide the next operation.

Repeat until the asset meets style and readability goals.

## Prompting guidance

- Ask the model to describe the next visual intent before generating payload.
- Keep each call scoped to one semantic patch such as base fill, edge trim, highlight, or emblem.
- Prefer progressive layering over dense multi-detail calls.

## Recovery strategy

If validation reports `uv_overlap` or `uv_scale_mismatch`, or a mutation returns an `invalid_state` related to UV safety, pause paint sequencing and allow geometry/UV recovery to settle first. Resume painting only after state is stable again.

If payload validation fails, reduce the request to the strict single-write structure and replay.

This strategy is slower per step but significantly more reliable for long sessions and automated generation pipelines.
