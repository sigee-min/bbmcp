export const ANIMATIONS_MUST_BE_ARRAY = 'animations must be an array';
export const ANIMATION_NAME_REQUIRED = 'animation name is required';
export const ANIMATION_LENGTH_INVALID = (name: string) => `animation length must be > 0 (${name})`;
export const ANIMATION_LOOP_INVALID = (name: string) => `animation loop must be boolean (${name})`;
export const ANIMATION_FPS_INVALID = (name: string) => `animation fps must be > 0 (${name})`;
export const ANIMATION_MODE_INVALID = (name: string) => `animation mode invalid (${name})`;
export const CHANNELS_MUST_BE_ARRAY = (name: string) => `channels must be array (${name})`;
export const CHANNEL_BONE_REQUIRED = (name: string) => `channel bone required (${name})`;
export const CHANNEL_TYPE_INVALID = (name: string) => `channel type invalid (${name})`;
export const CHANNEL_KEYS_MUST_BE_ARRAY = (name: string) => `channel keys must be array (${name})`;
export const KEYFRAME_TIME_INVALID = (name: string) => `keyframe time invalid (${name})`;
export const KEYFRAME_VALUE_INVALID = (name: string) => `keyframe value invalid (${name})`;
export const TRIGGERS_MUST_BE_ARRAY = (name: string) => `triggers must be array (${name})`;
export const TRIGGER_TYPE_INVALID = (name: string) => `trigger type invalid (${name})`;
export const TRIGGER_KEYS_MUST_BE_ARRAY = (name: string) => `trigger keys must be array (${name})`;
export const TRIGGER_TIME_INVALID = (name: string) => `trigger time invalid (${name})`;
export const TRIGGER_VALUE_INVALID = (name: string) => `trigger value invalid (${name})`;

export const ANIMATION_UNSUPPORTED_FORMAT = 'Animations are not supported for this format';
export const ANIMATION_CLIP_NAME_REQUIRED = 'Animation name is required';
export const ANIMATION_LENGTH_POSITIVE = 'Animation length must be > 0';
export const ANIMATION_FPS_POSITIVE = 'Animation fps must be > 0';
export const ANIMATION_LENGTH_EXCEEDS_MAX = (maxSeconds: number) =>
  `Animation length exceeds max ${maxSeconds} seconds`;
export const ANIMATION_CLIP_EXISTS = (name: string) => `Animation clip already exists: ${name}`;
export const ANIMATION_ID_EXISTS = (id: string) => `Animation id already exists: ${id}`;
export const ANIMATION_CLIP_ID_OR_NAME_REQUIRED = 'Animation clip id or name is required';
export const ANIMATION_CLIP_NOT_FOUND = (label: string) => `Animation clip not found: ${label}`;
