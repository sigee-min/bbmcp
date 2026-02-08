import { ToolError } from '../../types/internal';
import {
  AssignTextureCommand,
  BoneCommand,
  CubeCommand,
  DeleteMeshCommand,
  DeleteBoneCommand,
  DeleteCubeCommand,
  MeshCommand,
  SetFaceUvCommand,
  TextureUsageQuery,
  TextureUsageResult,
  UpdateBoneCommand,
  UpdateCubeCommand,
  UpdateMeshCommand
} from '../../ports/editor';
import { errorMessage, Logger } from '../../logging';
import type { PreviewItem } from '../../types/blockbench';
import { withAdapterError } from './adapterErrors';
import { buildTextureUsageResult } from './BlockbenchTextureUsage';
import { getCubeApi, getTextureApi } from './blockbenchAdapterUtils';
import { readGlobals } from './blockbenchUtils';
import { collectCubes } from './outlinerLookup';
import { BlockbenchBoneAdapter } from './geometry/BoneAdapter';
import { BlockbenchCubeAdapter } from './geometry/CubeAdapter';
import { BlockbenchMeshAdapter } from './geometry/MeshAdapter';
import { BlockbenchTextureAssignAdapter } from './geometry/TextureAssignAdapter';
import { BlockbenchUvAdapter } from './geometry/UvAdapter';
import { ADAPTER_CUBE_TEXTURE_API_UNAVAILABLE } from '../../shared/messages';

export class BlockbenchGeometryAdapter {
  private readonly log: Logger;
  private readonly bones: BlockbenchBoneAdapter;
  private readonly cubes: BlockbenchCubeAdapter;
  private readonly meshes: BlockbenchMeshAdapter;
  private readonly textures: BlockbenchTextureAssignAdapter;
  private readonly uvs: BlockbenchUvAdapter;

  constructor(log: Logger) {
    this.log = log;
    this.bones = new BlockbenchBoneAdapter(log);
    this.cubes = new BlockbenchCubeAdapter(log);
    this.meshes = new BlockbenchMeshAdapter(log);
    this.textures = new BlockbenchTextureAssignAdapter(log);
    this.uvs = new BlockbenchUvAdapter(log);
  }

  addBone(params: BoneCommand): ToolError | null {
    return this.withViewportRefresh(this.bones.addBone(params), 'add_bone');
  }

  updateBone(params: UpdateBoneCommand): ToolError | null {
    return this.withViewportRefresh(this.bones.updateBone(params), 'update_bone');
  }

  deleteBone(params: DeleteBoneCommand): ToolError | null {
    return this.withViewportRefresh(this.bones.deleteBone(params), 'delete_bone');
  }

  addCube(params: CubeCommand): ToolError | null {
    return this.withViewportRefresh(this.cubes.addCube(params), 'add_cube');
  }

  updateCube(params: UpdateCubeCommand): ToolError | null {
    return this.withViewportRefresh(this.cubes.updateCube(params), 'update_cube');
  }

  deleteCube(params: DeleteCubeCommand): ToolError | null {
    return this.withViewportRefresh(this.cubes.deleteCube(params), 'delete_cube');
  }

  addMesh(params: MeshCommand): ToolError | null {
    return this.withViewportRefresh(this.meshes.addMesh(params), 'add_mesh');
  }

  updateMesh(params: UpdateMeshCommand): ToolError | null {
    return this.withViewportRefresh(this.meshes.updateMesh(params), 'update_mesh');
  }

  deleteMesh(params: DeleteMeshCommand): ToolError | null {
    return this.withViewportRefresh(this.meshes.deleteMesh(params), 'delete_mesh');
  }

  assignTexture(params: AssignTextureCommand): ToolError | null {
    return this.withViewportRefresh(this.textures.assignTexture(params), 'assign_texture');
  }

  setFaceUv(params: SetFaceUvCommand): ToolError | null {
    return this.withViewportRefresh(this.uvs.setFaceUv(params), 'set_face_uv');
  }

  getTextureUsage(params: TextureUsageQuery): { result?: TextureUsageResult; error?: ToolError } {
    return withAdapterError(
      this.log,
      'texture usage',
      'texture usage failed',
      () => {
        const cubeApi = getCubeApi();
        const textureApi = getTextureApi();
        if ('error' in cubeApi || 'error' in textureApi) {
          return { error: { code: 'not_implemented', message: ADAPTER_CUBE_TEXTURE_API_UNAVAILABLE } };
        }
        const { TextureCtor } = textureApi;
        const textures = Array.isArray(TextureCtor.all) ? TextureCtor.all : [];
        const cubes = collectCubes();
        return buildTextureUsageResult(params, { textures, cubes });
      },
      (error) => ({ error })
    );
  }

  private withViewportRefresh(result: ToolError | null, source: string): ToolError | null {
    if (result) return result;
    this.refreshViewport(source);
    return null;
  }

  private refreshViewport(source: string): void {
    try {
      const globals = readGlobals();
      const registry = globals.Preview;
      const selected = registry?.selected;
      const all = registry?.all ?? [];
      const candidates = [selected, ...all].filter((entry): entry is PreviewItem => Boolean(entry));
      const rendered = new Set<PreviewItem>();
      for (const preview of candidates) {
        if (rendered.has(preview)) continue;
        if (typeof preview.render === 'function') {
          preview.render();
          rendered.add(preview);
        }
      }
      if (rendered.size === 0) {
        globals.Blockbench?.dispatchEvent?.('bbmcp:viewport_changed', { source });
      }
    } catch (err) {
      this.log.warn('geometry viewport refresh failed', {
        message: errorMessage(err, 'geometry viewport refresh failed'),
        source
      });
    }
  }
}



