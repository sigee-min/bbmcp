import type { DomainResult } from '../domain/result';

import { fail, ok, type UsecaseResult } from './result';

export const fromDomainResult = <T>(result: DomainResult<T>): UsecaseResult<T> => {
  if (result.ok) return ok(result.data);
  return fail(result.error);
};


