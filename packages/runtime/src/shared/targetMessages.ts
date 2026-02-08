import type { IdNameMismatchArgs } from '../domain/payloadValidation';
import { ID_NAME_MISMATCH_MESSAGE } from './messages';

export const buildIdNameMismatchMessage = (args: IdNameMismatchArgs): string =>
  ID_NAME_MISMATCH_MESSAGE(args.kind, args.idLabel, args.nameLabel, args.plural, args.id, args.name);
