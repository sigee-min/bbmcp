import type { ToolPayloadMap } from '@ashfox/contracts/types/internal';
import type { HostPort } from '../../ports/host';
import { ok, fail, type UsecaseResult } from '../result';
import {
  PLUGIN_RELOAD_CONFIRM_REQUIRED,
  PLUGIN_RELOAD_CONFIRM_REQUIRED_FIX,
  PLUGIN_RELOAD_UNAVAILABLE
} from '../../shared/messages';

export const runReloadPlugins = (
  host: HostPort | undefined,
  payload: ToolPayloadMap['reload_plugins']
): UsecaseResult<{ scheduled: true; delayMs: number; method: 'devReload' }> => {
  if (payload.confirm !== true) {
    return fail({
      code: 'invalid_payload',
      message: PLUGIN_RELOAD_CONFIRM_REQUIRED,
      fix: PLUGIN_RELOAD_CONFIRM_REQUIRED_FIX
    });
  }
  if (!host) {
    return fail({ code: 'invalid_state', message: PLUGIN_RELOAD_UNAVAILABLE });
  }
  const delayMs = normalizeReloadDelay(payload.delayMs);
  const err = host.schedulePluginReload(delayMs);
  if (err) return fail(err);
  return ok({ scheduled: true, delayMs, method: 'devReload' });
};

const normalizeReloadDelay = (value?: number): number => {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  if (numeric === undefined) return 500;
  if (numeric < 0) return 0;
  return Math.min(Math.trunc(numeric), 10_000);
};
