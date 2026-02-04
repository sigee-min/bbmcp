import type { RenderPreviewResult, ToolPayloadMap, ToolResponse, ToolResultMap } from '../../types';
import {
  buildRenderPreviewContent,
  buildRenderPreviewStructured,
  buildTextureContent,
  buildTextureStructured
} from './content';
import { buildEnsureProjectNextActions, buildPreflightNextActions, buildSetFaceUvNextActions } from '../../shared/nextActionPolicies';
import { askUser, callTool, readResource, refTool, refUser } from './nextActions';

const nextActionFactories = { askUser, callTool, readResource, refTool, refUser };

export const attachRenderPreviewContent = (
  response: ToolResponse<RenderPreviewResult>
): ToolResponse<RenderPreviewResult> => {
  if (!response.ok) return response;
  const content = buildRenderPreviewContent(response.data);
  const structuredContent = buildRenderPreviewStructured(response.data);
  if (!content.length) {
    return { ...response, structuredContent };
  }
  return { ...response, content, structuredContent };
};

export const attachTextureContent = (
  response: ToolResponse<ToolResultMap['read_texture']>
): ToolResponse<ToolResultMap['read_texture']> => {
  if (!response.ok) return response;
  const content = buildTextureContent(response.data);
  const structuredContent = buildTextureStructured(response.data);
  if (!content.length) {
    return { ...response, structuredContent };
  }
  return { ...response, content, structuredContent };
};

export const attachPreflightNextActions = (
  response: ToolResponse<ToolResultMap['preflight_texture']>
): ToolResponse<ToolResultMap['preflight_texture']> => {
  if (!response.ok) return response;
  const nextActions = buildPreflightNextActions(response, nextActionFactories);
  return nextActions ? { ...response, nextActions } : response;
};

export const attachSetFaceUvNextActions = (
  response: ToolResponse<ToolResultMap['set_face_uv']>
): ToolResponse<ToolResultMap['set_face_uv']> => {
  if (!response.ok) return response;
  const nextActions = buildSetFaceUvNextActions(response, nextActionFactories);
  return nextActions ? { ...response, nextActions } : response;
};

export const attachEnsureProjectDialogNextActions = (
  payload: ToolPayloadMap['ensure_project'],
  response: ToolResponse<ToolResultMap['ensure_project']>
): ToolResponse<ToolResultMap['ensure_project']> => {
  if (response.ok) return response;
  const nextActions = buildEnsureProjectNextActions(payload, response, nextActionFactories);
  return nextActions ? { ...response, nextActions } : response;
};

export const decorateToolResponse = (
  toolName: string,
  payload: unknown,
  response: ToolResponse<unknown>
): ToolResponse<unknown> => {
  if (toolName === 'render_preview') {
    return attachRenderPreviewContent(response as ToolResponse<RenderPreviewResult>);
  }
  if (toolName === 'read_texture') {
    return attachTextureContent(response as ToolResponse<ToolResultMap['read_texture']>);
  }
  if (toolName === 'preflight_texture') {
    return attachPreflightNextActions(response as ToolResponse<ToolResultMap['preflight_texture']>);
  }
  if (toolName === 'set_face_uv') {
    return attachSetFaceUvNextActions(response as ToolResponse<ToolResultMap['set_face_uv']>);
  }
  if (toolName === 'ensure_project') {
    return attachEnsureProjectDialogNextActions(
      payload as ToolPayloadMap['ensure_project'],
      response as ToolResponse<ToolResultMap['ensure_project']>
    );
  }
  return response;
};
