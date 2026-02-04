import type { Capabilities, ToolError } from '../types';
import { ProjectSession, SessionState } from '../session';
import { EditorPort } from '../ports/editor';
import { BoneService } from './model/BoneService';
import { CubeService } from './model/CubeService';
import type { UsecaseResult } from './result';

export interface ModelServiceDeps {
  session: ProjectSession;
  editor: EditorPort;
  capabilities: Capabilities;
  getSnapshot: () => SessionState;
  ensureActive: () => ToolError | null;
  ensureRevisionMatch: (ifRevision?: string) => ToolError | null;
}

export class ModelService {
  private readonly boneService: BoneService;
  private readonly cubeService: CubeService;

  constructor(deps: ModelServiceDeps) {
    this.boneService = new BoneService({
      session: deps.session,
      editor: deps.editor,
      getSnapshot: deps.getSnapshot,
      ensureActive: deps.ensureActive,
      ensureRevisionMatch: deps.ensureRevisionMatch
    });
    this.cubeService = new CubeService({
      session: deps.session,
      editor: deps.editor,
      capabilities: deps.capabilities,
      getSnapshot: deps.getSnapshot,
      ensureActive: deps.ensureActive,
      ensureRevisionMatch: deps.ensureRevisionMatch
    });
  }

  addBone(payload: {
    id?: string;
    name: string;
    parent?: string;
    parentId?: string;
    pivot?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
    visibility?: boolean;
    ifRevision?: string;
  }): UsecaseResult<{ id: string; name: string }> {
    return this.boneService.addBone(payload);
  }

  updateBone(payload: {
    id?: string;
    name?: string;
    newName?: string;
    parent?: string;
    parentId?: string;
    parentRoot?: boolean;
    pivot?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
    visibility?: boolean;
    ifRevision?: string;
  }): UsecaseResult<{ id: string; name: string }> {
    return this.boneService.updateBone(payload);
  }

  deleteBone(payload: {
    id?: string;
    name?: string;
    ids?: string[];
    names?: string[];
    ifRevision?: string;
  }): UsecaseResult<{
    id: string;
    name: string;
    removedBones: number;
    removedCubes: number;
    deleted: Array<{ id?: string; name: string }>;
  }> {
    return this.boneService.deleteBone(payload);
  }

  addCube(payload: {
    id?: string;
    name: string;
    from: [number, number, number];
    to: [number, number, number];
    bone?: string;
    boneId?: string;
    origin?: [number, number, number];
    rotation?: [number, number, number];
    inflate?: number;
    mirror?: boolean;
    visibility?: boolean;
    boxUv?: boolean;
    uvOffset?: [number, number];
    ifRevision?: string;
  }): UsecaseResult<{ id: string; name: string }> {
    return this.cubeService.addCube(payload);
  }

  updateCube(payload: {
    id?: string;
    name?: string;
    newName?: string;
    bone?: string;
    boneId?: string;
    boneRoot?: boolean;
    from?: [number, number, number];
    to?: [number, number, number];
    origin?: [number, number, number];
    rotation?: [number, number, number];
    inflate?: number;
    mirror?: boolean;
    visibility?: boolean;
    boxUv?: boolean;
    uvOffset?: [number, number];
    ifRevision?: string;
  }): UsecaseResult<{ id: string; name: string }> {
    return this.cubeService.updateCube(payload);
  }

  deleteCube(payload: {
    id?: string;
    name?: string;
    ids?: string[];
    names?: string[];
    ifRevision?: string;
  }): UsecaseResult<{ id: string; name: string; deleted: Array<{ id?: string; name: string }> }> {
    return this.cubeService.deleteCube(payload);
  }
}





