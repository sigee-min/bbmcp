import type { ToolError } from '@ashfox/contracts/types/internal';
import { ensureNonBlankString as ensureNonBlankStringBase } from '../domain/payloadValidation';
import { NON_EMPTY_STRING_MESSAGE } from './messages';

export const ensureNonBlankString = (value: unknown, label: string): ToolError | null =>
  ensureNonBlankStringBase(value, { message: NON_EMPTY_STRING_MESSAGE(label) });

