export const KEYFRAME_TIME_INVALID = (name: string) => `keyframe time invalid (${name})`;
export const KEYFRAME_VALUE_INVALID = (name: string) => `keyframe value invalid (${name})`;
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
export const ANIMATION_KEYFRAME_SINGLE_REQUIRED = 'Only one keyframe per call is supported';
export const ANIMATION_TRIGGER_KEYFRAME_SINGLE_REQUIRED = 'Only one trigger keyframe per call is supported';


