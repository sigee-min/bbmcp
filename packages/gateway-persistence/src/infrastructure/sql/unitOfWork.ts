export interface SyncUnitOfWork {
  begin: () => void;
  commit: () => void;
  rollback: () => void;
}

export interface AsyncUnitOfWork {
  begin: () => Promise<void>;
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
}

export const runSyncUnitOfWork = <T>(unit: SyncUnitOfWork, work: () => T): T => {
  unit.begin();
  try {
    const result = work();
    unit.commit();
    return result;
  } catch (error) {
    unit.rollback();
    throw error;
  }
};

export const runAsyncUnitOfWork = async <T>(unit: AsyncUnitOfWork, work: () => Promise<T>): Promise<T> => {
  await unit.begin();
  try {
    const result = await work();
    await unit.commit();
    return result;
  } catch (error) {
    await unit.rollback();
    throw error;
  }
};
