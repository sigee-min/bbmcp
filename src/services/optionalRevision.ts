import type { ToolResponse } from '../types';
import { errFromDomain } from './toolResponse';
import type { ToolService } from '../usecases/ToolService';

export const guardOptionalRevision = (
  service: ToolService,
  payload: { ifRevision?: string } | undefined
): ToolResponse<never> | null => {
  if (!payload?.ifRevision) return null;
  const err = service.ensureRevisionMatchIfProvided(payload.ifRevision);
  if (!err) return null;
  return errFromDomain(err);
};
