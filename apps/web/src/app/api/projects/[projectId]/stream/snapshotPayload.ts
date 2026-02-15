import type { NativeProjectSnapshot } from '../../../../../lib/nativePipelineStore';

export const buildSnapshotPayload = (project: NativeProjectSnapshot, revision: number) => ({
  projectId: project.projectId,
  name: project.name,
  revision,
  hasGeometry: project.hasGeometry,
  ...(project.focusAnchor ? { focusAnchor: [project.focusAnchor[0], project.focusAnchor[1], project.focusAnchor[2]] } : {}),
  hierarchy: project.hierarchy.map((node) => ({
    id: node.id,
    name: node.name,
    kind: node.kind,
    children: node.children.map((child) => ({
      id: child.id,
      name: child.name,
      kind: child.kind,
      children: []
    }))
  })),
  animations: project.animations.map((animation) => ({
    id: animation.id,
    name: animation.name,
    length: animation.length,
    loop: animation.loop
  })),
  stats: {
    bones: project.stats.bones,
    cubes: project.stats.cubes
  }
});
