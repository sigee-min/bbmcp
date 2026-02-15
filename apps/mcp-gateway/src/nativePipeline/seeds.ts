import type { NativeProjectSnapshot } from './types';

const seeds: NativeProjectSnapshot[] = [
  {
    projectId: 'project-a',
    name: 'Forest Fox',
    revision: 10,
    hasGeometry: true,
    focusAnchor: [0, 24, 0],
    hierarchy: [
      {
        id: 'bone-root',
        name: 'root',
        kind: 'bone',
        children: [
          {
            id: 'bone-body',
            name: 'body',
            kind: 'bone',
            children: []
          }
        ]
      }
    ],
    animations: [
      {
        id: 'anim-idle',
        name: 'idle',
        length: 2.4,
        loop: true
      }
    ],
    stats: {
      bones: 8,
      cubes: 21
    }
  },
  {
    projectId: 'project-b',
    name: 'Desert Lynx',
    revision: 21,
    hasGeometry: true,
    focusAnchor: [1, 18, 0],
    hierarchy: [],
    animations: [
      {
        id: 'anim-breathe',
        name: 'breathe',
        length: 3.2,
        loop: true
      }
    ],
    stats: {
      bones: 5,
      cubes: 13
    }
  },
  {
    projectId: 'project-c',
    name: 'Empty Template',
    revision: 3,
    hasGeometry: false,
    hierarchy: [],
    animations: [],
    stats: {
      bones: 0,
      cubes: 0
    }
  }
];

export const getDefaultProjects = (): NativeProjectSnapshot[] =>
  seeds.map((project) => ({
    ...project,
    ...(project.focusAnchor ? { focusAnchor: [project.focusAnchor[0], project.focusAnchor[1], project.focusAnchor[2]] } : {}),
    hierarchy: project.hierarchy.map((node) => ({
      ...node,
      children: node.children.map((child) => ({ ...child, children: [] }))
    })),
    animations: project.animations.map((animation) => ({ ...animation })),
    stats: { ...project.stats }
  }));
