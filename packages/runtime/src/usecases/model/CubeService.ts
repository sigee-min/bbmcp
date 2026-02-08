import type { AutoUvAtlasPayload, AutoUvAtlasResult, Capabilities, ToolError } from '@ashfox/contracts/types/internal';
import type { EditorPort } from '../../ports/editor';
import type { ProjectSession, SessionState } from '../../session';
import { ok, fail, type UsecaseResult } from '../result';
import { withActiveAndRevision } from '../guards';
import { resolveBoneTarget, resolveCubeTarget } from '../targetResolvers';
import { resolveBoneNameById } from '../../domain/sessionLookup';
import {
  MODEL_CUBE_EXISTS,
  MODEL_CUBE_ID_EXISTS,
  MODEL_CUBE_LIMIT_EXCEEDED,
  MODEL_CUBE_ID_OR_NAME_REQUIRED,
  MODEL_CUBE_NOT_FOUND,
  MODEL_CUBE_NAME_REQUIRED,
  MODEL_CUBE_NAME_REQUIRED_FIX,
  MODEL_BONE_NOT_FOUND
} from '../../shared/messages';
import { ensureNonBlankFields } from './validators';
import { ensureIdAvailable, ensureNameAvailable, ensureRenameAvailable, resolveEntityId } from '../crudChecks';
import { resolveTargets } from '../targetSelectors';
import { buildIdNameMismatchMessage } from '../../shared/targetMessages';
import { createCubeMutationPolicy, type CubeMutationPolicy } from './cubeMutationPolicy';

export interface CubeServiceDeps {
  session: ProjectSession;
  editor: EditorPort;
  capabilities: Capabilities;
  getSnapshot: () => SessionState;
  ensureActive: () => ToolError | null;
  ensureRevisionMatch: (ifRevision?: string) => ToolError | null;
  autoUvAtlas?: (payload: AutoUvAtlasPayload) => UsecaseResult<AutoUvAtlasResult>;
  runWithoutRevisionGuard?: <T>(fn: () => T) => T;
  mutationPolicy?: CubeMutationPolicy;
}

export class CubeService {
  private readonly session: ProjectSession;
  private readonly editor: EditorPort;
  private readonly capabilities: Capabilities;
  private readonly getSnapshot: () => SessionState;
  private readonly ensureActive: () => ToolError | null;
  private readonly ensureRevisionMatch: (ifRevision?: string) => ToolError | null;
  private readonly mutationPolicy: CubeMutationPolicy;

  constructor(deps: CubeServiceDeps) {
    this.session = deps.session;
    this.editor = deps.editor;
    this.capabilities = deps.capabilities;
    this.getSnapshot = deps.getSnapshot;
    this.ensureActive = deps.ensureActive;
    this.ensureRevisionMatch = deps.ensureRevisionMatch;
    this.mutationPolicy =
      deps.mutationPolicy ??
      createCubeMutationPolicy({
        editor: this.editor,
        addRootBoneToSession: () => {
          this.session.addBone({ name: 'root', pivot: [0, 0, 0] });
        },
        autoUvAtlas: deps.autoUvAtlas,
        runWithoutRevisionGuard: deps.runWithoutRevisionGuard
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
    return withActiveAndRevision(
      this.ensureActive,
      this.ensureRevisionMatch,
      payload.ifRevision,
      () => {
        const snapshot = this.getSnapshot();
        if (!payload.name) {
          return fail({
            code: 'invalid_payload',
            message: MODEL_CUBE_NAME_REQUIRED,
            fix: MODEL_CUBE_NAME_REQUIRED_FIX
          });
        }
        const blankErr = ensureNonBlankFields([
          [payload.name, 'Cube name'],
          [payload.bone, 'Cube bone'],
          [payload.boneId, 'Cube boneId']
        ]);
        if (blankErr) return fail(blankErr);
        const resolvedBoneName = this.resolveCubeBone(snapshot, {
          boneId: payload.boneId,
          bone: payload.bone
        });
        if (!resolvedBoneName.ok) return fail(resolvedBoneName.error);
        const nameErr = ensureNameAvailable(snapshot.cubes, payload.name, MODEL_CUBE_EXISTS);
        if (nameErr) return fail(nameErr);
        const limitErr = this.ensureCubeLimit(1);
        if (limitErr) return fail(limitErr);
        const id = resolveEntityId(undefined, payload.id, 'cube');
        const idErr = ensureIdAvailable(snapshot.cubes, id, MODEL_CUBE_ID_EXISTS);
        if (idErr) return fail(idErr);
        const err = this.editor.addCube({
          id,
          name: payload.name,
          from: payload.from,
          to: payload.to,
          bone: resolvedBoneName.value,
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
          bone: resolvedBoneName.value,
          origin: payload.origin,
          rotation: payload.rotation,
          inflate: payload.inflate,
          mirror: payload.mirror,
          visibility: payload.visibility,
          boxUv: payload.boxUv,
          uvOffset: payload.uvOffset
        });
        this.mutationPolicy.afterAddCube();
        return ok({ id, name: payload.name });
      }
    );
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
    return withActiveAndRevision(
      this.ensureActive,
      this.ensureRevisionMatch,
      payload.ifRevision,
      () => {
        const snapshot = this.getSnapshot();
        const blankErr = ensureNonBlankFields([
          [payload.id, 'Cube id'],
          [payload.name, 'Cube name'],
          [payload.newName, 'Cube newName'],
          [payload.bone, 'Cube bone'],
          [payload.boneId, 'Cube boneId']
        ]);
        if (blankErr) return fail(blankErr);
        const resolved = resolveCubeTarget(snapshot.cubes, payload.id, payload.name);
        if (resolved.error) return fail(resolved.error);
        const target = resolved.target!;
        const targetName = target.name;
        const targetId = resolveEntityId(target.id, payload.id, 'cube');
        const renameErr = ensureRenameAvailable(snapshot.cubes, payload.newName, targetName, MODEL_CUBE_EXISTS);
        if (renameErr) return fail(renameErr);
        const boneRes = this.resolveCubeBoneUpdate(snapshot, {
          boneRoot: payload.boneRoot,
          boneId: payload.boneId,
          bone: payload.bone
        });
        if (!boneRes.ok) return fail(boneRes.error);
        const boneUpdate = boneRes.value;
        if (payload.boneRoot || boneUpdate === 'root') {
          const rootErr = this.mutationPolicy.ensureRootBone(snapshot);
          if (rootErr) return fail(rootErr);
        }
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
        const geometryChanged = this.isGeometryChanged(target, payload);
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
        this.mutationPolicy.afterUpdateCube(geometryChanged);
        return ok({ id: targetId, name: payload.newName ?? targetName });
      }
    );
  }

  deleteCube(payload: {
    id?: string;
    name?: string;
    ids?: string[];
    names?: string[];
    ifRevision?: string;
  }): UsecaseResult<{ id: string; name: string; deleted: Array<{ id?: string; name: string }> }> {
    return withActiveAndRevision(
      this.ensureActive,
      this.ensureRevisionMatch,
      payload.ifRevision,
      () => {
        const snapshot = this.getSnapshot();
        const resolvedTargets = resolveTargets(
          snapshot.cubes,
          payload,
          { id: 'Cube id', name: 'Cube name' },
          { message: MODEL_CUBE_ID_OR_NAME_REQUIRED },
          {
            required: { message: MODEL_CUBE_ID_OR_NAME_REQUIRED },
            mismatch: { kind: 'Cube', plural: 'cubes', message: buildIdNameMismatchMessage },
            notFound: MODEL_CUBE_NOT_FOUND
          }
        );
        if (!resolvedTargets.ok) return fail(resolvedTargets.error);
        const targets = resolvedTargets.value;
        for (const target of targets) {
          const err = this.editor.deleteCube({ id: target.id ?? undefined, name: target.name });
          if (err) return fail(err);
        }
        const nameSet = new Set(targets.map((target) => target.name));
        this.session.removeCubes(nameSet);
        const deleted = targets.map((target) => ({ id: target.id ?? undefined, name: target.name }));
        const primary = deleted[0] ?? { id: targets[0]?.id ?? undefined, name: targets[0]?.name ?? 'unknown' };
        return ok({ id: primary.id ?? primary.name, name: primary.name, deleted });
      }
    );
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

  private resolveCubeBone(
    snapshot: SessionState,
    payload: { boneId?: string; bone?: string }
  ): UsecaseResult<string> {
    const hasExplicit = payload.boneId !== undefined || payload.bone !== undefined;
    if (hasExplicit) {
      const resolved = resolveBoneTarget(snapshot.bones, payload.boneId, payload.bone, {
        idLabel: 'boneId',
        nameLabel: 'bone'
      });
      if (resolved.error) return fail(resolved.error);
      return ok(resolved.target!.name);
    }
    const rootExists = snapshot.bones.some((bone) => bone.name === 'root');
    if (!rootExists) {
      const rootErr = this.mutationPolicy.ensureRootBone(snapshot);
      if (rootErr) return fail(rootErr);
    }
    return ok('root');
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

  private isGeometryChanged(
    target: { from: [number, number, number]; to: [number, number, number]; inflate?: number },
    payload: { from?: [number, number, number]; to?: [number, number, number]; inflate?: number }
  ): boolean {
    if (payload.from && !vecEqual(payload.from, target.from)) return true;
    if (payload.to && !vecEqual(payload.to, target.to)) return true;
    if (payload.inflate !== undefined && payload.inflate !== target.inflate) return true;
    return false;
  }
}

const vecEqual = (a: [number, number, number], b: [number, number, number]) =>
  a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

