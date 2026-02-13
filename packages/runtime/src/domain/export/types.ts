import type { ExportPayload } from '@ashfox/contracts/types/internal';

export type ResolvedExportFormat = ExportPayload['format'];
export type InternalExportFormat = Exclude<ResolvedExportFormat, 'native_codec'>;

export type ResolvedExportSelection = {
  format: ResolvedExportFormat;
  codecId?: string;
};
