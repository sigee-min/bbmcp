# Public Release Checklist

Use this checklist before publishing a release or major public update.

## 1. Quality Gate
- [ ] `npm install`
- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm run quality`
- [ ] Confirm no failing or skipped critical tests

## 2. Behavior Validation
- [ ] Validate key MCP flows end-to-end:
  - [ ] project lifecycle (`ensure_project`, `get_project_state`, `validate`)
  - [ ] modeling (`add_bone`, `add_cube`, `update_cube`)
  - [ ] texturing (`assign_texture`, `paint_faces`, `paint_mesh_face`)
  - [ ] animation (`create_animation_clip`, `set_frame_pose`)
  - [ ] preview/export (`render_preview`, `export`)
- [ ] Check revision guard behavior (`ifRevision`) for mutation tools
- [ ] Confirm viewport refresh behavior after mutations

## 3. Docs and Schema Consistency
- [ ] `README.md` and any localized README files reflect current behavior
- [ ] `docs/guides/` reflect current payloads and constraints
- [ ] MCP schemas and examples match implementation
- [ ] Breaking changes and migration notes documented

## 4. Repository Hygiene
- [ ] No debug logs, temp files, or local-only artifacts
- [ ] Generated files are up to date
- [ ] License and governance docs are present:
  - [ ] `LICENSE`
  - [ ] `SECURITY.md`
  - [ ] `CONTRIBUTING.md`
  - [ ] `CODE_OF_CONDUCT.md`
  - [ ] `SUPPORT.md`

## 5. Release Metadata
- [ ] Changelog or release notes summarize:
  - [ ] new features
  - [ ] fixes
  - [ ] known limitations
- [ ] Version/tag is updated consistently
- [ ] Final smoke test on a clean environment
