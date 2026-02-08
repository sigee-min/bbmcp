import type { AutoUvAtlasPayload, AutoUvAtlasResult, Capabilities, ToolError } from '@ashfox/contracts/types/internal';
import { ProjectSession, SessionState } from '../session';
import { EditorPort } from '../ports/editor';
import { BoneService } from './model/BoneService';
import { CubeService } from './model/CubeService';
import { MeshService } from './model/MeshService';
import type { MeshUvPolicy } from '../domain/mesh/autoUv';
import { fail, type UsecaseResult } from './result';
import { MODEL_MESH_UNSUPPORTED_FORMAT } from '../shared/messages';

export interface ModelServiceDeps {
  session: ProjectSession;
  editor: EditorPort;
  capabilities: Capabilities;
  getSnapshot: () => SessionState;
  ensureActive: () => ToolError | null;
  ensureRevisionMatch: (ifRevision?: string) => ToolError | null;
  autoUvAtlas?: (payload: AutoUvAtlasPayload) => UsecaseResult<AutoUvAtlasResult>;
  runWithoutRevisionGuard?: <T>(fn: () => T) => T;
}

export class ModelService {
  private readonly session: ProjectSession;
  private readonly capabilities: Capabilities;
  private readonly boneService: BoneService;
  private readonly cubeService: CubeService;
  private readonly meshService: MeshService;

  constructor(deps: ModelServiceDeps) {
    this.session = deps.session;
    this.capabilities = deps.capabilities;
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
      ensureRevisionMatch: deps.ensureRevisionMatch,
      autoUvAtlas: deps.autoUvAtlas,
      runWithoutRevisionGuard: deps.runWithoutRevisionGuard
    });
    this.meshService = new MeshService({
      session: deps.session,
      editor: deps.editor,
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

  addMesh(payload: {
    id?: string;
    name: string;
    bone?: string;
    boneId?: string;
    origin?: [number, number, number];
    rotation?: [number, number, number];
    visibility?: boolean;
    uvPolicy?: MeshUvPolicy;
    vertices: Array<{ id: string; pos: [number, number, number] }>;
    faces: Array<{
      id?: string;
      vertices: string[];
      uv?: Array<{ vertexId: string; uv: [number, number] }>;
      texture?: string | false;
    }>;
    ifRevision?: string;
  }): UsecaseResult<{ id: string; name: string }> {
    const unsupported = this.ensureMeshesSupported();
    if (unsupported) return fail(unsupported);
    return this.meshService.addMesh(payload);
  }

  updateMesh(payload: {
    id?: string;
    name?: string;
    newName?: string;
    bone?: string;
    boneId?: string;
    boneRoot?: boolean;
    origin?: [number, number, number];
    rotation?: [number, number, number];
    visibility?: boolean;
    uvPolicy?: MeshUvPolicy;
    vertices?: Array<{ id: string; pos: [number, number, number] }>;
    faces?: Array<{
      id?: string;
      vertices: string[];
      uv?: Array<{ vertexId: string; uv: [number, number] }>;
      texture?: string | false;
    }>;
    ifRevision?: string;
  }): UsecaseResult<{ id: string; name: string }> {
    const unsupported = this.ensureMeshesSupported();
    if (unsupported) return fail(unsupported);
    return this.meshService.updateMesh(payload);
  }

  deleteMesh(payload: {
    id?: string;
    name?: string;
    ids?: string[];
    names?: string[];
    ifRevision?: string;
  }): UsecaseResult<{ id: string; name: string; deleted: Array<{ id?: string; name: string }> }> {
    const unsupported = this.ensureMeshesSupported();
    if (unsupported) return fail(unsupported);
    return this.meshService.deleteMesh(payload);
  }

  private ensureMeshesSupported(): ToolError | null {
    const format = this.session.snapshot().format;
    if (!format) return null;
    const capability = this.capabilities.formats.find((entry) => entry.format === format);
    if (!capability || !capability.enabled || !capability.flags?.meshes) {
      return { code: 'unsupported_format', message: MODEL_MESH_UNSUPPORTED_FORMAT };
    }
    return null;
  }
}






