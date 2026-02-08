let idCounter = 0;

export const createId = (prefix: string): string => {
  const cryptoApi = globalThis.crypto;
  const uuid = typeof cryptoApi?.randomUUID === 'function' ? cryptoApi.randomUUID() : undefined;
  if (uuid) return `${prefix}_${uuid}`;
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
};


