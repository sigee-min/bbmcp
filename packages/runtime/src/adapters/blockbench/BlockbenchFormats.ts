import { FormatDescriptor, FormatPort } from '../../ports/formats';
import { readBlockbenchGlobals } from '../../types/blockbench';

export class BlockbenchFormats implements FormatPort {
  listFormats(): FormatDescriptor[] {
    const globals = readBlockbenchGlobals();
    const formats = globals.Formats ?? globals.ModelFormat?.formats ?? {};
    if (!formats || typeof formats !== 'object') return [];
    return Object.entries(formats).map(([id, format]) => {
      const singleTexture =
        typeof format?.single_texture === 'boolean' ? format.single_texture : undefined;
      const perTextureUvSize =
        typeof format?.per_texture_uv_size === 'boolean' ? format.per_texture_uv_size : undefined;
      const boxUv = typeof format?.box_uv === 'boolean' ? format.box_uv : undefined;
      const optionalBoxUv =
        typeof format?.optional_box_uv === 'boolean' ? format.optional_box_uv : undefined;
      const uvRotation = typeof format?.uv_rotation === 'boolean' ? format.uv_rotation : undefined;
      const animationMode =
        typeof format?.animation_mode === 'boolean' ? format.animation_mode : undefined;
      const boneRig = typeof format?.bone_rig === 'boolean' ? format.bone_rig : undefined;
      const armatureRig = typeof format?.armature_rig === 'boolean' ? format.armature_rig : undefined;
      const meshes = typeof format?.meshes === 'boolean' ? format.meshes : undefined;
      const imageEditor = typeof format?.image_editor === 'boolean' ? format.image_editor : undefined;
      return {
        id,
        name: format?.name ?? id,
        ...(singleTexture !== undefined ? { singleTexture } : {}),
        ...(perTextureUvSize !== undefined ? { perTextureUvSize } : {}),
        ...(boxUv !== undefined ? { boxUv } : {}),
        ...(optionalBoxUv !== undefined ? { optionalBoxUv } : {}),
        ...(uvRotation !== undefined ? { uvRotation } : {}),
        ...(animationMode !== undefined ? { animationMode } : {}),
        ...(boneRig !== undefined ? { boneRig } : {}),
        ...(armatureRig !== undefined ? { armatureRig } : {}),
        ...(meshes !== undefined ? { meshes } : {}),
        ...(imageEditor !== undefined ? { imageEditor } : {})
      };
    });
  }

  getActiveFormatId(): string | null {
    const globals = readBlockbenchGlobals();
    const active = globals.Format ?? globals.ModelFormat?.selected ?? null;
    return active?.id ?? null;
  }
}


