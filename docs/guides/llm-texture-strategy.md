# LLM Texture Strategy (Summary)

Primary flow:
1) assign_texture
2) preflight_texture
3) set_face_uv
4) preflight_texture again
5) generate_texture_preset
6) render_preview

Recovery loop:
- validate reports uv_scale_mismatch / uv_overlap, or a mutation returns invalid_state about overlap/scale/uvUsageId:
  - auto_uv_atlas (apply=true)
  - preflight_texture again
  - repaint

Failure examples:

1) uvUsageId mismatch (invalid_state):
- Call preflight_texture WITHOUT texture filters.
- Retry generate_texture_preset with the new uvUsageId.

2) UV overlap / UV scale mismatch (invalid_state):
- Run auto_uv_atlas (apply=true).
- Repaint using the refreshed mapping.

See full guide in docs/llm-texture-strategy.md.
