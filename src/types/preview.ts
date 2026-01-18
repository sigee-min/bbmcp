import { IncludeStateOption } from './shared';

export type RenderPreviewOutputKind = 'single' | 'sequence';

export interface RenderPreviewPayload extends IncludeStateOption {
  mode: 'fixed' | 'turntable';
  angle?: [number, number] | [number, number, number];
  clip?: string;
  timeSeconds?: number;
  durationSeconds?: number;
  fps?: number;
  output?: RenderPreviewOutputKind;
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
}
