type Renamable = { name?: unknown; rename?: (name: string) => void };

export const renameEntity = (entity: Renamable, nextName: string): void => {
  if (!entity || typeof nextName !== 'string') return;
  if (typeof entity.rename === 'function') {
    entity.rename(nextName);
    return;
  }
  if (typeof entity.name !== 'undefined') {
    entity.name = nextName;
  }
};

type Removable = { remove?: () => void; delete?: () => void; dispose?: () => void };

export const removeEntity = (entity: Removable | null | undefined): boolean => {
  if (!entity) return false;
  if (typeof entity.remove === 'function') {
    entity.remove();
    return true;
  }
  if (typeof entity.delete === 'function') {
    entity.delete();
    return true;
  }
  if (typeof entity.dispose === 'function') {
    entity.dispose();
    return true;
  }
  return false;
};

type Extendable = { extend?: (patch: Record<string, unknown>) => void };

export const extendEntity = (entity: Extendable | null | undefined, patch: Record<string, unknown>): boolean => {
  if (!entity || !patch) return false;
  if (typeof entity.extend === 'function') {
    entity.extend(patch);
    return true;
  }
  return false;
};
