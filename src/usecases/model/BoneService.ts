import type { ToolError } from '../../types';
import type { EditorPort } from '../../ports/editor';
import type { ProjectSession, SessionState } from '../../session';
import { ok, fail, type UsecaseResult } from '../result';
import { withActiveAndRevision } from '../guards';
import { resolveBoneTarget } from '../targetResolvers';
import { collectDescendantBones, isDescendantBone, resolveBoneNameById } from '../../domain/sessionLookup';
import {
  MODEL_BONE_DESCENDANT_PARENT,
  MODEL_BONE_EXISTS,
  MODEL_BONE_ID_EXISTS,
  MODEL_BONE_ID_OR_NAME_REQUIRED,
  MODEL_BONE_NOT_FOUND,
  MODEL_BONE_NAME_REQUIRED,
  MODEL_BONE_NAME_REQUIRED_FIX,
  MODEL_BONE_SELF_PARENT,
  MODEL_PARENT_BONE_NOT_FOUND
} from '../../shared/messages';
import { ensureNonBlankFields } from './validators';
import { ensureIdAvailable, ensureNameAvailable, ensureRenameAvailable, resolveEntityId } from '../crudChecks';
import { resolveTargets } from '../targetSelectors';
import { buildIdNameMismatchMessage } from '../../shared/targetMessages';

export interface BoneServiceDeps {
  session: ProjectSession;
  editor: EditorPort;
  getSnapshot: () => SessionState;
  ensureActive: () => ToolError | null;
  ensureRevisionMatch: (ifRevision?: string) => ToolError | null;
}

export class BoneService {
  private readonly session: ProjectSession;
  private readonly editor: EditorPort;
  private readonly getSnapshot: () => SessionState;
  private readonly ensureActive: () => ToolError | null;
  private readonly ensureRevisionMatch: (ifRevision?: string) => ToolError | null;

  constructor(deps: BoneServiceDeps) {
    this.session = deps.session;
    this.editor = deps.editor;
    this.getSnapshot = deps.getSnapshot;
    this.ensureActive = deps.ensureActive;
    this.ensureRevisionMatch = deps.ensureRevisionMatch;
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
    return withActiveAndRevision(
      this.ensureActive,
      this.ensureRevisionMatch,
      payload.ifRevision,
      () => {
        const snapshot = this.getSnapshot();
        if (!payload.name) {
          return fail({
            code: 'invalid_payload',
            message: MODEL_BONE_NAME_REQUIRED,
            fix: MODEL_BONE_NAME_REQUIRED_FIX
          });
        }
        const blankErr = ensureNonBlankFields([
          [payload.name, 'Bone name'],
          [payload.parent, 'Parent bone name'],
          [payload.parentId, 'Parent bone id']
        ]);
        if (blankErr) return fail(blankErr);
        const parentName = payload.parentId
          ? resolveBoneNameById(snapshot.bones, payload.parentId)
          : payload.parent;
        const parent = parentName ?? undefined;
        if (payload.parentId && !parentName) {
          return fail({ code: 'invalid_payload', message: MODEL_PARENT_BONE_NOT_FOUND(payload.parentId) });
        }
        const nameErr = ensureNameAvailable(snapshot.bones, payload.name, MODEL_BONE_EXISTS);
        if (nameErr) return fail(nameErr);
        const id = resolveEntityId(undefined, payload.id, 'bone');
        const idErr = ensureIdAvailable(snapshot.bones, id, MODEL_BONE_ID_EXISTS);
        if (idErr) return fail(idErr);
        const pivot = payload.pivot ?? [0, 0, 0];
        const err = this.editor.addBone({
          id,
          name: payload.name,
          parent,
          pivot,
          rotation: payload.rotation,
          scale: payload.scale,
          visibility: payload.visibility
        });
        if (err) return fail(err);
        this.session.addBone({
          id,
          name: payload.name,
          parent,
          pivot,
          rotation: payload.rotation,
          scale: payload.scale,
          visibility: payload.visibility
        });
        return ok({ id, name: payload.name });
      }
    );
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
    return withActiveAndRevision(
      this.ensureActive,
      this.ensureRevisionMatch,
      payload.ifRevision,
      () => {
        const snapshot = this.getSnapshot();
        const blankErr = ensureNonBlankFields([
          [payload.id, 'Bone id'],
          [payload.name, 'Bone name'],
          [payload.newName, 'Bone newName'],
          [payload.parent, 'Parent bone name'],
          [payload.parentId, 'Parent bone id']
        ]);
        if (blankErr) return fail(blankErr);
        const resolved = resolveBoneTarget(snapshot.bones, payload.id, payload.name);
        if (resolved.error) return fail(resolved.error);
        const target = resolved.target!;
        const targetName = target.name;
        const targetId = resolveEntityId(target.id, payload.id, 'bone');
        const renameErr = ensureRenameAvailable(snapshot.bones, payload.newName, targetName, MODEL_BONE_EXISTS);
        if (renameErr) return fail(renameErr);
        const parentRes = this.resolveParentUpdate(snapshot, targetName, {
          parentRoot: payload.parentRoot,
          parentId: payload.parentId,
          parent: payload.parent
        });
        if (!parentRes.ok) return fail(parentRes.error);
        const parentUpdate = parentRes.value;
        const parentForEditor = typeof parentUpdate === 'string' ? parentUpdate : undefined;
        const err = this.editor.updateBone({
          id: targetId,
          name: targetName,
          newName: payload.newName,
          parent: payload.parentRoot ? undefined : parentForEditor,
          parentRoot: payload.parentRoot,
          pivot: payload.pivot,
          rotation: payload.rotation,
          scale: payload.scale,
          visibility: payload.visibility
        });
        if (err) return fail(err);
        this.session.updateBone(targetName, {
          id: targetId,
          newName: payload.newName,
          parent: parentUpdate,
          pivot: payload.pivot,
          rotation: payload.rotation,
          scale: payload.scale,
          visibility: payload.visibility
        });
        return ok({ id: targetId, name: payload.newName ?? targetName });
      }
    );
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
    return withActiveAndRevision(
      this.ensureActive,
      this.ensureRevisionMatch,
      payload.ifRevision,
      () => {
        const snapshot = this.getSnapshot();
        const resolvedTargets = resolveTargets(
          snapshot.bones,
          payload,
          { id: 'Bone id', name: 'Bone name' },
          { message: MODEL_BONE_ID_OR_NAME_REQUIRED },
          {
            required: { message: MODEL_BONE_ID_OR_NAME_REQUIRED },
            mismatch: { kind: 'Bone', plural: 'bones', message: buildIdNameMismatchMessage },
            notFound: MODEL_BONE_NOT_FOUND
          }
        );
        if (!resolvedTargets.ok) return fail(resolvedTargets.error);
        const targets = resolvedTargets.value;
        const parentByName = new Map(snapshot.bones.map((bone) => [bone.name, bone.parent ?? null]));
        const targetNameSet = new Set(targets.map((target) => target.name));
        const topLevelTargets = targets.filter((target) => {
          let parent = parentByName.get(target.name);
          const visited = new Set<string>([target.name]);
          while (parent) {
            if (visited.has(parent)) return true;
            visited.add(parent);
            if (targetNameSet.has(parent)) return false;
            parent = parentByName.get(parent);
          }
          return true;
        });
        const boneByName = new Map(snapshot.bones.map((bone) => [bone.name, bone]));
        const removedNameSet = new Set<string>();
        const deleted: Array<{ id?: string; name: string }> = [];
        for (const target of topLevelTargets) {
          const descendants = collectDescendantBones(snapshot.bones, target.name);
          const chain = [target.name, ...descendants];
          for (const name of chain) {
            if (removedNameSet.has(name)) continue;
            removedNameSet.add(name);
            const bone = boneByName.get(name);
            deleted.push({ id: bone?.id ?? undefined, name });
          }
        }
        for (const target of topLevelTargets) {
          const err = this.editor.deleteBone({ id: target.id ?? undefined, name: target.name });
          if (err) return fail(err);
        }
        const removed = this.session.removeBones(removedNameSet);
        const removedBones = removed.removedBones;
        const removedCubes = removed.removedCubes;
        const primary = deleted[0] ?? { id: targets[0]?.id ?? undefined, name: targets[0]?.name ?? 'unknown' };
        return ok({
          id: primary.id ?? primary.name,
          name: primary.name,
          removedBones,
          removedCubes,
          deleted
        });
      }
    );
  }

  private resolveParentUpdate(
    snapshot: SessionState,
    targetName: string,
    payload: { parentRoot?: boolean; parentId?: string; parent?: string }
  ): UsecaseResult<string | null | undefined> {
    const parentUpdate =
      payload.parentRoot
        ? null
        : payload.parentId
          ? resolveBoneNameById(snapshot.bones, payload.parentId)
          : payload.parent !== undefined
            ? payload.parent
            : undefined;
    if (payload.parentId && !parentUpdate) {
      return fail({ code: 'invalid_payload', message: MODEL_PARENT_BONE_NOT_FOUND(payload.parentId) });
    }
    if (typeof parentUpdate === 'string') {
      if (parentUpdate === targetName) {
        return fail({ code: 'invalid_payload', message: MODEL_BONE_SELF_PARENT });
      }
      const parentExists = snapshot.bones.some((b) => b.name === parentUpdate);
      if (!parentExists) {
        return fail({ code: 'invalid_payload', message: MODEL_PARENT_BONE_NOT_FOUND(parentUpdate) });
      }
      if (isDescendantBone(snapshot.bones, targetName, parentUpdate)) {
        return fail({ code: 'invalid_payload', message: MODEL_BONE_DESCENDANT_PARENT });
      }
    }
    return ok(parentUpdate);
  }
}
