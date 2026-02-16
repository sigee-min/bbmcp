import assert from 'node:assert/strict';

import {
  applyTextureDefaults,
  applyTextureDimensions,
  applyTextureImage,
  applyTextureMeta,
  finalizeTextureChange
} from '../src/adapters/blockbench/texture/textureOps';

{
  let afterEditCalls = 0;
  let layerCalls = 0;
  finalizeTextureChange({
    updateChangesAfterEdit: () => {
      afterEditCalls += 1;
    },
    updateLayerChanges: () => {
      layerCalls += 1;
    }
  });
  assert.equal(afterEditCalls, 1);
  assert.equal(layerCalls, 0);
}

{
  let layerForce: boolean | undefined;
  finalizeTextureChange({
    updateLayerChanges: (force?: boolean) => {
      layerForce = force;
    }
  });
  assert.equal(layerForce, true);
}

{
  const tex = {} as { internal?: boolean; keep_size?: boolean };
  applyTextureDefaults(tex);
  assert.equal(tex.internal, true);
  assert.equal(tex.keep_size, true);

  tex.internal = false;
  tex.keep_size = false;
  applyTextureDefaults(tex);
  assert.equal(tex.internal, false);
  assert.equal(tex.keep_size, false);
}

{
  const tex = { width: 8, height: 8 } as { width: number; height: number };
  assert.equal(applyTextureDimensions(tex, 0, 16), false);
  assert.equal(tex.width, 8);
  assert.equal(tex.height, 8);
}

{
  const calls: Array<[number, number]> = [];
  const tex = {
    width: 8,
    height: 8,
    setSize: (w: number, h: number) => {
      calls.push([w, h]);
    }
  } as { width: number; height: number; setSize: (w: number, h: number) => void };
  const changed = applyTextureDimensions(tex, 16, 24);
  assert.equal(changed, true);
  assert.deepEqual(calls, [[16, 24]]);
  assert.equal(tex.width, 16);
  assert.equal(tex.height, 24);
}

{
  const calls: Array<[number, number]> = [];
  const tex = {
    width: 8,
    height: 8,
    resize: (w: number, h: number) => {
      calls.push([w, h]);
    }
  } as { width: number; height: number; resize: (w: number, h: number) => void };
  const changed = applyTextureDimensions(tex, 16, 24);
  assert.equal(changed, true);
  assert.deepEqual(calls, [[16, 24]]);
  assert.equal(tex.width, 16);
  assert.equal(tex.height, 24);
}

{
  const canvas: Partial<HTMLCanvasElement> = { width: 4, height: 4 };
  const tex = {
    width: 4,
    height: 4,
    canvas: canvas as HTMLCanvasElement
  } as { width: number; height: number; canvas: HTMLCanvasElement };
  const changed = applyTextureDimensions(tex, 16, 16);
  assert.equal(changed, true);
  assert.equal(tex.width, 16);
  assert.equal(tex.height, 16);
  assert.equal(tex.canvas.width, 16);
  assert.equal(tex.canvas.height, 16);
}

{
  const calls: string[] = [];
  const ctx: Partial<CanvasRenderingContext2D> = {
    clearRect: () => {
      calls.push('clear');
    },
    drawImage: () => {
      calls.push('draw');
    }
  };
  const canvas: Partial<HTMLCanvasElement> = {
    width: 16,
    height: 16
  };
  const tex = {
    canvas: canvas as HTMLCanvasElement,
    ctx: ctx as CanvasRenderingContext2D
  };
  const ok = applyTextureImage(tex, {} as CanvasImageSource);
  assert.equal(ok, true);
  assert.deepEqual(calls, ['clear', 'draw']);
}

{
  let sawNoUndo = false;
  const tex = {
    edit: (
      fn: (canvas: { width: number; height: number; getContext: (type: string) => unknown }) => unknown,
      options?: { no_undo?: boolean }
    ) => {
      const calls: string[] = [];
      const canvas = {
        width: 8,
        height: 8,
        getContext: (type: string) =>
          type === '2d'
            ? {
                clearRect: () => calls.push('clear'),
                drawImage: () => calls.push('draw')
              }
            : null
      };
      fn(canvas);
      sawNoUndo = options?.no_undo === true;
      assert.deepEqual(calls, ['clear', 'draw']);
    }
  };
  const ok = applyTextureImage(tex, {} as CanvasImageSource);
  assert.equal(ok, true);
  assert.equal(sawNoUndo, true);
}

{
  const ok = applyTextureImage({}, {} as CanvasImageSource);
  assert.equal(ok, false);
}

{
  const tex = {
    extend: (patch: Record<string, unknown>) => {
      assert.deepEqual(patch, {
        namespace: 'minecraft',
        render_mode: 'normal',
        frame_time: 2
      });
    }
  } as { extend: (patch: Record<string, unknown>) => void; namespace?: string };
  applyTextureMeta(tex, {
    namespace: 'minecraft',
    renderMode: 'normal',
    frameTime: 2
  });
  assert.equal(tex.namespace, undefined);
}

{
  const tex = {} as { render_mode?: string; frame_time?: number; visible?: boolean };
  applyTextureMeta(tex, {
    renderMode: 'solid',
    frameTime: 4,
    visible: false
  });
  assert.deepEqual(tex, { render_mode: 'solid', frame_time: 4, visible: false });
}

{
  const tex = { keep_size: true } as { keep_size: boolean };
  applyTextureMeta(tex, {});
  assert.deepEqual(tex, { keep_size: true });
}
