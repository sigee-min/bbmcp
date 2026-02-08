import type { SessionState, TextureUpdate, TrackedTexture } from '../types';

export const addTexture = (state: SessionState, tex: TrackedTexture) => {
  state.textures.push(tex);
};

export const updateTexture = (state: SessionState, name: string, updates: TextureUpdate): boolean => {
  const tex = state.textures.find((t) => t.name === name);
  if (!tex) return false;
  if (updates.id) tex.id = updates.id;
  if (updates.newName && updates.newName !== tex.name) tex.name = updates.newName;
  if (updates.path !== undefined) tex.path = updates.path;
  if (typeof updates.width === 'number') tex.width = updates.width;
  if (typeof updates.height === 'number') tex.height = updates.height;
  if (updates.contentHash !== undefined) tex.contentHash = updates.contentHash;
  if (updates.namespace !== undefined) tex.namespace = updates.namespace;
  if (updates.folder !== undefined) tex.folder = updates.folder;
  if (updates.particle !== undefined) tex.particle = updates.particle;
  if (updates.visible !== undefined) tex.visible = updates.visible;
  if (updates.renderMode !== undefined) tex.renderMode = updates.renderMode;
  if (updates.renderSides !== undefined) tex.renderSides = updates.renderSides;
  if (updates.pbrChannel !== undefined) tex.pbrChannel = updates.pbrChannel;
  if (updates.group !== undefined) tex.group = updates.group;
  if (updates.frameTime !== undefined) tex.frameTime = updates.frameTime;
  if (updates.frameOrderType !== undefined) tex.frameOrderType = updates.frameOrderType;
  if (updates.frameOrder !== undefined) tex.frameOrder = updates.frameOrder;
  if (updates.frameInterpolate !== undefined) tex.frameInterpolate = updates.frameInterpolate;
  if (updates.internal !== undefined) tex.internal = updates.internal;
  if (updates.keepSize !== undefined) tex.keepSize = updates.keepSize;
  return true;
};

export const removeTextures = (state: SessionState, names: string[] | Set<string>): number => {
  const nameSet = names instanceof Set ? names : new Set(names);
  const before = state.textures.length;
  state.textures = state.textures.filter((t) => !nameSet.has(t.name));
  return before - state.textures.length;
};


