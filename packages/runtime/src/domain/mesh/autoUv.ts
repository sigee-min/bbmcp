export type MeshSymmetryAxis = 'none' | 'x' | 'y' | 'z';

export type MeshUvPolicy = {
  symmetryAxis?: MeshSymmetryAxis;
  texelDensity?: number;
  padding?: number;
};
