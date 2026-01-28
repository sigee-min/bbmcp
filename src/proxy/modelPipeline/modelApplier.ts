import type { ToolResponse } from '../../types';
import type { ToolService } from '../../usecases/ToolService';
import type { MetaOptions } from '../meta';
import { isUsecaseError, usecaseError } from '../guardHelpers';
import type { AppliedReport, PlanOp } from './types';

export const applyPlanOps = (
  ops: PlanOp[],
  context: { service: ToolService; ifRevision?: string; meta: MetaOptions }
): ToolResponse<AppliedReport> => {
  const applied: AppliedReport = {
    created: { bones: [], cubes: [] },
    updated: { bones: [], cubes: [] },
    deleted: { bones: [], cubes: [] }
  };

  for (const op of ops) {
    if (op.op === 'create_bone') {
      const res = context.service.addBone({
        id: op.bone.id,
        name: op.bone.name,
        parentId: op.bone.parentId ?? undefined,
        pivot: op.bone.pivot,
        rotation: op.bone.rotation,
        scale: op.bone.scale,
        visibility: op.bone.visibility,
        ifRevision: context.ifRevision
      });
      if (isUsecaseError(res)) return usecaseError(res, context.meta, context.service);
      applied.created.bones.push(op.bone.id);
      continue;
    }
    if (op.op === 'update_bone') {
      const res = context.service.updateBone({
        id: op.bone.id,
        name: op.bone.name,
        newName: op.changes.newName,
        parentId: op.changes.parentId ?? undefined,
        parentRoot: op.changes.parentRoot,
        pivot: op.changes.pivot,
        rotation: op.changes.rotation,
        scale: op.changes.scale,
        visibility: op.changes.visibility,
        ifRevision: context.ifRevision
      });
      if (isUsecaseError(res)) return usecaseError(res, context.meta, context.service);
      applied.updated.bones.push(op.bone.id);
      continue;
    }
    if (op.op === 'delete_bone') {
      const res = context.service.deleteBone({ id: op.id, name: op.name, ifRevision: context.ifRevision });
      if (isUsecaseError(res)) return usecaseError(res, context.meta, context.service);
      applied.deleted.bones.push(op.id ?? op.name ?? 'unknown');
      continue;
    }
    if (op.op === 'create_cube') {
      const res = context.service.addCube({
        id: op.cube.id,
        name: op.cube.name,
        boneId: op.cube.parentId,
        from: op.cube.from,
        to: op.cube.to,
        origin: op.cube.origin,
        rotation: op.cube.rotation,
        inflate: op.cube.inflate,
        mirror: op.cube.mirror,
        visibility: op.cube.visibility,
        boxUv: op.cube.boxUv,
        uvOffset: op.cube.uvOffset,
        ifRevision: context.ifRevision
      });
      if (isUsecaseError(res)) return usecaseError(res, context.meta, context.service);
      applied.created.cubes.push(op.cube.id);
      continue;
    }
    if (op.op === 'update_cube') {
      const res = context.service.updateCube({
        id: op.cube.id,
        name: op.cube.name,
        newName: op.changes.newName,
        boneId: op.changes.parentId ?? undefined,
        from: op.changes.from,
        to: op.changes.to,
        origin: op.changes.origin,
        rotation: op.changes.rotation,
        inflate: op.changes.inflate,
        mirror: op.changes.mirror,
        visibility: op.changes.visibility,
        boxUv: op.changes.boxUv,
        uvOffset: op.changes.uvOffset,
        ifRevision: context.ifRevision
      });
      if (isUsecaseError(res)) return usecaseError(res, context.meta, context.service);
      applied.updated.cubes.push(op.cube.id);
      continue;
    }
    if (op.op === 'delete_cube') {
      const res = context.service.deleteCube({ id: op.id, name: op.name, ifRevision: context.ifRevision });
      if (isUsecaseError(res)) return usecaseError(res, context.meta, context.service);
      applied.deleted.cubes.push(op.id ?? op.name ?? 'unknown');
    }
  }

  return { ok: true, data: applied };
};
