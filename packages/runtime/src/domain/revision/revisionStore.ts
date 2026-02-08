import { SessionState } from '../../session';

export class RevisionStore {
  private readonly cache = new Map<string, SessionState>();
  private readonly order: string[] = [];
  private readonly limit: number;

  constructor(limit: number) {
    this.limit = limit;
  }

  hash(snapshot: SessionState): string {
    return hashSnapshot(snapshot);
  }

  track(snapshot: SessionState): string {
    const revision = hashSnapshot(snapshot);
    this.remember(snapshot, revision);
    return revision;
  }

  remember(snapshot: SessionState, revision: string): void {
    if (!revision) return;
    const cloned = cloneSnapshot(snapshot);
    if (!this.cache.has(revision)) {
      this.order.push(revision);
      if (this.order.length > this.limit) {
        const oldest = this.order.shift();
        if (oldest) this.cache.delete(oldest);
      }
    }
    this.cache.set(revision, cloned);
  }

  get(revision: string): SessionState | null {
    return this.cache.get(revision) ?? null;
  }
}

const hashSnapshot = (snapshot: SessionState): string => {
  const data = {
    id: snapshot.id ?? '',
    format: snapshot.format ?? '',
    formatId: snapshot.formatId ?? '',
    name: snapshot.name ?? '',
    dirty: snapshot.dirty ?? null,
    bones: snapshot.bones.map((b) => [
      b.id ?? '',
      b.name,
      b.parent ?? '',
      b.pivot,
      b.rotation ?? null,
      b.scale ?? null,
      b.visibility ?? null
    ]),
    cubes: snapshot.cubes.map((c) => [
      c.id ?? '',
      c.name,
      c.bone,
      c.from,
      c.to,
      c.origin ?? null,
      c.rotation ?? null,
      c.uv ?? null,
      c.uvOffset ?? null,
      c.inflate ?? null,
      c.mirror ?? null,
      c.visibility ?? null,
      c.boxUv ?? null
    ]),
    textures: snapshot.textures.map((t) => [
      t.id ?? '',
      t.name,
      t.path ?? '',
      t.width ?? 0,
      t.height ?? 0,
      t.contentHash ?? '',
      t.namespace ?? null,
      t.folder ?? null,
      t.particle ?? null,
      t.visible ?? null,
      t.renderMode ?? null,
      t.renderSides ?? null,
      t.pbrChannel ?? null,
      t.group ?? null,
      t.frameTime ?? null,
      t.frameOrderType ?? null,
      t.frameOrder ?? null,
      t.frameInterpolate ?? null,
      t.internal ?? null,
      t.keepSize ?? null
    ]),
    animations: snapshot.animations.map((a) => [
      a.id ?? '',
      a.name,
      a.length,
      a.loop,
      a.fps ?? null,
      a.channels
        ? a.channels.map((ch) => [
            ch.bone,
            ch.channel,
            ch.keys.map((key) => [key.time, key.value[0], key.value[1], key.value[2], key.interp ?? null])
          ])
        : [],
      a.triggers
        ? a.triggers.map((tr) => [
            tr.type,
            tr.keys.map((key) => [key.time, normalizeTriggerValueForHash(key.value)])
          ])
        : []
    ]),
    animationTimePolicy: [
      snapshot.animationTimePolicy.timeEpsilon,
      snapshot.animationTimePolicy.triggerDedupeByValue
    ]
  };
  return hashString(JSON.stringify(data));
};

const hashString = (value: string): string => {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
};

const cloneSnapshot = (snapshot: SessionState): SessionState => ({
  ...snapshot,
  bones: snapshot.bones.map((bone) => ({ ...bone })),
  cubes: snapshot.cubes.map((cube) => ({ ...cube })),
  textures: snapshot.textures.map((tex) => ({ ...tex })),
  animations: snapshot.animations.map((anim) => ({
    ...anim,
    channels: anim.channels
      ? anim.channels.map((ch) => ({
          ...ch,
          keys: ch.keys.map((key) => ({
            time: key.time,
            value: [key.value[0], key.value[1], key.value[2]],
            interp: key.interp
          }))
        }))
      : undefined,
    triggers: anim.triggers
      ? anim.triggers.map((tr) => ({
          ...tr,
          keys: tr.keys.map((key) => ({
            time: key.time,
            value: cloneTriggerValue(key.value)
          }))
        }))
      : undefined
  })),
  animationsStatus: snapshot.animationsStatus,
  animationTimePolicy: { ...snapshot.animationTimePolicy }
});

const normalizeTriggerValueForHash = (value: string | string[] | Record<string, unknown>): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) =>
      typeof entry === 'object' && entry !== null
        ? normalizeTriggerValueForHash(entry as Record<string, unknown>)
        : entry
    );
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .map((key) => [key, normalizeTriggerValueForHash(record[key] as Record<string, unknown>)]);
  }
  return value;
};

const cloneTriggerValue = (value: string | string[] | Record<string, unknown>): typeof value => {
  if (Array.isArray(value)) {
    return value.map((entry) =>
      typeof entry === 'object' && entry !== null ? cloneTriggerValue(entry as Record<string, unknown>) : entry
    ) as typeof value;
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const cloned: Record<string, unknown> = {};
    Object.keys(record).forEach((key) => {
      const entry = record[key];
      if (Array.isArray(entry)) {
        cloned[key] = entry.map((item) =>
          typeof item === 'object' && item !== null ? cloneTriggerValue(item as Record<string, unknown>) : item
        );
      } else if (typeof entry === 'object' && entry !== null) {
        cloned[key] = cloneTriggerValue(entry as Record<string, unknown>);
      } else {
        cloned[key] = entry;
      }
    });
    return cloned as typeof value;
  }
  return value;
};



