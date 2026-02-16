# @ashfox/backend-core

Shared backend contracts for Ashfox multi-runtime orchestration.

Current scope:
- Backend port interface (`BackendPort`)
- Backend registry (`BackendRegistry`)
- Project lock manager (`ProjectLockManager`)
- Tool error helper (`backendToolError`)
- Persistence ports (`ProjectRepository`, `BlobStore`) and provider health contracts
- Queue/project/stream store contracts (`QueueStorePort`, `ProjectSnapshotStorePort`, `StreamEventStorePort`)

This package is runtime-agnostic and intentionally does not depend on Blockbench globals.
