import assert from 'node:assert/strict';

import { BlockbenchViewportRefresher } from '../../src/adapters/blockbench/BlockbenchViewportRefresher';
import type { CanvasUpdateViewOptions } from '../../src/types/blockbench';
import { noopLog } from './helpers';
import { withGlobals } from './support/withGlobals';

{
  const refresher = new BlockbenchViewportRefresher(noopLog);
  let updateViewCalls = 0;
  let previewRenderCalls = 0;
  let lastUpdateViewOptions: CanvasUpdateViewOptions | null = null;
  withGlobals(
    {
      Canvas: {
        updateView: (options: CanvasUpdateViewOptions) => {
          updateViewCalls += 1;
          lastUpdateViewOptions = options;
        }
      },
      Preview: {
        selected: {
          render: () => {
            previewRenderCalls += 1;
          }
        }
      }
    },
    () => {
      refresher.refresh({ effect: 'geometry', source: 'update_cube' });
    }
  );
  assert.equal(updateViewCalls, 1);
  assert.equal(lastUpdateViewOptions?.element_aspects?.geometry, true);
  assert.equal(lastUpdateViewOptions?.element_aspects?.uv, true);
  assert.equal(previewRenderCalls, 1);
}

{
  const refresher = new BlockbenchViewportRefresher(noopLog);
  let updateAllPositionsCalls = 0;
  let updateAllCalls = 0;
  withGlobals(
    {
      Canvas: {
        updateAllPositions: () => {
          updateAllPositionsCalls += 1;
        },
        updateAll: () => {
          updateAllCalls += 1;
        }
      },
      Preview: undefined
    },
    () => {
      refresher.refresh({ effect: 'geometry', source: 'add_cube' });
    }
  );
  assert.equal(updateAllPositionsCalls, 1);
  assert.equal(updateAllCalls, 0);
}

{
  const refresher = new BlockbenchViewportRefresher(noopLog);
  const dispatched: Array<{ name: string; payload: unknown }> = [];
  withGlobals(
    {
      Canvas: undefined,
      Preview: undefined,
      Blockbench: {
        dispatchEvent: (name: string, payload: unknown) => {
          dispatched.push({ name, payload });
        }
      }
    },
    () => {
      refresher.refresh({ effect: 'texture', source: 'paint_faces' });
    }
  );
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0]?.name, 'ashfox:viewport_changed');
}

{
  const refresher = new BlockbenchViewportRefresher(noopLog);
  let selectCalls = 0;
  let setTimeCalls = 0;
  let updateViewCalls = 0;
  const clip = {
    time: 0.75,
    select: () => {
      selectCalls += 1;
    },
    setTime: (_time: number) => {
      setTimeCalls += 1;
    }
  };
  withGlobals(
    {
      Animation: { selected: clip },
      Animator: { time: 0.25 },
      Canvas: {
        updateView: (_options: CanvasUpdateViewOptions) => {
          updateViewCalls += 1;
        }
      },
      Preview: {
        selected: {
          render: () => undefined
        }
      }
    },
    () => {
      refresher.refresh({ effect: 'animation', source: 'set_frame_pose' });
    }
  );
  assert.equal(selectCalls, 1);
  assert.equal(setTimeCalls, 1);
  assert.equal(updateViewCalls, 1);
}

{
  const refresher = new BlockbenchViewportRefresher(noopLog);
  let setTimeCalls = 0;
  const clip = { time: 0.5 };
  withGlobals(
    {
      Animation: { selected: clip },
      Animator: {
        time: 0.5,
        setTime: (_time: number) => {
          setTimeCalls += 1;
        }
      },
      Canvas: { updateView: (_options: CanvasUpdateViewOptions) => undefined },
      Preview: undefined
    },
    () => {
      refresher.refresh({ effect: 'animation', source: 'set_frame_pose' });
    }
  );
  assert.equal(setTimeCalls, 1);
}

{
  const refresher = new BlockbenchViewportRefresher(noopLog);
  let previewCalls = 0;
  const clip = { time: 0.25 };
  withGlobals(
    {
      Animation: { selected: clip },
      Animator: {
        time: 0.25,
        preview: (_time: number) => {
          previewCalls += 1;
        }
      },
      Canvas: { updateView: (_options: CanvasUpdateViewOptions) => undefined },
      Preview: undefined
    },
    () => {
      refresher.refresh({ effect: 'animation', source: 'set_frame_pose' });
    }
  );
  assert.equal(previewCalls, 1);
}

{
  const refresher = new BlockbenchViewportRefresher(noopLog);
  const clip = { time: Number.NaN };
  withGlobals(
    {
      Animation: { selected: clip },
      Animator: { time: 1.25 },
      Canvas: { updateView: (_options: CanvasUpdateViewOptions) => undefined },
      Preview: undefined
    },
    () => {
      refresher.refresh({ effect: 'animation', source: 'set_frame_pose' });
    }
  );
  assert.equal(clip.time, 1.25);
}

{
  const refresher = new BlockbenchViewportRefresher(noopLog);
  let textureFallbackCalls = 0;
  withGlobals(
    {
      Canvas: {
        updateAllUVs: () => {
          textureFallbackCalls += 1;
        }
      },
      Preview: undefined
    },
    () => {
      refresher.refresh({ effect: 'texture', source: 'paint_faces' });
    }
  );
  assert.equal(textureFallbackCalls, 1);
}

{
  const refresher = new BlockbenchViewportRefresher(noopLog);
  let renderCalls = 0;
  const preview = {
    render: () => {
      renderCalls += 1;
    }
  };
  withGlobals(
    {
      Canvas: undefined,
      Preview: {
        selected: preview,
        all: [preview]
      }
    },
    () => {
      refresher.refresh({ effect: 'none', source: 'get_project_state' });
    }
  );
  assert.equal(renderCalls, 1);
}

