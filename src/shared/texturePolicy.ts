export const TEXTURE_PRESET_NAMES = [
  'painted_metal',
  'rubber',
  'glass',
  'wood',
  'dirt',
  'plant',
  'stone',
  'sand',
  'leather',
  'fabric',
  'ceramic'
] as const;

export const UV_PAINT_SCOPES = ['faces', 'rects', 'bounds'] as const;
export const UV_PAINT_MAPPINGS = ['stretch', 'tile'] as const;

export type TexturePresetName = typeof TEXTURE_PRESET_NAMES[number];
export type UvPaintScope = typeof UV_PAINT_SCOPES[number];
export type UvPaintMapping = typeof UV_PAINT_MAPPINGS[number];

export const TEXTURE_PRESET_NAME_SET = new Set<string>(TEXTURE_PRESET_NAMES);
export const UV_PAINT_SCOPE_SET = new Set<string>(UV_PAINT_SCOPES);
export const UV_PAINT_MAPPING_SET = new Set<string>(UV_PAINT_MAPPINGS);
