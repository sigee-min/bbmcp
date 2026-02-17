import assert from 'node:assert/strict';
import { fromStorageKey, toStoragePointer, toStorageKey } from '../src/persistence/infrastructure/blobKey';
import { registerAsync } from './helpers';

registerAsync(
  (async () => {
    const normalized = toStoragePointer(
      {
        bucket: ' assets ',
        key: '\\models\\demo\\model.json'
      },
      '/prefix/'
    );
    assert.deepEqual(normalized, {
      bucket: 'assets',
      key: 'models/demo/model.json',
      storageKey: 'prefix/models/demo/model.json'
    });

    assert.equal(toStorageKey(' /demo/mesh.json ', 'models'), 'models/demo/mesh.json');
    assert.equal(fromStorageKey('models/demo/mesh.json', 'models'), 'demo/mesh.json');
    assert.equal(fromStorageKey('other/demo/mesh.json', 'models'), 'other/demo/mesh.json');

    const noPrefix = toStoragePointer(
      {
        bucket: 'bucket',
        key: 'demo/model.json'
      },
      undefined
    );
    assert.equal(noPrefix.storageKey, 'demo/model.json');

    assert.throws(
      () =>
        toStoragePointer(
          {
            bucket: 'bad/bucket',
            key: 'demo/model.json'
          },
          'models'
        ),
      /bucket must not include "\/"\./
    );
  })()
);
