import type { DomainResult } from './result';
import { fail, ok } from './result';
import { UV_USAGE_REQUIRED } from '../shared/messages';

export const requireUvUsageId = (value: unknown, message?: string): DomainResult<string> => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fail('invalid_payload', message ?? UV_USAGE_REQUIRED, { reason: 'uv_usage_missing' });
  }
  return ok(value.trim());
};
