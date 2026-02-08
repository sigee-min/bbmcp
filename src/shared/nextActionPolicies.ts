import type { NextAction, NextActionArgs, NextActionValueRef, ToolPayloadMap, ToolResponse, ToolResultMap } from '@ashfox/contracts/types/internal';
import { ADAPTER_PROJECT_DIALOG_INPUT_REQUIRED } from './messages';

export type NextActionFactories = {
  callTool: (tool: string, args: NextActionArgs, reason: string, priority?: number) => NextAction;
  readResource: (uri: string, reason: string, priority?: number) => NextAction;
  askUser: (question: string, reason: string, priority?: number) => NextAction;
  refTool: (tool: string, pointer: string, note?: string) => NextActionValueRef;
  refUser: (hint: string) => NextActionValueRef;
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

