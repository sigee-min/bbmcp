import assert from 'node:assert/strict';

import type { Logger } from '../src/logging';
import {
  attachToOutliner,
  moveOutlinerNode,
  normalizeParent,
  removeOutlinerNode
} from '../src/adapters/blockbench/utils/outliner';

const createLogger = () => {
  const warns: Array<{ message: string; meta?: Record<string, unknown> }> = [];
  const logger: Logger = {
    log: () => undefined,
    debug: () => undefined,
    info: () => undefined,
    warn: (message, meta) => warns.push({ message, meta }),
    error: () => undefined
  };
  return { logger, warns };
};

{
  assert.equal(normalizeParent(null), null);
  assert.equal(normalizeParent(undefined), null);
  const withChildren = { name: 'a', children: [] as unknown[] };
  assert.equal(normalizeParent(withChildren as never), withChildren);
  const noChildren = { name: 'b' } as { name: string; children?: unknown };
  const normalized = normalizeParent(noChildren as never);
  assert.equal(normalized, noChildren);
  assert.deepEqual(noChildren.children, []);
  assert.equal(normalizeParent({ children: {} } as never), null);
}

{
  const { logger } = createLogger();
  const node = { name: 'cube' } as { name: string; parent?: unknown };
  assert.equal(moveOutlinerNode(null as never, null as never, undefined, logger, 'cube'), false);
  assert.equal(moveOutlinerNode(node as never, node as never, undefined, logger, 'cube'), false);
  assert.equal(moveOutlinerNode(node as never, null as never, undefined, logger, 'cube'), true);
}

{
  const { logger } = createLogger();
  const root: unknown[] = [];
  const parent = { name: 'body', children: [] as unknown[] };
  const node = {
    name: 'cube',
    parent: null as unknown,
    addTo: (target: typeof parent) => {
      node.parent = target;
      target.children.push(node);
    }
  };
  root.push(node);
  const moved = moveOutlinerNode(node as never, parent as never, { root } as never, logger, 'cube');
  assert.equal(moved, true);
  assert.equal(root.includes(node), false);
  assert.equal(parent.children.includes(node), true);
  assert.equal(node.parent, parent);
}

{
  const { logger, warns } = createLogger();
  const root: unknown[] = [];
  const parent = { name: 'body', children: [] as unknown[] };
  const node = {
    name: 'cube',
    addTo: () => {
      throw new Error('boom');
    }
  };
  const attached = attachToOutliner(parent as never, { root } as never, node as never, logger, 'cube');
  assert.equal(attached, true);
  assert.equal(root.includes(node), true);
  assert.equal(warns.length, 1);
  assert.equal(warns[0].message.includes('fallback to root'), true);
}

{
  const { logger } = createLogger();
  const node = { name: 'cube' };
  const rootNode = { children: [] as unknown[] };
  const attached = attachToOutliner(null, { root: rootNode } as never, node as never, logger, 'cube');
  assert.equal(attached, true);
  assert.equal(rootNode.children.includes(node), true);
  const createdRoot = {} as { root?: unknown[] };
  assert.equal(attachToOutliner(null, createdRoot as never, node as never, logger, 'cube'), true);
  assert.deepEqual(createdRoot.root, [node]);
}

{
  let removed = false;
  const viaRemove = { remove: () => (removed = true) };
  assert.equal(removeOutlinerNode(viaRemove as never, undefined), true);
  assert.equal(removed, true);

  let deleted = false;
  const viaDelete = { delete: () => (deleted = true) };
  assert.equal(removeOutlinerNode(viaDelete as never, undefined), true);
  assert.equal(deleted, true);

  const node = { name: 'cube', parent: null as unknown };
  const rootChildren = [node];
  assert.equal(removeOutlinerNode(node as never, { root: { children: rootChildren } } as never), true);
  assert.equal(rootChildren.length, 0);
  assert.equal(removeOutlinerNode(null as never, undefined), false);
}

