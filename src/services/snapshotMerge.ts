import { SessionState } from '../session';

export function mergeSnapshots(session: SessionState, live: SessionState | null): SessionState {
  if (!live) return session;

  const useLiveAnimations = live.animationsStatus !== 'unavailable';
  const mergedAnimations = useLiveAnimations ? mergeAnimations(session.animations, live.animations) : session.animations;
  const mergedTextures = mergeTextures(session.textures, live.textures);

  const merged: SessionState = {
    ...session,
    id: live.id ?? session.id,
    format: live.format ?? session.format,
    formatId: live.formatId ?? session.formatId,
    name: live.name ?? session.name,
    dirty: live.dirty ?? session.dirty,
    bones: live.bones,
    cubes: live.cubes,
    textures: mergedTextures,
    animations: mergedAnimations,
    animationsStatus: live.animationsStatus ?? session.animationsStatus
  };

  return merged;
}

function mergeAnimations(sessionAnims: SessionState['animations'], liveAnims: SessionState['animations']) {
  return liveAnims.map((live) => {
    const fallback = live.id
      ? sessionAnims.find((anim) => anim.id === live.id)
      : sessionAnims.find((anim) => anim.name === live.name);
    return {
      ...fallback,
      ...live,
      fps: live.fps ?? fallback?.fps,
      channels: live.channels ?? fallback?.channels,
      triggers: live.triggers ?? fallback?.triggers
    };
  });
}

function mergeTextures(sessionTex: SessionState['textures'], liveTex: SessionState['textures']) {
  if (sessionTex.length === 0) return liveTex;
  if (liveTex.length === 0) return sessionTex;
  const merged = new Map<string, SessionState['textures'][number]>();
  const nameIndex = new Map<string, string>();
  for (const tex of sessionTex) {
    const key = textureKey(tex);
    merged.set(key, { ...tex });
    if (tex.name) nameIndex.set(tex.name, key);
  }
  for (const tex of liveTex) {
    const key = textureKey(tex);
    const existingKey = merged.has(key) ? key : tex.name ? nameIndex.get(tex.name) : undefined;
    const existing = existingKey ? merged.get(existingKey) : undefined;
    if (!existing) {
      merged.set(key, { ...tex });
      if (tex.name) nameIndex.set(tex.name, key);
      continue;
    }
    merged.set(existingKey ?? key, mergeTexture(existing, tex));
    if (tex.name) nameIndex.set(tex.name, existingKey ?? key);
  }
  return Array.from(merged.values());
}

function mergeTexture(
  sessionTex: SessionState['textures'][number],
  liveTex: SessionState['textures'][number]
) {
  return {
    ...sessionTex,
    ...liveTex,
    id: pickString(liveTex.id, sessionTex.id),
    name: liveTex.name ?? sessionTex.name,
    path: pickString(liveTex.path, sessionTex.path),
    width: pickSize(liveTex.width, sessionTex.width),
    height: pickSize(liveTex.height, sessionTex.height),
    contentHash: pickString(liveTex.contentHash, sessionTex.contentHash)
  };
}

function textureKey(tex: SessionState['textures'][number]): string {
  if (tex.id) return `id:${tex.id}`;
  return `name:${tex.name}`;
}

function pickString(primary?: string, fallback?: string): string | undefined {
  if (typeof primary === 'string' && primary.length > 0) return primary;
  if (typeof fallback === 'string' && fallback.length > 0) return fallback;
  return undefined;
}

function pickSize(primary?: number, fallback?: number): number | undefined {
  if (typeof primary === 'number' && Number.isFinite(primary) && primary > 0) return primary;
  if (typeof fallback === 'number' && Number.isFinite(fallback) && fallback > 0) return fallback;
  return primary ?? fallback;
}
