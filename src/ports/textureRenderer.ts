import { ToolError } from '../types';

export type TexturePixelData = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type TextureRenderResult = {
  image: CanvasImageSource;
  width: number;
  height: number;
};

export interface TextureRendererPort {
  renderPixels: (input: TexturePixelData) => { result?: TextureRenderResult; error?: ToolError };
}
