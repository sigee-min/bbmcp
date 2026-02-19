import type { NativeHierarchyNode, NativeProjectSnapshot, NativeTextureAtlas } from './types';

export interface HierarchyStats {
  bones: number;
  cubes: number;
}

const LEGACY_MOCK_TEXTURE_DATA_PREFIX = 'data:image/svg+xml;base64,';

const isLegacyMockTexture = (texture: NativeTextureAtlas): boolean =>
  texture.textureId === 'atlas-main' &&
  texture.name === 'Main Atlas' &&
  texture.imageDataUrl.startsWith(LEGACY_MOCK_TEXTURE_DATA_PREFIX);

export const cloneHierarchyNode = (node: NativeHierarchyNode): NativeHierarchyNode => ({
  id: node.id,
  name: node.name,
  kind: node.kind,
  children: node.children.map((child) => cloneHierarchyNode(child))
});

export const cloneHierarchy = (nodes: readonly NativeHierarchyNode[]): NativeHierarchyNode[] =>
  nodes.map((node) => cloneHierarchyNode(node));

export const deriveHierarchyStats = (nodes: readonly NativeHierarchyNode[]): HierarchyStats => {
  let bones = 0;
  let cubes = 0;
  const stack = [...nodes];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }
    if (node.kind === 'bone') {
      bones += 1;
    } else {
      cubes += 1;
    }
    if (node.children.length > 0) {
      stack.push(...node.children);
    }
  }

  return { bones, cubes };
};

export const synchronizeProjectSnapshot = (project: NativeProjectSnapshot): boolean => {
  const nextStats = deriveHierarchyStats(project.hierarchy);
  const nextHasGeometry = nextStats.bones > 0 || nextStats.cubes > 0;
  const nextTextures = project.textures.filter((texture) => !isLegacyMockTexture(texture));
  const nextTextureSources = nextTextures.length === 0 ? [] : project.textureSources;

  const statsChanged = project.stats.bones !== nextStats.bones || project.stats.cubes !== nextStats.cubes;
  const geometryChanged = project.hasGeometry !== nextHasGeometry;
  const textureSourcesChanged = JSON.stringify(project.textureSources) !== JSON.stringify(nextTextureSources);
  const texturesChanged = JSON.stringify(project.textures) !== JSON.stringify(nextTextures);

  if (!statsChanged && !geometryChanged && !textureSourcesChanged && !texturesChanged) {
    return false;
  }

  project.stats.bones = nextStats.bones;
  project.stats.cubes = nextStats.cubes;
  project.hasGeometry = nextHasGeometry;
  if (textureSourcesChanged) {
    project.textureSources = nextTextureSources;
  }
  if (texturesChanged) {
    project.textures = nextTextures;
  }
  return true;
};
