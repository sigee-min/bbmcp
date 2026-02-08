export type TextureRenderMode = 'default' | 'emissive' | 'additive' | 'layered' | string;

export type TextureRenderSides = 'auto' | 'front' | 'double' | string;

export type TexturePbrChannel = 'color' | 'normal' | 'height' | 'mer';

export type TextureFrameOrderType = 'custom' | 'loop' | 'backwards' | 'back_and_forth';

export type TextureMeta = {
  namespace?: string;
  folder?: string;
  particle?: boolean;
  visible?: boolean;
  renderMode?: TextureRenderMode;
  renderSides?: TextureRenderSides;
  pbrChannel?: TexturePbrChannel;
  group?: string;
  frameTime?: number;
  frameOrderType?: TextureFrameOrderType;
  frameOrder?: string;
  frameInterpolate?: boolean;
  internal?: boolean;
  keepSize?: boolean;
};
