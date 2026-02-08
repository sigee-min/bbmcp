export type GlobalStore = typeof globalThis & Record<string, unknown>;

export const readGlobalStore = (): GlobalStore => globalThis as GlobalStore;

export const readGlobalValue = (key: string): unknown => readGlobalStore()[key];

export const writeGlobalValue = (key: string, value: unknown): void => {
  readGlobalStore()[key] = value;
};

export const deleteGlobalValue = (key: string): void => {
  delete readGlobalStore()[key];
};


