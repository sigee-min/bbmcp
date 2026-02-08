import { ToolError } from '@ashfox/contracts/types/internal';

export type ExportNativeParams = {
  formatId: string;
  destPath: string;
};

export type ExportGltfParams = {
  destPath: string;
};

export type ExportCodecParams = {
  codecId: string;
  destPath: string;
};

export type NativeCodecTarget = {
  id: string;
  label: string;
  extensions: string[];
};

export type ExportOperationResult = ToolError | null | Promise<ToolError | null>;

export interface ExportPort {
  exportNative: (params: ExportNativeParams) => ExportOperationResult;
  exportGltf: (params: ExportGltfParams) => ExportOperationResult;
  exportCodec?: (params: ExportCodecParams) => ExportOperationResult;
  listNativeCodecs?: () => NativeCodecTarget[];
}



