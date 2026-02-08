export type TargetFilters = {
  ids: ReadonlySet<string>;
  names: ReadonlySet<string>;
  hasFilters: boolean;
};

export const buildTargetFilters = (ids?: string[], names?: string[]): TargetFilters => {
  const normalize = (value: string) => value.trim();
  const idSet = new Set((ids ?? []).map(normalize).filter((value) => value.length > 0));
  const nameSet = new Set((names ?? []).map(normalize).filter((value) => value.length > 0));
  return {
    ids: idSet,
    names: nameSet,
    hasFilters: idSet.size > 0 || nameSet.size > 0
  };
};

export const matchTargetFilters = (
  filters: TargetFilters,
  id?: string,
  name?: string
): boolean => {
  if (!filters.hasFilters) return true;
  const hasIds = filters.ids.size > 0;
  const hasNames = filters.names.size > 0;
  if (hasIds && hasNames) {
    if (!id || !name) return false;
    return filters.ids.has(id) && filters.names.has(name);
  }
  if (hasIds) {
    return Boolean(id && filters.ids.has(id));
  }
  if (hasNames) {
    return Boolean(name && filters.names.has(name));
  }
  return false;
};

export const filterByTargetFilters = <T extends { id?: string; name: string }>(
  items: T[],
  filters: TargetFilters
): T[] => items.filter((item) => matchTargetFilters(filters, item.id, item.name));
