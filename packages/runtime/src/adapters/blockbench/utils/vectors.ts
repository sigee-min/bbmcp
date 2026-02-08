import type { UnknownRecord } from '../../../types/blockbench';

export const assignVec3 = (target: UnknownRecord, key: string, value: [number, number, number]) => {
  const current = target[key];
  if (Array.isArray(current)) {
    target[key] = [...value];
    return;
  }
  if (current && typeof current === 'object') {
    const vec = current as { x?: number; y?: number; z?: number };
    if (
      typeof vec.x === 'number' &&
      typeof vec.y === 'number' &&
      typeof vec.z === 'number'
    ) {
      vec.x = value[0];
      vec.y = value[1];
      vec.z = value[2];
      return;
    }
    if (typeof (current as { set?: (x: number, y: number, z: number) => void }).set === 'function') {
      (current as { set: (x: number, y: number, z: number) => void }).set(value[0], value[1], value[2]);
      return;
    }
    vec.x = value[0];
    vec.y = value[1];
    vec.z = value[2];
    return;
  }
  target[key] = [...value];
};

export const assignVec2 = (target: UnknownRecord, key: string, value: [number, number]) => {
  const current = target[key];
  if (Array.isArray(current)) {
    target[key] = [...value];
    return;
  }
  if (current && typeof current === 'object') {
    const vec = current as { x?: number; y?: number };
    if (typeof vec.x === 'number' && typeof vec.y === 'number') {
      vec.x = value[0];
      vec.y = value[1];
      return;
    }
    if (typeof (current as { set?: (x: number, y: number) => void }).set === 'function') {
      (current as { set: (x: number, y: number) => void }).set(value[0], value[1]);
      return;
    }
    vec.x = value[0];
    vec.y = value[1];
    return;
  }
  target[key] = [...value];
};
