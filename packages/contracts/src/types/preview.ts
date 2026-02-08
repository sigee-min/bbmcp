import type { IfRevisionOption, IncludeStateOption } from './shared';

export type RenderPreviewOutputKind = 'single' | 'sequence';

export interface RenderPreviewPayload extends IncludeStateOption, IfRevisionOption {
  mode: 'fixed' | 'turntable';
  angle?: [number, number] | [number, number, number];
  clip?: string;
  timeSeconds?: number;
  durationSeconds?: number;
  fps?: number;
  output?: RenderPreviewOutputKind;
  saveToTmp?: boolean;
  tmpName?: string;
  tmpPrefix?: string;
}

export interface PreviewImage {
  mime: string;
  dataUri: string;
  byteLength: number;
  width: number;
  height: number;
}

export interface PreviewFrame {
  index: number;
  mime: string;
  dataUri: string;
  byteLength: number;
  width: number;
  height: number;
}

export interface RenderPreviewResult {
  kind: RenderPreviewOutputKind;
  frameCount: number;
  image?: PreviewImage;
  frames?: PreviewFrame[];
  saved?: {
    image?: {
      path: string;
      mime: string;
      byteLength: number;
      width: number;
      height: number;
    };
    frames?: Array<{
      index: number;
      path: string;
      mime: string;
      byteLength: number;
      width: number;
      height: number;
    }>;
  };
}

export type PreviewImageMeta = Omit<PreviewImage, 'dataUri'>;
export type PreviewFrameMeta = Omit<PreviewFrame, 'dataUri'>;

export type RenderPreviewStructured = {
  kind: RenderPreviewOutputKind;
  frameCount: number;
  image?: PreviewImageMeta;
  frames?: PreviewFrameMeta[];
  saved?: RenderPreviewResult['saved'];
};
