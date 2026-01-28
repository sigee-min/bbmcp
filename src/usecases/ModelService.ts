import type { Capabilities, ToolError } from '../types';
import { ProjectSession, SessionState } from '../session';
import { EditorPort } from '../ports/editor';
import { ok, fail, UsecaseResult } from './result';
import {
  collectDescendantBones,
  isDescendantBone,
  resolveBoneNameById
} from '../services/lookup';
import { createId } from '../services/id';
import { resolveBoneOrError, resolveCubeOrError } from '../services/targetGuards';
import { ensureNonBlankString } from '../services/validation';
import { ensureActiveAndRevision } from './guards';
import {
  MODEL_BONE_DESCENDANT_PARENT,
  MODEL_BONE_EXISTS,
  MODEL_BONE_ID_EXISTS,
  MODEL_BONE_NAME_REQUIRED,
  MODEL_BONE_NAME_REQUIRED_FIX,
  MODEL_BONE_NOT_FOUND,
  MODEL_BONE_SELF_PARENT,
  MODEL_CUBE_BONE_REQUIRED,
  MODEL_CUBE_BONE_REQUIRED_FIX,
  MODEL_CUBE_EXISTS,
  MODEL_CUBE_ID_EXISTS,
  MODEL_CUBE_LIMIT_EXCEEDED,
  MODEL_CUBE_NAME_REQUIRED,
  MODEL_CUBE_NAME_REQUIRED_FIX,
  MODEL_PARENT_BONE_NOT_FOUND
} from '../shared/messages';

export interface ModelServiceDeps {
  session: ProjectSession;
  editor: EditorPort;
  capabilities: Capabilities;
  getSnapshot: () => SessionState;
  ensureActive: () => ToolError | null;
  ensureRevisionMatch: (ifRevision?: string) => ToolError | null;
}

export class ModelService {
  private readonly session: ProjectSession;
  private readonly editor: EditorPort;
  private readonly capabilities: Capabilities;
  private readonly getSnapshot: () => SessionState;
  private readonly ensureActive: () => ToolError | null;
  private readonly ensureRevisionMatch: (ifRevision?: string) => ToolError | null;

  constructor(deps: ModelServiceDeps) {
    this.session = deps.session;
    this.editor = deps.editor;
    this.capabilities = deps.capabilities;
    this.getSnapshot = deps.getSnapshot;
    this.ensureActive = deps.ensureActive;
    this.ensureRevisionMatch = deps.ensureRevisionMatch;
  }

  addBone(payload: {
    id?: string;
    name: string;
    parent?: string;
    parentId?: string;
    pivot: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
    visibility?: boolean;
    ifRevision?: string;
  }): UsecaseResult<{ id: string; name: string }> {
    return this.addBoneInternal(payload);
  }

  private addBoneInternal(
    payload: {
      id?: string;
      name: string;
      parent?: string;
      parentId?: string;
      pivot: [number, number, number];
      rotation?: [number, number, number];
      scale?: [number, number, number];
      visibility?: boolean;
      ifRevision?: string;
    },
    options?: { skipRevisionCheck?: boolean }
  ): UsecaseResult<{ id: string; name: string }> {
    const guardErr = ensureActiveAndRevision(
      this.ensureActive,
      this.ensureRevisionMatch,
      payload.ifRevision,
      options
    );
    if (guardErr) return fail(guardErr);
    const snapshot = this.getSnapshot();
    if (!payload.name) {
      return fail({
        code: 'invalid_payload',
        message: MODEL_BONE_NAME_REQUIRED,
        fix: MODEL_BONE_NAME_REQUIRED_FIX
      });
    }
    const blankErr = this.ensureBlankFields([
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
    const existing = snapshot.bones.find((b) => b.name === payload.name);
    if (existing) {
      return fail({ code: 'invalid_payload', message: MODEL_BONE_EXISTS(payload.name) });
    }
    const id = payload.id ?? createId('bone');
    const idConflict = snapshot.bones.some((b) => b.id && b.id === id);
    if (idConflict) {
      return fail({ code: 'invalid_payload', message: MODEL_BONE_ID_EXISTS(id) });
    }
    const err = this.editor.addBone({
      id,
      name: payload.name,
      parent,
      pivot: payload.pivot,
      rotation: payload.rotation,
      scale: payload.scale,
      visibility: payload.visibility
    });
    if (err) return fail(err);
    this.session.addBone({
      id,
      name: payload.name,
      parent,
      pivot: payload.pivot,
      rotation: payload.rotation,
      scale: payload.scale,
      visibility: payload.visibility
    });
    return ok({ id, name: payload.name });
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
    const guardErr = ensureActiveAndRevision(this.ensureActive, this.ensureRevisionMatch, payload.ifRevision);
    if (guardErr) return fail(guardErr);
    const snapshot = this.getSnapshot();
    const blankErr = this.ensureBlankFields([
      [payload.id, 'Bone id'],
      [payload.name, 'Bone name'],
      [payload.newName, 'Bone newName'],
      [payload.parent, 'Parent bone name'],
      [payload.parentId, 'Parent bone id']
    ]);
    if (blankErr) return fail(blankErr);
    const resolved = resolveBoneOrError(snapshot.bones, payload.id, payload.name);
    if (resolved.error) return fail(resolved.error);
    const target = resolved.target!;
    const targetName = target.name;
    const targetId = target.id ?? payload.id ?? createId('bone');
    if (payload.newName && payload.newName !== targetName) {
      const conflict = snapshot.bones.some((b) => b.name === payload.newName && b.name !== targetName);
      if (conflict) {
        return fail({ code: 'invalid_payload', message: MODEL_BONE_EXISTS(payload.newName) });
      }
    }
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

  deleteBone(payload: {
    id?: string;
    name?: string;
    ifRevision?: string;
  }): UsecaseResult<{ id: string; name: string; removedBones: number; removedCubes: number }> {
    const guardErr = ensureActiveAndRevision(this.ensureActive, this.ensureRevisionMatch, payload.ifRevision);
    if (guardErr) return fail(guardErr);
    const snapshot = this.getSnapshot();
    const blankErr = this.ensureBlankFields([
      [payload.id, 'Bone id'],
      [payload.name, 'Bone name']
    ]);
    if (blankErr) return fail(blankErr);
    const resolved = resolveBoneOrError(snapshot.bones, payload.id, payload.name);
    if (resolved.error) return fail(resolved.error);
    const target = resolved.target!;
    const descendants = collectDescendantBones(snapshot.bones, target.name);
    const boneSet = new Set<string>([target.name, ...descendants]);
    const err = this.editor.deleteBone({ id: target.id ?? payload.id, name: target.name });
    if (err) return fail(err);
    const removed = this.session.removeBones(boneSet);
    return ok({
      id: target.id ?? payload.id ?? target.name,
      name: target.name,
      removedBones: removed.removedBones,
      removedCubes: removed.removedCubes
    });
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
    return this.addCubeInternal(payload);
  }

  private addCubeInternal(
    payload: {
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
    },
    options?: { skipRevisionCheck?: boolean }
  ): UsecaseResult<{ id: string; name: string }> {
    const guardErr = ensureActiveAndRevision(
      this.ensureActive,
      this.ensureRevisionMatch,
      payload.ifRevision,
      options
    );
    if (guardErr) return fail(guardErr);
    const snapshot = this.getSnapshot();
    if (!payload.name) {
      return fail({
        code: 'invalid_payload',
        message: MODEL_CUBE_NAME_REQUIRED,
        fix: MODEL_CUBE_NAME_REQUIRED_FIX
      });
    }
    const blankErr = this.ensureBlankFields([
      [payload.name, 'Cube name'],
      [payload.bone, 'Cube bone'],
      [payload.boneId, 'Cube boneId']
    ]);
    if (blankErr) return fail(blankErr);
    const resolvedBone = resolveBoneOrError(snapshot.bones, payload.boneId, payload.bone, {
      idLabel: 'boneId',
      nameLabel: 'bone',
      required: { message: MODEL_CUBE_BONE_REQUIRED, fix: MODEL_CUBE_BONE_REQUIRED_FIX }
    });
    if (resolvedBone.error) return fail(resolvedBone.error);
    const resolvedBoneName = resolvedBone.target!.name;
    const existing = snapshot.cubes.find((c) => c.name === payload.name);
    if (existing) {
      return fail({ code: 'invalid_payload', message: MODEL_CUBE_EXISTS(payload.name) });
    }
    const limitErr = this.ensureCubeLimit(1);
    if (limitErr) return fail(limitErr);
    const id = payload.id ?? createId('cube');
    const idConflict = snapshot.cubes.some((c) => c.id && c.id === id);
    if (idConflict) {
      return fail({ code: 'invalid_payload', message: MODEL_CUBE_ID_EXISTS(id) });
    }
    const err = this.editor.addCube({
      id,
      name: payload.name,
      from: payload.from,
      to: payload.to,
      bone: resolvedBoneName,
      origin: payload.origin,
      rotation: payload.rotation,
      inflate: payload.inflate,
      mirror: payload.mirror,
      visibility: payload.visibility,
      boxUv: payload.boxUv,
      uvOffset: payload.uvOffset
    });
    if (err) return fail(err);
    this.session.addCube({
      id,
      name: payload.name,
      from: payload.from,
      to: payload.to,
      bone: resolvedBoneName,
      origin: payload.origin,
      rotation: payload.rotation,
      inflate: payload.inflate,
      mirror: payload.mirror,
      visibility: payload.visibility,
      boxUv: payload.boxUv,
      uvOffset: payload.uvOffset
    });
    return ok({ id, name: payload.name });
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
    const guardErr = ensureActiveAndRevision(this.ensureActive, this.ensureRevisionMatch, payload.ifRevision);
    if (guardErr) return fail(guardErr);
    const snapshot = this.getSnapshot();
    const blankErr = this.ensureBlankFields([
      [payload.id, 'Cube id'],
      [payload.name, 'Cube name'],
      [payload.newName, 'Cube newName'],
      [payload.bone, 'Cube bone'],
      [payload.boneId, 'Cube boneId']
    ]);
    if (blankErr) return fail(blankErr);
    const resolved = resolveCubeOrError(snapshot.cubes, payload.id, payload.name);
    if (resolved.error) return fail(resolved.error);
    const target = resolved.target!;
    const targetName = target.name;
    const targetId = target.id ?? payload.id ?? createId('cube');
    if (payload.newName && payload.newName !== targetName) {
      const conflict = snapshot.cubes.some((c) => c.name === payload.newName && c.name !== targetName);
      if (conflict) {
        return fail({ code: 'invalid_payload', message: MODEL_CUBE_EXISTS(payload.newName) });
      }
    }
    const boneRes = this.resolveCubeBoneUpdate(snapshot, {
      boneRoot: payload.boneRoot,
      boneId: payload.boneId,
      bone: payload.bone
    });
    if (!boneRes.ok) return fail(boneRes.error);
    const boneUpdate = boneRes.value;
    const err = this.editor.updateCube({
      id: targetId,
      name: targetName,
      newName: payload.newName,
      bone: payload.boneRoot ? undefined : typeof boneUpdate === 'string' ? boneUpdate : undefined,
      boneRoot: payload.boneRoot,
      from: payload.from,
      to: payload.to,
      origin: payload.origin,
      rotation: payload.rotation,
      inflate: payload.inflate,
      mirror: payload.mirror,
      visibility: payload.visibility,
      boxUv: payload.boxUv,
      uvOffset: payload.uvOffset
    });
    if (err) return fail(err);
    if (boneUpdate === 'root' && !snapshot.bones.some((b) => b.name === 'root')) {
      this.session.addBone({ id: createId('bone'), name: 'root', pivot: [0, 0, 0] });
    }
    this.session.updateCube(targetName, {
      id: targetId,
      newName: payload.newName,
      bone: typeof boneUpdate === 'string' ? boneUpdate : undefined,
      from: payload.from,
      to: payload.to,
      origin: payload.origin,
      rotation: payload.rotation,
      inflate: payload.inflate,
      mirror: payload.mirror,
      visibility: payload.visibility,
      boxUv: payload.boxUv,
      uvOffset: payload.uvOffset
    });
    return ok({ id: targetId, name: payload.newName ?? targetName });
  }

  deleteCube(payload: { id?: string; name?: string; ifRevision?: string }): UsecaseResult<{ id: string; name: string }> {
    const guardErr = ensureActiveAndRevision(this.ensureActive, this.ensureRevisionMatch, payload.ifRevision);
    if (guardErr) return fail(guardErr);
    const snapshot = this.getSnapshot();
    const blankErr = this.ensureBlankFields([
      [payload.id, 'Cube id'],
      [payload.name, 'Cube name']
    ]);
    if (blankErr) return fail(blankErr);
    const resolved = resolveCubeOrError(snapshot.cubes, payload.id, payload.name);
    if (resolved.error) return fail(resolved.error);
    const target = resolved.target!;
    const err = this.editor.deleteCube({ id: target.id ?? payload.id, name: target.name });
    if (err) return fail(err);
    this.session.removeCubes([target.name]);
    return ok({ id: target.id ?? payload.id ?? target.name, name: target.name });
  }

  private ensureCubeLimit(increment: number): ToolError | null {
    const snapshot = this.getSnapshot();
    const current = snapshot.cubes.length;
    const limit = this.capabilities.limits.maxCubes;
    if (current + increment > limit) {
      return { code: 'invalid_payload', message: MODEL_CUBE_LIMIT_EXCEEDED(limit) };
    }
    return null;
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

  private resolveCubeBoneUpdate(
    snapshot: SessionState,
    payload: { boneRoot?: boolean; boneId?: string; bone?: string }
  ): UsecaseResult<string | 'root' | undefined> {
    const boneUpdateRaw = payload.boneRoot
      ? 'root'
      : payload.boneId
        ? resolveBoneNameById(snapshot.bones, payload.boneId)
        : payload.bone !== undefined
          ? payload.bone
          : undefined;
    if (payload.boneId && !boneUpdateRaw) {
      return fail({ code: 'invalid_payload', message: MODEL_BONE_NOT_FOUND(payload.boneId) });
    }
    const boneUpdate = boneUpdateRaw ?? undefined;
    if (typeof boneUpdate === 'string' && boneUpdate !== 'root') {
      const boneExists = snapshot.bones.some((b) => b.name === boneUpdate);
      if (!boneExists) {
        return fail({ code: 'invalid_payload', message: MODEL_BONE_NOT_FOUND(boneUpdate) });
      }
    }
    return ok(boneUpdate);
  }

  private ensureBlankFields(entries: Array<[unknown, string]>): ToolError | null {
    for (const [value, label] of entries) {
      const err = ensureNonBlankString(value, label);
      if (err) return err;
    }
    return null;
  }
}
