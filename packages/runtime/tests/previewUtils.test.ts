import assert from 'node:assert/strict';

import {
  applyAngle,
  applyAnimationState,
  normalizeAngle,
  parseDataUrl,
  restoreAnimation,
  restoreCamera,
  selectPreview,
  snapshotAnimation,
  snapshotCamera
} from '../src/adapters/blockbench/preview/previewUtils';

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

// parseDataUrl should validate malformed payloads and normalize valid base64.
{
  const invalid = parseDataUrl('data:image/png;base64');
  assert.equal(invalid.ok, false);

  const notBase64 = parseDataUrl('data:text/plain,abc');
  assert.equal(notBase64.ok, false);

  const emptyPayload = parseDataUrl('data:image/png;base64,    ');
  assert.equal(emptyPayload.ok, false);

  const valid = parseDataUrl('data:image/png;base64, Q Q == ');
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.value.mime, 'image/png');
    assert.equal(valid.value.byteLength, 1);
    assert.equal(valid.value.dataUri, 'data:image/png;base64,QQ==');
  }
}

// Camera snapshot/restore should round-trip values and zoom projection updates.
{
  let projectionUpdates = 0;
  const camera = {
    position: { x: 1, y: 2, z: 3 },
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
    zoom: 1,
    updateProjectionMatrix: () => {
      projectionUpdates += 1;
    }
  };
  const controls = {
    target: { x: 5, y: 6, z: 7 }
  };
  const state = snapshotCamera(camera, controls);
  camera.position.x = 99;
  camera.position.y = 99;
  camera.position.z = 99;
  camera.quaternion.x = 9;
  camera.quaternion.y = 9;
  camera.quaternion.z = 9;
  camera.quaternion.w = 9;
  camera.zoom = 4;
  controls.target.x = 42;
  controls.target.y = 42;
  controls.target.z = 42;

  restoreCamera(camera, controls, state);
  assert.deepEqual(camera.position, { x: 1, y: 2, z: 3 });
  assert.deepEqual(camera.quaternion, { x: 0, y: 0, z: 0, w: 1 });
  assert.deepEqual(controls.target, { x: 5, y: 6, z: 7 });
  assert.equal(camera.zoom, 1);
  assert.equal(projectionUpdates, 1);
}

// Animation snapshot/apply/restore should clamp times and support fallback paths.
{
  let selectCalls = 0;
  let previewCalls = 0;
  let previewTime = 0;
  const clip = {
    name: 'idle',
    length: 1.5,
    time: 0,
    select: () => {
      selectCalls += 1;
    }
  };
  withGlobals(
    {
      Animations: [clip],
      Animation: { selected: clip, all: [clip] },
      Animator: {
        time: 0.25,
        preview: (time: number) => {
          previewCalls += 1;
          previewTime = time;
        }
      }
    },
    () => {
      const snap = snapshotAnimation();
      assert.equal(snap.selectedName, 'idle');
      assert.equal(snap.timeSeconds, 0);

      const applyMissing = applyAnimationState('missing', 1);
      assert.equal(applyMissing.ok, false);
      if (!applyMissing.ok) {
        assert.equal(applyMissing.error.code, 'invalid_payload');
      }

      const applyOk = applyAnimationState('idle', 2);
      assert.equal(applyOk.ok, true);
      assert.equal(selectCalls, 1);
      assert.equal(previewCalls, 1);
      assert.equal(previewTime, 1.5);

      restoreAnimation({ selectedName: 'idle', timeSeconds: 0.5 });
      assert.equal(selectCalls, 2);
      assert.equal(previewCalls, 2);
      assert.equal(previewTime, 0.5);
    }
  );
}

// restoreAnimation should write clip.time when no Animator or clip.setTime exists.
{
  const clip = {
    name: 'idle',
    time: 0
  };
  withGlobals(
    {
      Animations: [clip],
      Animation: { selected: clip, all: [clip] },
      Animator: undefined
    },
    () => {
      restoreAnimation({ selectedName: 'idle', timeSeconds: 0.75 });
      assert.equal(clip.time, 0.75);
    }
  );
}

// Angle/preview helpers should map and choose expected targets.
{
  const angle = normalizeAngle([30, 45]);
  assert.deepEqual(angle, [30, 45, 0]);

  let upRadians = 0;
  let leftRadians = 0;
  let rollRadians = 0;
  applyAngle(
    {
      rotateUp: (radians: number) => {
        upRadians = radians;
      },
      rotateLeft: (radians: number) => {
        leftRadians = radians;
      }
    },
    {
      rotateZ: (radians: number) => {
        rollRadians = radians;
      }
    },
    [90, 180, 45]
  );
  assert.ok(Math.abs(upRadians - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(leftRadians - Math.PI) < 1e-9);
  assert.ok(Math.abs(rollRadians - Math.PI / 4) < 1e-9);

  const selected = { canvas: {} as HTMLCanvasElement };
  const fallback = { canvas: {} as HTMLCanvasElement };
  const chosenA = selectPreview(selected, [fallback]);
  assert.equal(chosenA, selected);

  const chosenB = selectPreview(null, [{}, fallback] as Array<{ canvas?: HTMLCanvasElement }>);
  assert.equal(chosenB, fallback);
}

