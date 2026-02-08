import assert from 'node:assert/strict';

import { getTextureDataUri } from '../src/adapters/blockbench/texture/textureData';

const withGlobals = (overrides: Record<string, unknown>, fn: () => void) => {
  const globals = globalThis as Record<string, unknown>;
  const previous = Object.entries(overrides).map(([key, value]) => ({
    key,
    exists: Object.prototype.hasOwnProperty.call(globals, key),
    value: globals[key],
    next: value
  }));
  for (const entry of previous) {
    if (entry.next === undefined) delete globals[entry.key];
    else globals[entry.key] = entry.next;
  }
  try {
    fn();
  } finally {
    for (const entry of previous) {
      if (entry.exists) globals[entry.key] = entry.value;
      else delete globals[entry.key];
    }
  }
};

{
  assert.equal(getTextureDataUri(null as never), null);
}

{
  const uri = getTextureDataUri({
    getDataUrl: () => 'data:image/png;base64,AAAA'
  } as never);
  assert.equal(uri, 'data:image/png;base64,AAAA');
}

{
  const uri = getTextureDataUri({
    getBase64: () => 'BBBB'
  } as never);
  assert.equal(uri, 'data:image/png;base64,BBBB');
}

{
  const uri = getTextureDataUri({
    getBase64: () => ''
  } as never);
  assert.equal(uri, null);
}

{
  const uri = getTextureDataUri({
    toDataURL: () => 'data:image/png;base64,CCCC'
  } as never);
  assert.equal(uri, 'data:image/png;base64,CCCC');
}

{
  const uri = getTextureDataUri({
    canvas: {
      toDataURL: () => 'data:image/png;base64,DDDD'
    }
  } as never);
  assert.equal(uri, 'data:image/png;base64,DDDD');
}

{
  let drawCalls = 0;
  const tempCanvas = {
    width: 0,
    height: 0,
    getContext: (kind: string) =>
      kind === '2d'
        ? {
            drawImage: () => {
              drawCalls += 1;
            }
          }
        : null,
    toDataURL: () => 'data:image/png;base64,EEEE'
  };
  withGlobals(
    {
      document: {
        createElement: (name: string) => (name === 'canvas' ? tempCanvas : null)
      }
    },
    () => {
      const uri = getTextureDataUri({
        img: { naturalWidth: 16, naturalHeight: 16 }
      } as never);
      assert.equal(uri, 'data:image/png;base64,EEEE');
      assert.equal(drawCalls, 1);
      assert.equal(tempCanvas.width, 16);
      assert.equal(tempCanvas.height, 16);
    }
  );
}

{
  withGlobals(
    {
      document: {
        createElement: () => null
      }
    },
    () => {
      const uri = getTextureDataUri({
        img: { naturalWidth: 16, naturalHeight: 16 }
      } as never);
      assert.equal(uri, null);
    }
  );
}

{
  withGlobals(
    {
      document: {
        createElement: () => ({
          width: 0,
          height: 0,
          getContext: () => null,
          toDataURL: () => 'data:image/png;base64,FFFF'
        })
      }
    },
    () => {
      const uri = getTextureDataUri({
        img: { width: 16, height: 16 }
      } as never);
      assert.equal(uri, null);
    }
  );
}

{
  withGlobals(
    {
      document: {
        createElement: () => ({
          width: 0,
          height: 0,
          getContext: () => ({
            drawImage: () => undefined
          }),
          toDataURL: () => 'data:image/png;base64,GGGG'
        })
      }
    },
    () => {
      const uri = getTextureDataUri({
        img: { width: 0, height: 0 }
      } as never);
      assert.equal(uri, null);
    }
  );
}

{
  withGlobals(
    {
      document: undefined
    },
    () => {
      const uri = getTextureDataUri({ img: { width: 16, height: 16 } } as never);
      assert.equal(uri, null);
    }
  );
}
