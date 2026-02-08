import { ToolError } from '@ashfox/contracts/types/internal';

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

export type TextureReadResult = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export interface TextureRendererPort {
  renderPixels: (input: TexturePixelData) => { result?: TextureRenderResult; error?: ToolError };
  readPixels?: (input: {
    image: CanvasImageSource;
    width?: number;
    height?: number;
  }) => { result?: TextureReadResult; error?: ToolError };
}



