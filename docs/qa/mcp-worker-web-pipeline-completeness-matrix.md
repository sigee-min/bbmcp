# MCP Worker-Web Pipeline Completeness Matrix

## Scope
- Path: MCP tool registration -> runtime dispatch -> worker native materialization -> gateway snapshot/stream -> web state reflection
- Objects: cube, bone, texture, animation
- CRUD: folder/project create, rename, move, delete (workspace-scoped)

## Tool Chain Matrix
| Domain | MCP Tool(s) | Runtime Mapping Evidence | Worker Usage Evidence | Gateway/Web Reflection Evidence | Contract Tests |
| --- | --- | --- | --- | --- | --- |
| Bone | `add_bone` | `packages/runtime/src/transport/mcp/tools.ts`, `packages/runtime/src/dispatcher/handlerMaps.ts` | `apps/worker/src/nativeJobProcessor.ts` (`materializeProjectGeometry`) | `apps/gateway/src/mappers/dashboardSnapshotMapper.ts` -> `apps/web/src/lib/dashboardModel.ts` | `packages/runtime/tests/toolRegistry.test.ts`, `apps/worker/tests/nativePipelineToolingContract.test.ts`, `apps/gateway/tests/engineBackendNativeE2E.test.ts` |
| Cube | `add_cube` | `packages/runtime/src/transport/mcp/tools.ts`, `packages/runtime/src/dispatcher/handlerMaps.ts` | `apps/worker/src/nativeJobProcessor.ts` (`materializeProjectGeometry`) | `apps/gateway/src/mappers/dashboardSnapshotMapper.ts` -> `apps/web/src/lib/dashboardModel.ts` | `packages/runtime/tests/toolRegistry.test.ts`, `apps/worker/tests/nativePipelineToolingContract.test.ts`, `apps/gateway/tests/engineBackendNativeE2E.test.ts` |
| Animation | `create_animation_clip`, `set_frame_pose` | `packages/runtime/src/transport/mcp/tools.ts`, `packages/runtime/src/dispatcher/handlerMaps.ts` | `apps/worker/src/nativeJobProcessor.ts` (`materializeProjectAnimations`) | `apps/gateway/src/mappers/dashboardSnapshotMapper.ts` -> `apps/web/src/lib/dashboardModel.ts` | `packages/runtime/tests/toolRegistry.test.ts`, `apps/worker/tests/nativePipelineToolingContract.test.ts`, `apps/web/tests/pageAnimationInteraction.test.js` |
| Texture | `paint_faces`, `preflight_texture`, `read_texture` | `packages/runtime/src/transport/mcp/tools.ts`, `packages/runtime/src/dispatcher/handlerMaps.ts` | `apps/worker/src/nativeJobProcessor.ts` (`materializeProjectTextures`, `collectTextureProjection`) | `apps/gateway/src/mappers/dashboardSnapshotMapper.ts` -> `apps/web/src/lib/dashboardModel.ts` | `packages/runtime/tests/toolRegistry.test.ts`, `apps/worker/tests/nativePipelineToolingContract.test.ts`, `apps/gateway/tests/engineBackendNativeE2E.test.ts` |
| Export | `export` | `packages/runtime/src/transport/mcp/tools.ts`, `packages/runtime/src/dispatcher/handlerMaps.ts` | `apps/worker/src/nativeJobProcessor.ts` (`handleGltfConvertJob`) | `apps/gateway/src/services/gateway-dashboard.service.ts` | `apps/worker/tests/nativeJobProcessor.test.ts`, `apps/gateway/tests/engineBackendNativeE2E.test.ts` |

## Folder/Project CRUD Matrix
| CRUD | Gateway Endpoint | Store Operation | Web Mutation Hook | Contract Tests |
| --- | --- | --- | --- | --- |
| Create Folder | `POST /folders` | `createFolder` | `useProjectTreeMutations.onCreateFolder` | `apps/gateway/tests/nativePipelineStore.test.ts` |
| Rename Folder | `PATCH /folders/:folderId` | `renameFolder` | `useProjectTreeMutations.onRenameFolder` | `apps/gateway/tests/nativePipelineStore.test.ts` |
| Move Folder | `POST /folders/:folderId/move` | `moveFolder` | `useProjectTreeMutations.onMoveFolder` | `apps/gateway/tests/nativePipelineStore.test.ts` |
| Delete Folder | `DELETE /folders/:folderId` | `deleteFolder` | `useProjectTreeMutations.onDeleteFolder` | `apps/gateway/tests/nativePipelineStore.test.ts` |
| Create Project | `POST /projects` | `createProject` | `useProjectTreeMutations.onCreateProject` | `apps/gateway/tests/nativePipelineStore.test.ts` |
| Rename Project | `PATCH /projects/:projectId` | `renameProject` | `useProjectTreeMutations.onRenameProject` | `apps/gateway/tests/nativePipelineStore.test.ts` |
| Move Project | `POST /projects/:projectId/move` | `moveProject` | `useProjectTreeMutations.onMoveProject` | `apps/gateway/tests/nativePipelineStore.test.ts` |
| Delete Project | `DELETE /projects/:projectId` | `deleteProject` | `useProjectTreeMutations.onDeleteProject` | `apps/web/tests/pageProjectDeleteHeader.test.js`, `apps/gateway/tests/nativePipelineStore.test.ts` |

## Completion Criteria
- All listed tools are present in runtime registry and worker-required contract.
- Worker job path fails fast with explicit message when required tools are unavailable.
- CRUD operations remain workspace-scoped and do not leak across workspaces.
- Web stream/list/mutation tests keep request/response contracts stable.
