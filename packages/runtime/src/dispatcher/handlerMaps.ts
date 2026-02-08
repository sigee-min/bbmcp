import type {
  ToolName,
  ToolPayloadMap,
  ToolResultMap,
  ToolResponse,
  WithState
} from '@ashfox/contracts/types/internal';
import type { UsecaseResult } from '../usecases/result';
import { ToolService } from '../usecases/ToolService';
import { toToolResponse } from '../shared/tooling/toolResponse';

export type BaseResult<K extends ToolName> = K extends ToolName
  ? ToolResultMap[K] extends WithState<infer R>
    ? R
    : ToolResultMap[K]
  : never;

export const STATEFUL_TOOL_NAMES = [
  'paint_faces',
  'paint_mesh_face',
  'ensure_project',
  'delete_texture',
  'assign_texture',
  'add_bone',
  'update_bone',
  'delete_bone',
  'add_cube',
  'update_cube',
  'delete_cube',
  'add_mesh',
  'update_mesh',
  'delete_mesh',
  'create_animation_clip',
  'update_animation_clip',
  'delete_animation_clip',
  'set_frame_pose',
  'set_trigger_keyframes',
  'export',
  'validate',
  'render_preview'
] as const;

export type StatefulToolName = typeof STATEFUL_TOOL_NAMES[number];

export const isStatefulToolName = (name: ToolName): name is StatefulToolName =>
  (STATEFUL_TOOL_NAMES as readonly string[]).includes(name);

export type StatefulHandlerMap = Partial<{
  [K in StatefulToolName]: (payload: ToolPayloadMap[K]) => UsecaseResult<BaseResult<K>> | Promise<UsecaseResult<BaseResult<K>>>;
}>;

export type ResponseHandlerMap = Partial<{
  [K in ToolName]: (payload: ToolPayloadMap[K]) => ToolResponse<ToolResultMap[K]>;
}>;

export const createHandlerMaps = (args: {
  service: ToolService;
  respondOk: <T>(data: T) => ToolResponse<T>;
  logGuardFailure: <T>(tool: ToolName, payload: ToolPayloadMap[ToolName], response: ToolResponse<T>) => ToolResponse<T>;
  handleTraceLogExport: (payload: ToolPayloadMap['export_trace_log']) => ToolResponse<ToolResultMap['export_trace_log']>;
  handleRenderPreview: (payload: ToolPayloadMap['render_preview']) => ToolResponse<ToolResultMap['render_preview']>;
}) => {
  const statefulRetryHandlers: StatefulHandlerMap = {
    paint_faces: (payload) => args.service.paintFaces(payload),
    paint_mesh_face: (payload) => args.service.paintMeshFace(payload),
    ensure_project: (payload) => args.service.ensureProject(payload),
    delete_texture: (payload) => args.service.deleteTexture(payload),
    assign_texture: (payload) => args.service.assignTexture(payload),
    add_bone: (payload) => args.service.addBone(payload),
    update_bone: (payload) => args.service.updateBone(payload),
    delete_bone: (payload) => args.service.deleteBone(payload),
    add_cube: (payload) => args.service.addCube(payload),
    update_cube: (payload) => args.service.updateCube(payload),
    delete_cube: (payload) => args.service.deleteCube(payload),
    add_mesh: (payload) => args.service.addMesh(payload),
    update_mesh: (payload) => args.service.updateMesh(payload),
    delete_mesh: (payload) => args.service.deleteMesh(payload),
    create_animation_clip: (payload) => args.service.createAnimationClip(payload),
    update_animation_clip: (payload) => args.service.updateAnimationClip(payload),
    delete_animation_clip: (payload) => args.service.deleteAnimationClip(payload),
    set_frame_pose: (payload) => args.service.setFramePose(payload),
    set_trigger_keyframes: (payload) => args.service.setTriggerKeyframes(payload)
  };

  const statefulHandlers: StatefulHandlerMap = {
    export: (payload) => args.service.exportModel(payload),
    validate: (payload) => args.service.validate(payload)
  };

  const responseHandlers: ResponseHandlerMap = {
    list_capabilities: () => args.respondOk(args.service.listCapabilities()),
    get_project_state: (payload) =>
      args.logGuardFailure(
        'get_project_state',
        payload,
        toToolResponse(args.service.getProjectState(payload))
      ),
    read_texture: (payload) =>
      args.logGuardFailure(
        'read_texture',
        payload,
        toToolResponse(args.service.readTextureImage(payload))
      ),
    export_trace_log: (payload) =>
      args.logGuardFailure('export_trace_log', payload, args.handleTraceLogExport(payload)),
    reload_plugins: (payload) =>
      args.logGuardFailure('reload_plugins', payload, toToolResponse(args.service.reloadPlugins(payload))),
    render_preview: (payload) => args.logGuardFailure('render_preview', payload, args.handleRenderPreview(payload))
  };

  return { statefulRetryHandlers, statefulHandlers, responseHandlers };
};

