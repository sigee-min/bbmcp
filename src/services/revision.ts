import { SessionState } from '../session';

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
      b.scale ?? null
    ]),
    cubes: snapshot.cubes.map((c) => [
      c.id ?? '',
      c.name,
      c.bone,
      c.from,
      c.to,
      c.uv ?? null,
      c.inflate ?? null,
      c.mirror ?? null
    ]),
    textures: snapshot.textures.map((t) => [t.id ?? '', t.name, t.path ?? '', t.width ?? 0, t.height ?? 0]),
    animations: snapshot.animations.map((a) => [
      a.id ?? '',
      a.name,
      a.length,
      a.loop,
      a.fps ?? null,
      a.channels?.length ?? 0
    ])
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
    channels: anim.channels ? anim.channels.map((ch) => ({ ...ch, keys: [...ch.keys] })) : undefined
  })),
  animationsStatus: snapshot.animationsStatus
});
