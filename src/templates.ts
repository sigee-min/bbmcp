import { RigTemplateKind } from './spec';

type RigTemplatePart = {
  id: string;
  size: [number, number, number];
  offset: [number, number, number];
  inflate?: number;
  mirror?: boolean;
  pivot?: [number, number, number];
  parent?: string;
};

const BIPED_BASE: RigTemplatePart[] = [
  { id: 'root', size: [0, 0, 0], offset: [0, 0, 0] },
  { id: 'body', parent: 'root', size: [8, 12, 4], offset: [-4, 0, -2] },
  { id: 'head', parent: 'body', size: [8, 8, 8], offset: [-4, 12, -4] },
  { id: 'left_arm', parent: 'body', size: [4, 12, 4], offset: [4, 12, -2] },
  { id: 'right_arm', parent: 'body', size: [4, 12, 4], offset: [-8, 12, -2] },
  { id: 'left_leg', parent: 'root', size: [4, 12, 4], offset: [0, -12, -2] },
  { id: 'right_leg', parent: 'root', size: [4, 12, 4], offset: [-4, -12, -2] }
];

const QUAD_BASE: RigTemplatePart[] = [
  { id: 'root', size: [0, 0, 0], offset: [0, 0, 0] },
  { id: 'body', parent: 'root', size: [12, 10, 16], offset: [-6, -2, -8] },
  { id: 'head', parent: 'body', size: [8, 8, 8], offset: [-4, 8, -12] },
  { id: 'leg_front_left', parent: 'body', size: [4, 8, 4], offset: [4, -10, -6] },
  { id: 'leg_front_right', parent: 'body', size: [4, 8, 4], offset: [-8, -10, -6] },
  { id: 'leg_back_left', parent: 'body', size: [4, 8, 4], offset: [4, -10, 6] },
  { id: 'leg_back_right', parent: 'body', size: [4, 8, 4], offset: [-8, -10, 6] }
];

const BLOCK_ENTITY_BASE: RigTemplatePart[] = [
  { id: 'root', size: [16, 16, 16], offset: [0, 0, 0] }
];

export function buildRigTemplate(kind: RigTemplateKind, parts: RigTemplatePart[]): RigTemplatePart[] {
  if (kind === 'biped') return merge(parts, BIPED_BASE);
  if (kind === 'quadruped') return merge(parts, QUAD_BASE);
  if (kind === 'block_entity') return merge(parts, BLOCK_ENTITY_BASE);
  return parts;
}

function merge(customParts: RigTemplatePart[], template: RigTemplatePart[]): RigTemplatePart[] {
  const ids = new Set(customParts.map((p) => p.id));
  const merged = [...template.filter((t) => !ids.has(t.id)), ...customParts];
  return merged;
}
