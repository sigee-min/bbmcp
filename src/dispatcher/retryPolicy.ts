import type { Logger } from '../logging';
import type { ToolName } from '@ashfox/contracts/types/internal';
import type { ToolService } from '../usecases/ToolService';
import type { UsecaseResult } from '../usecases/result';
import { decideRevision } from '../usecases/revision/revisionGuard';
import { resolveGuardReason, resolveIfRevision } from './utils';

export const callWithAutoRetry = async <TPayload extends object, TResult>(args: {
  tool: ToolName;
  payload: TPayload;
  call: (payload: TPayload) => UsecaseResult<TResult> | Promise<UsecaseResult<TResult>>;
  service: ToolService;
  log: Logger;
}): Promise<{ result: UsecaseResult<TResult>; payload: TPayload }> => {
  const first = await args.call(args.payload);
  if (first.ok) {
    return { result: first, payload: args.payload };
  }
  if (!args.service.isAutoRetryRevisionEnabled()) {
    return { result: first, payload: args.payload };
  }
  if (first.error.code !== 'invalid_state_revision_mismatch') {
    return { result: first, payload: args.payload };
  }
  const ifRevision = resolveIfRevision(args.payload);
  const decision = decideRevision(ifRevision, {
    requiresRevision: args.service.isRevisionRequired(),
    allowAutoRetry: true,
    getProjectState: () => args.service.getProjectState({ detail: 'summary' })
  });
  if (!decision.ok) {
    const reason = resolveGuardReason(decision.error) ?? 'state_unavailable';
    args.log.debug('revision retry skipped', { tool: args.tool, reason, code: decision.error.code });
    return { result: first, payload: args.payload };
  }
  if (decision.action !== 'retry') {
    args.log.debug('revision retry skipped', {
      tool: args.tool,
      reason: 'no_new_revision',
      expected: ifRevision ?? null,
      current: decision.currentRevision ?? null
    });
    return { result: first, payload: args.payload };
  }
  if (!decision.currentRevision || decision.currentRevision === ifRevision) {
    args.log.debug('revision retry skipped', {
      tool: args.tool,
      reason: 'no_new_revision',
      expected: ifRevision ?? null,
      current: decision.currentRevision ?? null
    });
    return { result: first, payload: args.payload };
  }
  args.log.info('revision retrying with latest revision', {
    tool: args.tool,
    reason: 'revision_mismatch',
    expected: ifRevision ?? null,
    current: decision.currentRevision,
    attempt: 1
  });
  const retryPayload = { ...args.payload, ifRevision: decision.currentRevision } as TPayload;
  const retry = await args.call(retryPayload);
  if (retry.ok) {
    args.log.info('revision retry succeeded', { tool: args.tool, attempt: 1 });
  } else {
    args.log.warn('revision retry failed', {
      tool: args.tool,
      attempt: 1,
      code: retry.error.code,
      message: retry.error.message
    });
  }
  return { result: retry, payload: retryPayload };
};

