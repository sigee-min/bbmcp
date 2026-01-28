import type { NextAction } from '../types';
import { askUser, callTool, readResource, refTool, refUser } from '../mcp/nextActions';
import {
  MODELING_WORKFLOW_WARNING_REASON,
  PREVIEW_REASON_DEFAULT,
  PREVIEW_STATE_REASON,
  CLARIFICATION_REASON_DEFAULT,
  TEXTURE_ASSIGN_ASK_REASON_DEFAULT,
  TEXTURE_ASSIGN_MISSING_REASON,
  TEXTURE_ASSIGN_QUESTION,
  TEXTURE_ASSIGN_REASON_DEFAULT,
  TEXTURE_WORKFLOW_GUIDE_REASON_DEFAULT,
  VALIDATE_REASON_DEFAULT
} from '../shared/messages';

type TextureLabelSource = { name?: string; targetName?: string; targetId?: string };

export const collectTextureLabels = (entries: TextureLabelSource[] | undefined | null): string[] =>
  (Array.isArray(entries) ? entries : [])
    .map((entry) => entry.name ?? entry.targetName ?? entry.targetId ?? '')
    .filter((label) => label.length > 0);

export const buildValidateNextActions = (
  reason: string = VALIDATE_REASON_DEFAULT,
  priority: number = 5
): NextAction[] => [callTool('validate', {}, reason, priority)];

export const buildPreviewNextActions = (
  reason: string = PREVIEW_REASON_DEFAULT,
  priorityBase: number = 10,
  options?: { includeStateFetch?: boolean }
): NextAction[] => {
  const includeStateFetch = options?.includeStateFetch ?? true;
  const actions: NextAction[] = [];
  if (includeStateFetch) {
    actions.push(
      callTool('get_project_state', { detail: 'summary' }, PREVIEW_STATE_REASON, priorityBase)
    );
  }
  actions.push(
    callTool(
      'render_preview',
      { mode: 'fixed', output: 'single', angle: [30, 45, 0], ifRevision: refTool('get_project_state', '/project/revision') },
      reason,
      priorityBase + (includeStateFetch ? 1 : 0)
    )
  );
  return actions;
};

export const buildTextureAssignNextActions = (options: {
  textureLabels?: string[];
  includeAssignTool?: boolean;
  includeGuide?: boolean;
  guideReason?: string;
  askQuestion?: string;
  askReason?: string;
  priorityBase?: number;
}): NextAction[] => {
  const labels = Array.isArray(options.textureLabels) ? options.textureLabels : [];
  const unique = Array.from(new Set(labels)).filter((label) => label.length > 0).slice(0, 5);
  const labelHint = unique.length > 0 ? unique.join(', ') : 'the new texture(s)';
  const question = options.askQuestion ?? TEXTURE_ASSIGN_QUESTION(labelHint);
  const reason = options.askReason ?? TEXTURE_ASSIGN_REASON_DEFAULT;
  const priorityBase = options.priorityBase ?? 1;

  const actions: NextAction[] = [];
  if (options.includeGuide !== false) {
    actions.push(
      readResource(
        'bbmcp://guide/texture-workflow',
        options.guideReason ?? TEXTURE_WORKFLOW_GUIDE_REASON_DEFAULT,
        priorityBase
      )
    );
  }
  actions.push(
    callTool('get_project_state', { detail: 'full' }, 'Get cube names and latest ifRevision for assignment/preview.', priorityBase + 1),
    askUser(question, reason, priorityBase + 2)
  );

  if (options.includeAssignTool) {
    actions.push(
      callTool(
        'assign_texture',
        {
          textureName: unique[0] ?? refUser('textureName'),
          cubeNames: refUser('cubeNames (or "all" if safe)'),
          ifRevision: refTool('get_project_state', '/project/revision')
        },
        'Bind the texture to cubes so it shows up in preview/export.',
        priorityBase + 3
      )
    );
  }

  return actions;
};

export const buildClarificationNextActions = (options: {
  questions?: string[];
  reason?: string;
  priorityBase?: number;
}): NextAction[] => {
  const questions = Array.isArray(options.questions) ? options.questions : [];
  const reason = options.reason ?? CLARIFICATION_REASON_DEFAULT;
  const priorityBase = options.priorityBase ?? 1;
  return questions
    .map((question) => question.trim())
    .filter((question) => question.length > 0)
    .map((question, index) => askUser(question, reason, priorityBase + index));
};

export const buildModelPipelineNextActions = (options: {
  warnings?: string[];
  includeValidate?: boolean;
  includePreview?: boolean;
  validateReason?: string;
  validatePriority?: number;
  previewReason?: string;
  previewPriority?: number;
  previewIncludeStateFetch?: boolean;
}): NextAction[] => {
  const actions: NextAction[] = [];
  if (Array.isArray(options.warnings) && options.warnings.length > 0) {
    actions.push(
      readResource('bbmcp://guide/modeling-workflow', MODELING_WORKFLOW_WARNING_REASON, 1)
    );
  }
  if (options.includeValidate !== false) {
    actions.push(...buildValidateNextActions(options.validateReason, options.validatePriority));
  }
  if (options.includePreview !== false) {
    actions.push(
      ...buildPreviewNextActions(
        options.previewReason,
        options.previewPriority,
        { includeStateFetch: options.previewIncludeStateFetch }
      )
    );
  }
  return dedupeNextActions(actions);
};

export const buildTexturePipelineNextActions = (options: {
  textureLabels?: string[];
  didPaint?: boolean;
  didAssign?: boolean;
  didPreview?: boolean;
  assign?: {
    includeAssignTool?: boolean;
    includeGuide?: boolean;
    guideReason?: string;
    askQuestion?: string;
    askReason?: string;
    priorityBase?: number;
  };
  preview?: {
    reason?: string;
    priorityBase?: number;
    includeStateFetch?: boolean;
  };
}): NextAction[] => {
  const didPaint = Boolean(options.didPaint);
  const didAssign = Boolean(options.didAssign);
  const didPreview = Boolean(options.didPreview);
  const hasAssignFollowups = didPaint && !didAssign;
  const actions: NextAction[] = [];

  if (hasAssignFollowups) {
    actions.push(
      ...buildTextureAssignNextActions({
        textureLabels: options.textureLabels,
        includeAssignTool: options.assign?.includeAssignTool,
        includeGuide: options.assign?.includeGuide,
        guideReason: options.assign?.guideReason ?? TEXTURE_ASSIGN_MISSING_REASON,
        askQuestion: options.assign?.askQuestion,
        askReason: options.assign?.askReason ?? TEXTURE_ASSIGN_ASK_REASON_DEFAULT,
        priorityBase: options.assign?.priorityBase
      })
    );
  }

  if (!didPreview) {
    actions.push(
      ...buildPreviewNextActions(
        options.preview?.reason,
        options.preview?.priorityBase,
        { includeStateFetch: options.preview?.includeStateFetch ?? !hasAssignFollowups }
      )
    );
  }

  return dedupeNextActions(actions);
};

export const dedupeNextActions = (actions: NextAction[]): NextAction[] => {
  return dedupeCallToolActions(dedupeProjectStateActions(actions));
};

const dedupeProjectStateActions = (actions: NextAction[]): NextAction[] => {
  const isGetProjectState = (action: NextAction) =>
    action.type === 'call_tool' && action.tool === 'get_project_state';
  const getDetail = (action: NextAction) => {
    if (action.type !== 'call_tool') return undefined;
    const detail = action.arguments?.detail;
    return typeof detail === 'string' ? detail : undefined;
  };

  const hasFull = actions.some((action) => isGetProjectState(action) && getDetail(action) === 'full');
  let kept = false;
  return actions.filter((action) => {
    if (!isGetProjectState(action)) return true;
    const detail = getDetail(action);
    if (hasFull && detail !== 'full') return false;
    if (kept) return false;
    kept = true;
    return true;
  });
};

const dedupeCallToolActions = (actions: NextAction[]): NextAction[] => {
  const seen = new Set<string>();
  return actions.filter((action) => {
    if (action.type !== 'call_tool') return true;
    const key = JSON.stringify({ tool: action.tool, arguments: action.arguments });
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
