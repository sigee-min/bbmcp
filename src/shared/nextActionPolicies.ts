import type { NextAction, NextActionArgs, NextActionValueRef, ToolPayloadMap, ToolResponse, ToolResultMap } from '../types';
import { ADAPTER_PROJECT_DIALOG_INPUT_REQUIRED } from './messages';

export type NextActionFactories = {
  callTool: (tool: string, args: NextActionArgs, reason: string, priority?: number) => NextAction;
  readResource: (uri: string, reason: string, priority?: number) => NextAction;
  askUser: (question: string, reason: string, priority?: number) => NextAction;
  refTool: (tool: string, pointer: string, note?: string) => NextActionValueRef;
  refUser: (hint: string) => NextActionValueRef;
};

export const buildPreflightNextActions = (
  response: ToolResponse<ToolResultMap['preflight_texture']>,
  factories: NextActionFactories
): NextAction[] | null => {
  if (!response.ok) return null;
  const warningCodes = response.data.warningCodes ?? [];
  const warnings = response.data.warnings ?? [];
  if (
    (!Array.isArray(warningCodes) || warningCodes.length === 0) &&
    (!Array.isArray(warnings) || warnings.length === 0)
  ) {
    return null;
  }
  const actions = [
    factories.readResource(
      'bbmcp://guide/llm-texture-strategy',
      'Warnings present. Review the recovery playbook before painting.',
      1
    )
  ];
  const hasOverlap = warningCodes.includes('uv_overlap');
  const hasScaleMismatch = warningCodes.includes('uv_scale_mismatch');
  const hasTinyRects = warningCodes.includes('uv_rect_small') || warningCodes.includes('uv_rect_skewed');
  if (hasOverlap || hasScaleMismatch) {
    actions.push(
      factories.callTool('get_project_state', { detail: 'summary' }, 'Get latest ifRevision for recovery tools.', 2),
      factories.callTool(
        'auto_uv_atlas',
        { apply: true, ifRevision: factories.refTool('get_project_state', '/project/revision') },
        'Recover from overlap/scale issues by repacking UVs (apply=true), then repaint.',
        3
      ),
      factories.callTool('preflight_texture', { includeUsage: false }, 'Refresh uvUsageId after recovery.', 4)
    );
  }
  if (hasTinyRects) {
    actions.push(
      factories.readResource(
        'bbmcp://guide/texture-workflow',
        'UV rects are tiny or non-square; review mapping and resolution guidance.',
        2
      )
    );
  }
  return actions;
};

export const buildSetFaceUvNextActions = (
  response: ToolResponse<ToolResultMap['set_face_uv']>,
  factories: NextActionFactories
): NextAction[] | null => {
  if (!response.ok) return null;
  const warningCodes = response.data.warningCodes ?? [];
  if (!Array.isArray(warningCodes) || warningCodes.length === 0) return null;
  const hasTinyRects = warningCodes.includes('uv_rect_small') || warningCodes.includes('uv_rect_skewed');
  if (!hasTinyRects) return null;
  return [
    factories.callTool('preflight_texture', { includeUsage: false }, 'Review UV warnings after set_face_uv.', 1),
    factories.readResource(
      'bbmcp://guide/texture-workflow',
      'UV rects are tiny or non-square; review mapping and resolution guidance.',
      2
    )
  ];
};

export const buildEnsureProjectNextActions = (
  payload: ToolPayloadMap['ensure_project'],
  response: ToolResponse<ToolResultMap['ensure_project']>,
  factories: NextActionFactories
): NextAction[] | null => {
  if (response.ok) return null;
  if (response.error.message !== ADAPTER_PROJECT_DIALOG_INPUT_REQUIRED) return null;
  const missingRaw = response.error.details?.missing;
  const missing = Array.isArray(missingRaw) ? missingRaw.filter((item) => typeof item === 'string') : [];
  const missingHint = missing.length > 0 ? missing.join(', ') : 'required fields';
  const fieldsRaw = response.error.details?.fields;
  const fields = fieldsRaw && typeof fieldsRaw === 'object' ? (fieldsRaw as Record<string, unknown>) : null;
  const missingSnapshot =
    fields && missing.length > 0
      ? ` Current values: ${JSON.stringify(Object.fromEntries(missing.map((key) => [key, fields[key]])))}.`
      : '';
  return [
    factories.callTool('get_project_state', { detail: 'summary' }, 'Get latest ifRevision before retrying project creation.', 1),
    factories.askUser(
      `Provide ensure_project.dialog values for: ${missingHint}.${missingSnapshot} Reply with a JSON object only. (Example: {"format":"<id>","parent":"<id>"})`,
      'Project dialog requires input.',
      2
    ),
    factories.callTool(
      'ensure_project',
      {
        ...payload,
        dialog: factories.refUser(`dialog values for ${missingHint}`),
        ifRevision: factories.refTool('get_project_state', '/project/revision')
      },
      'Retry ensure_project with dialog values.',
      3
    )
  ];
};
