# ReqID Trace Matrix (Spec v1)

This matrix maps requirement IDs (ReqIDs) to automated evidence in this repo.

## Authoring Profile / Guard

- SPEC-PRO-001~005:
  - /Users/sigee/Dev/ashfox/packages/runtime/tests/projectCreation.test.ts
  - /Users/sigee/Dev/ashfox/packages/runtime/tests/projectLifecycleService.test.ts

## Export Codec / Fallback

- SPEC-EXP-001~007:
  - /Users/sigee/Dev/ashfox/packages/runtime/tests/exportService.test.ts
  - /Users/sigee/Dev/ashfox/packages/runtime/tests/exporters.test.ts
  - /Users/sigee/Dev/ashfox/packages/runtime/tests/oracleRunner.test.ts (FX-001~007)

- SPEC-EXP-008 (glTF must be internal cleanroom codec):
  - /Users/sigee/Dev/ashfox/packages/runtime/tests/exportService.test.ts
  - /Users/sigee/Dev/ashfox/packages/runtime/tests/genericModelGltfWorkflow.test.ts
  - /Users/sigee/Dev/ashfox/packages/runtime/tests/oracleRunner.test.ts (FX-007)

- SPEC-EXP-010~014 (gecko_geo_anim sidecar):
  - /Users/sigee/Dev/ashfox/packages/runtime/tests/oracleRunner.test.ts
    - FX-001 (basic geo+anim)
    - FX-002 (triggers)
    - FX-003 (object-form keyframe)
    - FX-006 (fallback export path)

## Animation Meta Preservation

- SPEC-ANM-001~004:
  - /Users/sigee/Dev/ashfox/packages/runtime/tests/oracleRunner.test.ts (FX-003)

## No-Render Profile

- SPEC-DAT-001~004:
  - /Users/sigee/Dev/ashfox/packages/runtime/tests/oracleRunner.test.ts (FX-006)

## Oracle / Acceptance Gates

- ORC-001~004:
  - /Users/sigee/Dev/ashfox/packages/runtime/tests/oracleRunner.test.ts (JSON structural diff + tolerance + time buckets)

- ORC-005:
  - /Users/sigee/Dev/ashfox/packages/runtime/tests/oracleRunner.test.ts (FX-007, data URI sha256 compare)

- PASS-001~004:
  - /Users/sigee/Dev/ashfox/packages/runtime/tests/oracleRunner.test.ts (FX-001~007, deterministic hash check)
