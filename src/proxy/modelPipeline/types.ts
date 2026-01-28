import type { EnsureProjectResult, ExportResult, ValidateResult } from '../../types';
import type { PipelineStepsResult } from '../pipelineResult';
import type { RenderPreviewStructured } from '../../types/preview';

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

export type ExplicitFlags = {
  name: boolean;
  parentId: boolean;
  pivot: boolean;
  rotation: boolean;
  scale: boolean;
  visibility: boolean;
};

export type CubeExplicitFlags = {
  name: boolean;
  parentId: boolean;
  fromTo: boolean;
  origin: boolean;
  rotation: boolean;
  inflate: boolean;
  mirror: boolean;
  visibility: boolean;
  boxUv: boolean;
  uvOffset: boolean;
};

export type NormalizedBone = {
  id: string;
  name: string;
  parentId: string | null;
  pivot: Vec3;
  pivotAnchorId?: string;
  rotation: Vec3;
  scale: Vec3;
  visibility?: boolean;
  explicit: ExplicitFlags;
};

export type NormalizedCube = {
  id: string;
  name: string;
  parentId: string;
  from: Vec3;
  to: Vec3;
  origin: Vec3;
  originFromSpec: boolean;
  originAnchorId?: string;
  centerAnchorId?: string;
  rotation: Vec3;
  inflate?: number;
  mirror?: boolean;
  visibility?: boolean;
  boxUv?: boolean;
  uvOffset?: Vec2;
  explicit: CubeExplicitFlags;
};

export type NormalizedModel = {
  bones: NormalizedBone[];
  cubes: NormalizedCube[];
  warnings: string[];
};

export type PlanOp =
  | { op: 'create_bone'; bone: NormalizedBone }
  | { op: 'update_bone'; bone: NormalizedBone; changes: Partial<NormalizedBone> & { newName?: string; parentRoot?: boolean } }
  | { op: 'delete_bone'; id?: string; name?: string }
  | { op: 'create_cube'; cube: NormalizedCube }
  | { op: 'update_cube'; cube: NormalizedCube; changes: Partial<NormalizedCube> & { newName?: string; boneRoot?: boolean } }
  | { op: 'delete_cube'; id?: string; name?: string };

export type ModelPlan = {
  ops: PlanOp[];
  summary: {
    createBones: number;
    updateBones: number;
    deleteBones: number;
    createCubes: number;
    updateCubes: number;
    deleteCubes: number;
  };
};

export type ExistingBone = {
  id?: string;
  name: string;
  parent?: string;
  pivot: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
  visibility?: boolean;
};

export type ExistingCube = {
  id?: string;
  name: string;
  bone: string;
  from: Vec3;
  to: Vec3;
  origin?: Vec3;
  rotation?: Vec3;
  inflate?: number;
  mirror?: boolean;
  visibility?: boolean;
  boxUv?: boolean;
  uvOffset?: Vec2;
};

export type AppliedReport = {
  created: { bones: string[]; cubes: string[] };
  updated: { bones: string[]; cubes: string[] };
  deleted: { bones: string[]; cubes: string[] };
};

export type ModelPipelineSteps = {
  ensureProject?: EnsureProjectResult;
  warnings?: string[];
  plan?: ModelPlan['summary'];
  planOps?: ModelPlan['ops'];
  apply?: AppliedReport;
  preview?: RenderPreviewStructured;
  validate?: ValidateResult;
  export?: ExportResult;
};

export type ModelPipelineResult = PipelineStepsResult<
  ModelPipelineSteps,
  { plan?: ModelPlan; report?: AppliedReport; applied?: boolean; planOnly?: boolean }
>;
