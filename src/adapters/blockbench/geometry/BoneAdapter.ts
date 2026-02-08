import type { ToolError } from '@ashfox/contracts/types/internal';
import type { Logger } from '../../../logging';
import type { BoneCommand, DeleteBoneCommand, UpdateBoneCommand } from '../../../ports/editor';
import {
  assignVec3,
  attachToOutliner,
  moveOutlinerNode,
  normalizeParent,
  removeOutlinerNode,
  renameEntity,
  setVisibility,
  withUndo
} from '../blockbenchUtils';
import { getGroupApi } from '../blockbenchAdapterUtils';
import { findGroup, findGroupRef } from '../outlinerLookup';
import { withToolErrorAdapterError } from '../adapterErrors';
import { MODEL_BONE_NOT_FOUND, MODEL_PARENT_BONE_NOT_FOUND } from '../../../shared/messages';

export class BlockbenchBoneAdapter {
  private readonly log: Logger;

  constructor(log: Logger) {
    this.log = log;
  }

  addBone(params: BoneCommand): ToolError | null {
    return withToolErrorAdapterError(this.log, 'bone add', 'bone add failed', () => {
      const api = getGroupApi();
      if ('error' in api) return api.error;
      const { GroupCtor, outliner } = api;
      withUndo({ elements: true, outliner: true }, 'Add bone', () => {
        const parent = normalizeParent(findGroup(params.parent));
        const group = new GroupCtor({
          name: params.name,
          origin: params.pivot,
          rotation: params.rotation,
          scale: params.scale
        }).init?.();
        if (group) {
          setVisibility(group, params.visibility);
          if (params.id) group.ashfoxId = params.id;
          const attached = attachToOutliner(parent, outliner, group, this.log, 'bone');
          if (!attached && Array.isArray(outliner?.root)) {
            outliner.root.push(group);
          }
        }
      });
      this.log.info('bone added', { name: params.name, parent: params.parent });
      return null;
    });
  }

  updateBone(params: UpdateBoneCommand): ToolError | null {
    return withToolErrorAdapterError(this.log, 'bone update', 'bone update failed', () => {
      const api = getGroupApi();
      if ('error' in api) return api.error;
      const { outliner } = api;
      const target = findGroupRef(params.name, params.id);
      if (!target) {
        const label = params.id ?? params.name ?? 'unknown';
        return { code: 'invalid_payload', message: MODEL_BONE_NOT_FOUND(label) };
      }
      if (params.id) {
        target.ashfoxId = params.id;
      }
      const parent = params.parentRoot ? null : params.parent ? findGroup(params.parent) : undefined;
      if (params.parent && !parent) {
        return { code: 'invalid_payload', message: MODEL_PARENT_BONE_NOT_FOUND(params.parent) };
      }
      withUndo({ elements: true, outliner: true }, 'Update bone', () => {
        if (params.newName && params.newName !== target.name) {
          renameEntity(target, params.newName);
        }
        if (params.pivot) assignVec3(target, 'origin', params.pivot);
        if (params.rotation) assignVec3(target, 'rotation', params.rotation);
        if (params.scale) assignVec3(target, 'scale', params.scale);
        setVisibility(target, params.visibility);
        if (params.parentRoot || params.parent !== undefined) {
          moveOutlinerNode(target, parent ?? null, outliner, this.log, 'bone');
        }
      });
      this.log.info('bone updated', { name: params.name, newName: params.newName, parent: params.parent });
      return null;
    });
  }

  deleteBone(params: DeleteBoneCommand): ToolError | null {
    return withToolErrorAdapterError(this.log, 'bone delete', 'bone delete failed', () => {
      const api = getGroupApi();
      if ('error' in api) return api.error;
      const { outliner } = api;
      const target = findGroupRef(params.name, params.id);
      if (!target) {
        const label = params.id ?? params.name ?? 'unknown';
        return { code: 'invalid_payload', message: MODEL_BONE_NOT_FOUND(label) };
      }
      withUndo({ elements: true, outliner: true }, 'Delete bone', () => {
        removeOutlinerNode(target, outliner);
      });
      this.log.info('bone deleted', { name: target?.name ?? params.name });
      return null;
    });
  }
}


