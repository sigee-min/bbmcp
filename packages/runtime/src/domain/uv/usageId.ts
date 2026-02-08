import type { DomainResult } from '../result';
import { fail, ok } from '../result';

export type UvUsageIdMessages = {
  required: string;
};

export const requireUvUsageId = (value: unknown, messages: UvUsageIdMessages): DomainResult<string> => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fail('invalid_payload', messages.required, { reason: 'uv_usage_missing' });
  }
  return ok(value.trim());
};



