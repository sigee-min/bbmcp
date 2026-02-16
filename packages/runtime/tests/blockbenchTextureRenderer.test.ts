import assert from 'node:assert/strict';

import { BlockbenchTextureRenderer } from '../src/adapters/blockbench/BlockbenchTextureRenderer';

type MockCtx = {
  imageSmoothingEnabled: boolean;
  createImageData: (width: number, height: number) => { data: Uint8ClampedArray };
  putImageData: (data: { data: Uint8ClampedArray }, x: number, y: number) => void;
  clearRect: (x: number, y: number, width: number, height: number) => void;
  drawImage: (image: CanvasImageSource, x: number, y: number, width: number, height: number) => void;
  getImageData: (x: number, y: number, width: number, height: number) => { data: Uint8ClampedArray };
};

type TestGlobals = {
  document?: unknown;
};

const getGlobals = (): TestGlobals => globalThis as TestGlobals;

const withGlobals = (overrides: TestGlobals, run: () => void) => {
  const globals = getGlobals();
  const before = {
    document: globals.document
  };
  globals.document = overrides.document;
  try {
    run();
  } finally {
    globals.document = before.document;
  }
};

const createCanvas = (ctx: MockCtx | null) => ({
  width: 0,
  height: 0,
  getContext: (kind: string) => (kind === '2d' ? ctx : null)
});

{
  const renderer = new BlockbenchTextureRenderer();
  withGlobals({}, () => {
    const result = renderer.renderPixels({
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([255, 0, 0, 255])
    });
    assert.equal(result.error?.code, 'not_implemented');
  });
}

{
  const renderer = new BlockbenchTextureRenderer();
  withGlobals(
    {
      document: {
        createElement: () => null
      }
    },
    () => {
      const result = renderer.renderPixels({
        width: 1,
        height: 1,
        data: new Uint8ClampedArray([255, 0, 0, 255])
      });
      assert.equal(result.error?.code, 'not_implemented');
    }
  );
}

{
  const renderer = new BlockbenchTextureRenderer();
  withGlobals(
    {
      document: {
        createElement: () => createCanvas(null)
      }
    },
    () => {
      const result = renderer.renderPixels({
        width: 1,
        height: 1,
        data: new Uint8ClampedArray([255, 0, 0, 255])
      });
      assert.equal(result.error?.code, 'not_implemented');
    }
  );
}

{
  const renderer = new BlockbenchTextureRenderer();
  let putCalls = 0;
  let lastWritten = 0;
  const ctx: MockCtx = {
    imageSmoothingEnabled: true,
    createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    putImageData: (imageData) => {
      putCalls += 1;
      lastWritten = imageData.data[0] ?? 0;
    },
    clearRect: () => undefined,
    drawImage: () => undefined,
    getImageData: () => ({ data: new Uint8ClampedArray([9, 8, 7, 6]) })
  };
  withGlobals(
    {
      document: {
        createElement: () => createCanvas(ctx)
      }
    },
    () => {
      const result = renderer.renderPixels({
        width: 1,
        height: 1,
        data: new Uint8ClampedArray([123, 0, 0, 255])
      });
      assert.equal(result.error, undefined);
      assert.equal(result.result?.width, 1);
      assert.equal(result.result?.height, 1);
      assert.ok(result.result?.image);
    }
  );
  assert.equal(putCalls, 1);
  assert.equal(lastWritten, 123);
}

{
  const renderer = new BlockbenchTextureRenderer();
  withGlobals(
    {
      document: {
        createElement: () => createCanvas({
          imageSmoothingEnabled: true,
          createImageData: () => ({ data: new Uint8ClampedArray(0) }),
          putImageData: () => undefined,
          clearRect: () => undefined,
          drawImage: () => undefined,
          getImageData: () => ({ data: new Uint8ClampedArray(0) })
        })
      }
    },
    () => {
      const result = renderer.readPixels({ image: {} as CanvasImageSource, width: 0, height: 8 });
      assert.equal(result.error?.code, 'invalid_payload');
    }
  );
}

{
  const renderer = new BlockbenchTextureRenderer();
  let drawCalls = 0;
  let clearCalls = 0;
  const ctx: MockCtx = {
    imageSmoothingEnabled: true,
    createImageData: () => ({ data: new Uint8ClampedArray(0) }),
    putImageData: () => undefined,
    clearRect: () => {
      clearCalls += 1;
    },
    drawImage: () => {
      drawCalls += 1;
    },
    getImageData: () => ({ data: new Uint8ClampedArray([1, 2, 3, 4]) })
  };
  withGlobals(
    {
      document: {
        createElement: () => createCanvas(ctx)
      }
    },
    () => {
      const result = renderer.readPixels({ image: {} as CanvasImageSource, width: 1, height: 1 });
      assert.equal(result.error, undefined);
      assert.equal(result.result?.width, 1);
      assert.equal(result.result?.height, 1);
      assert.deepEqual(Array.from(result.result?.data ?? []), [1, 2, 3, 4]);
    }
  );
  assert.equal(drawCalls, 1);
  assert.equal(clearCalls, 1);
}

