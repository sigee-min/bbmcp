#!/usr/bin/env node
import path from 'node:path';
import { readdir, rm } from 'node:fs/promises';

const rootDir = process.cwd();

const directoriesToRemove = ['apps/web/.ashfox', 'apps/worker/.ashfox', 'apps/gateway/.ashfox'].map((relativePath) =>
  path.resolve(rootDir, relativePath)
);

let removedDirectories = 0;
for (const directoryPath of directoriesToRemove) {
  await rm(directoryPath, { recursive: true, force: true });
  removedDirectories += 1;
}

const appsDir = path.resolve(rootDir, 'apps');
let removedDsStore = 0;

const removeDsStoreRecursively = async (directoryPath) => {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        await removeDsStoreRecursively(fullPath);
        return;
      }
      if (entry.name === '.DS_Store') {
        await rm(fullPath, { force: true });
        removedDsStore += 1;
      }
    })
  );
};

await removeDsStoreRecursively(appsDir);

console.log(
  `[clean:local] removed app-local artifacts (dirs=${removedDirectories}, ds_store=${removedDsStore})`
);
