import type { ProjectSnapshot, ProjectStreamPayload, Vec3 } from './dashboardModel';

const anchor = (x: number, y: number, z: number): Vec3 => [x, y, z];

const BASE_PROJECTS: readonly ProjectSnapshot[] = [
  {
    projectId: 'project-a',
    name: 'Forest Fox',
    revision: 10,
    hasGeometry: true,
    focusAnchor: anchor(0, 24, 0),
    stats: { bones: 8, cubes: 21 },
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
            children: [
              { id: 'cube-body-main', name: 'body_main', kind: 'cube', children: [] },
              { id: 'cube-body-belly', name: 'body_belly', kind: 'cube', children: [] }
            ]
          },
          {
            id: 'bone-tail',
            name: 'tail',
            kind: 'bone',
            children: [
              { id: 'cube-tail-01', name: 'tail_01', kind: 'cube', children: [] },
              { id: 'cube-tail-02', name: 'tail_02', kind: 'cube', children: [] }
            ]
          }
        ]
      }
    ],
    animations: [
      { id: 'anim-idle', name: 'idle', length: 2.4, loop: true },
      { id: 'anim-run', name: 'run', length: 1.1, loop: true }
    ]
  },
  {
    projectId: 'project-b',
    name: 'Desert Lynx',
    revision: 21,
    hasGeometry: true,
    focusAnchor: anchor(1, 18, 0),
    stats: { bones: 5, cubes: 13 },
    hierarchy: [
      {
        id: 'lynx-root',
        name: 'root',
        kind: 'bone',
        children: [
          {
            id: 'lynx-head',
            name: 'head',
            kind: 'bone',
            children: [
              { id: 'lynx-ear-left', name: 'ear_left', kind: 'cube', children: [] },
              { id: 'lynx-ear-right', name: 'ear_right', kind: 'cube', children: [] }
            ]
          }
        ]
      }
    ],
    animations: [
      { id: 'anim-breathe', name: 'breathe', length: 3.2, loop: true },
      { id: 'anim-jump', name: 'jump', length: 0.9, loop: false }
    ]
  },
  {
    projectId: 'project-c',
    name: 'Empty Template',
    revision: 3,
    hasGeometry: false,
    stats: { bones: 0, cubes: 0 },
    hierarchy: [],
    animations: []
  }
];

const cloneSnapshot = (snapshot: ProjectSnapshot): ProjectSnapshot => ({
  ...snapshot,
  focusAnchor: snapshot.focusAnchor ? anchor(snapshot.focusAnchor[0], snapshot.focusAnchor[1], snapshot.focusAnchor[2]) : undefined,
  stats: {
    bones: snapshot.stats.bones,
    cubes: snapshot.stats.cubes
  },
  hierarchy: snapshot.hierarchy.map((node) => cloneHierarchyNode(node)),
  animations: snapshot.animations.map((animation) => ({
    id: animation.id,
    name: animation.name,
    length: animation.length,
    loop: animation.loop
  }))
});

const cloneHierarchyNode = (node: ProjectSnapshot['hierarchy'][number]): ProjectSnapshot['hierarchy'][number] => ({
  id: node.id,
  name: node.name,
  kind: node.kind,
  children: node.children.map((child) => cloneHierarchyNode(child))
});

const readBaseProject = (projectId: string): ProjectSnapshot | null => {
  for (const project of BASE_PROJECTS) {
    if (project.projectId === projectId) {
      return cloneSnapshot(project);
    }
  }
  return null;
};

export const listProjects = (): readonly ProjectSnapshot[] => BASE_PROJECTS.map((project) => cloneSnapshot(project));

export const getProject = (projectId: string): ProjectSnapshot | null => readBaseProject(projectId);

export const buildStreamPayload = (projectId: string, revision: number): ProjectStreamPayload | null => {
  const project = readBaseProject(projectId);
  if (!project) {
    return null;
  }

  const eventRevision = revision < project.revision ? project.revision : revision;
  const tickOffset = Math.max(0, eventRevision - project.revision);

  return {
    projectId: project.projectId,
    revision: eventRevision,
    hasGeometry: project.hasGeometry,
    focusAnchor: project.focusAnchor
      ? anchor(project.focusAnchor[0], project.focusAnchor[1], project.focusAnchor[2])
      : undefined,
    hierarchy: project.hierarchy,
    animations: project.animations.map((animation, index) => ({
      ...animation,
      length: Number((animation.length + (tickOffset % (index + 2)) * 0.01).toFixed(2))
    })),
    stats: {
      bones: project.stats.bones,
      cubes: project.stats.cubes
    }
  };
};
