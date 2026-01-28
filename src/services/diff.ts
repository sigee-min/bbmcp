import { SessionState, TrackedAnimation, TrackedBone, TrackedCube, TrackedTexture } from '../session';
import { ProjectDiffCounts, ProjectDiffCountsByKind, ProjectDiffSet } from '../types';

type DiffOutput<T> = {
  counts: ProjectDiffCounts;
  items?: ProjectDiffSet<T>;
};

const emptyCounts = (): ProjectDiffCounts => ({ added: 0, removed: 0, changed: 0 });

const cloneCounts = (counts: ProjectDiffCounts): ProjectDiffCounts => ({ ...counts });

const buildCounts = (added: number, removed: number, changed: number): ProjectDiffCounts => ({
  added,
  removed,
  changed
});

const defaultCountsByKind = (): ProjectDiffCountsByKind => ({
  bones: emptyCounts(),
  cubes: emptyCounts(),
  textures: emptyCounts(),
  animations: emptyCounts()
});

type KeyFn<T> = (item: T) => string;
type SigFn<T> = (item: T) => string;

const diffByKey = <T>(
  previous: T[],
  current: T[],
  keyFn: KeyFn<T>,
  sigFn: SigFn<T>,
  includeItems: boolean
): DiffOutput<T> => {
  const prevMap = new Map<string, { item: T; sig: string }>();
  const currMap = new Map<string, { item: T; sig: string }>();
  previous.forEach((item) => {
    const key = keyFn(item);
    prevMap.set(key, { item, sig: sigFn(item) });
  });
  current.forEach((item) => {
    const key = keyFn(item);
    currMap.set(key, { item, sig: sigFn(item) });
  });

  let added = 0;
  let removed = 0;
  let changed = 0;

  const items: ProjectDiffSet<T> | undefined = includeItems
    ? { added: [], removed: [], changed: [] }
    : undefined;

  currMap.forEach((entry, key) => {
    const prev = prevMap.get(key);
    if (!prev) {
      added += 1;
      if (items) items.added.push({ key, item: entry.item });
      return;
    }
    if (prev.sig !== entry.sig) {
      changed += 1;
      if (items) items.changed.push({ key, before: prev.item, after: entry.item });
    }
  });

  prevMap.forEach((entry, key) => {
    if (!currMap.has(key)) {
      removed += 1;
      if (items) items.removed.push({ key, item: entry.item });
    }
  });

  return { counts: buildCounts(added, removed, changed), items };
};

const boneKey = (bone: TrackedBone) => bone.id ?? bone.name;
const cubeKey = (cube: TrackedCube) => cube.id ?? `${cube.name}::${cube.bone}`;
const textureKey = (texture: TrackedTexture) => texture.id ?? texture.name;
const animationKey = (anim: TrackedAnimation) => anim.id ?? anim.name;

const boneSig = (bone: TrackedBone) =>
  JSON.stringify([
    bone.id ?? null,
    bone.name,
    bone.parent ?? '',
    bone.pivot,
    bone.rotation ?? null,
    bone.scale ?? null,
    bone.visibility ?? null
  ]);
const cubeSig = (cube: TrackedCube) =>
  JSON.stringify([
    cube.id ?? null,
    cube.name,
    cube.bone,
    cube.from,
    cube.to,
    cube.origin ?? null,
    cube.rotation ?? null,
    cube.uv ?? null,
    cube.uvOffset ?? null,
    cube.inflate ?? null,
    cube.mirror ?? null,
    cube.visibility ?? null,
    cube.boxUv ?? null
  ]);
const textureSig = (texture: TrackedTexture) =>
  JSON.stringify([
    texture.id ?? null,
    texture.name,
    texture.path ?? '',
    texture.width ?? 0,
    texture.height ?? 0,
    texture.contentHash ?? '',
    texture.namespace ?? null,
    texture.folder ?? null,
    texture.particle ?? null,
    texture.visible ?? null,
    texture.renderMode ?? null,
    texture.renderSides ?? null,
    texture.pbrChannel ?? null,
    texture.group ?? null,
    texture.frameTime ?? null,
    texture.frameOrderType ?? null,
    texture.frameOrder ?? null,
    texture.frameInterpolate ?? null,
    texture.internal ?? null,
    texture.keepSize ?? null
  ]);
const animationSig = (anim: TrackedAnimation) =>
  JSON.stringify([
    anim.id ?? null,
    anim.name,
    anim.length,
    anim.loop,
    anim.fps ?? null,
    anim.channels?.length ?? 0,
    anim.triggers?.length ?? 0
  ]);

export const diffSnapshots = (
  previous: SessionState,
  current: SessionState,
  includeItems: boolean
): { counts: ProjectDiffCountsByKind; sets?: { bones: ProjectDiffSet<TrackedBone>; cubes: ProjectDiffSet<TrackedCube>; textures: ProjectDiffSet<TrackedTexture>; animations: ProjectDiffSet<TrackedAnimation> } } => {
  const counts = defaultCountsByKind();

  const bones = diffByKey(previous.bones, current.bones, boneKey, boneSig, includeItems);
  const cubes = diffByKey(previous.cubes, current.cubes, cubeKey, cubeSig, includeItems);
  const textures = diffByKey(previous.textures, current.textures, textureKey, textureSig, includeItems);
  const animations = diffByKey(previous.animations, current.animations, animationKey, animationSig, includeItems);

  counts.bones = cloneCounts(bones.counts);
  counts.cubes = cloneCounts(cubes.counts);
  counts.textures = cloneCounts(textures.counts);
  counts.animations = cloneCounts(animations.counts);

  if (!includeItems) return { counts };

  return {
    counts,
    sets: {
      bones: bones.items!,
      cubes: cubes.items!,
      textures: textures.items!,
      animations: animations.items!
    }
  };
};
