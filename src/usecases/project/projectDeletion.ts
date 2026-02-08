import type { FormatKind } from '@ashfox/contracts/types/internal';
import { ok, fail, type UsecaseResult } from '../result';
import { ensureNonBlankString } from '../../shared/payloadValidation';
import {
  ADAPTER_PROJECT_CLOSE_NOT_APPLIED,
  PROJECT_DELETE_NAME_REQUIRED,
  PROJECT_DELETE_NAME_REQUIRED_FIX,
  PROJECT_MISMATCH,
  PROJECT_NO_ACTIVE
} from '../../shared/messages';
import type { ProjectServiceDeps } from './projectServiceTypes';

export type ProjectDeleteContext = Pick<
  ProjectServiceDeps,
  'session' | 'editor' | 'projectState' | 'getSnapshot' | 'ensureRevisionMatch'
>;

export const runDeleteProject = (
  ctx: ProjectDeleteContext,
  payload: { target?: { name?: string }; force?: boolean; ifRevision?: string }
): UsecaseResult<{ action: 'deleted'; project: { id: string; format: FormatKind; name: string | null; formatId?: string | null } }> => {
  const revisionErr = ctx.ensureRevisionMatch(payload.ifRevision);
  if (revisionErr) return fail(revisionErr);
  const targetName = payload.target?.name;
  if (!targetName) {
    return fail({
      code: 'invalid_payload',
      message: PROJECT_DELETE_NAME_REQUIRED,
      fix: PROJECT_DELETE_NAME_REQUIRED_FIX
    });
  }
  const targetBlankErr = ensureNonBlankString(targetName, 'target.name');
  if (targetBlankErr) return fail(targetBlankErr);
  const snapshot = ctx.getSnapshot();
  const normalized = ctx.projectState.normalize(snapshot);
  const info = ctx.projectState.toProjectInfo(normalized);
  if (!info || !normalized.format) {
    return fail({ code: 'invalid_state', message: PROJECT_NO_ACTIVE });
  }
  if (info.name !== targetName) {
    return fail({
      code: 'invalid_state',
      message: PROJECT_MISMATCH,
      details: {
        expected: { name: targetName },
        actual: { name: info.name ?? null }
      }
    });
  }
  const err = ctx.editor.closeProject({ force: payload.force });
  if (err) return fail(err);
  const postSnapshot = ctx.getSnapshot();
  const postNormalized = ctx.projectState.normalize(postSnapshot);
  const postInfo = ctx.projectState.toProjectInfo(postNormalized);
  if (postInfo && postNormalized.format) {
    return fail({
      code: 'invalid_state',
      message: ADAPTER_PROJECT_CLOSE_NOT_APPLIED,
      details: {
        actual: {
          name: postInfo.name ?? null,
          format: postNormalized.format,
          formatId: postNormalized.formatId ?? null
        }
      }
    });
  }
  ctx.session.reset();
  return ok({
    action: 'deleted',
    project: {
      id: info.id,
      format: normalized.format,
      name: info.name ?? null,
      formatId: normalized.formatId ?? null
    }
  });
};

