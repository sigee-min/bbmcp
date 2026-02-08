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
export const ANIMATION_TRIGGER_KEYFRAME_SINGLE_REQUIRED = 'Only one trigger keyframe per call is supported';
export const ANIMATION_FRAME_INVALID = 'Animation frame must be a non-negative number';
export const ANIMATION_POSE_BONES_REQUIRED = 'At least one bone pose is required';
export const ANIMATION_POSE_CHANNEL_REQUIRED = 'Bone pose must include rot, pos, or scale';
export const ANIMATION_POSE_VALUE_INVALID = 'Bone pose values must be numeric triplets';


