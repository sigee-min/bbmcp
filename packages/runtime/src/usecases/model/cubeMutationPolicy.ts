import type { AutoUvAtlasPayload, AutoUvAtlasResult, ToolError } from '@ashfox/contracts/types/internal';
import type { EditorPort } from '../../ports/editor';
import type { SessionState } from '../../session';
import type { UsecaseResult } from '../result';

export type CubeMutationPolicy = {
  ensureRootBone: (snapshot: SessionState) => ToolError | null;
  afterAddCube: () => void;
  afterUpdateCube: (geometryChanged: boolean) => void;
};

export const createCubeMutationPolicy = (deps: {
  editor: EditorPort;
  addRootBoneToSession: () => void;
  autoUvAtlas?: (payload: AutoUvAtlasPayload) => UsecaseResult<AutoUvAtlasResult>;
  runWithoutRevisionGuard?: <T>(fn: () => T) => T;
}): CubeMutationPolicy => {
  const runAutoUv = (shouldRun: boolean) => {
    if (!shouldRun) return;
    if (!deps.autoUvAtlas || !deps.runWithoutRevisionGuard) return;
    const textures = deps.editor.listTextures();
    if (!textures || textures.length === 0) return;
    deps.runWithoutRevisionGuard(() => deps.autoUvAtlas!({ apply: true }));
  };

  return {
    ensureRootBone: (snapshot: SessionState): ToolError | null => {
      if (snapshot.bones.some((bone) => bone.name === 'root')) return null;
      const err = deps.editor.addBone({ name: 'root', pivot: [0, 0, 0] });
      if (err) return err;
      deps.addRootBoneToSession();
      return null;
    },
    afterAddCube: () => runAutoUv(true),
    afterUpdateCube: (geometryChanged: boolean) => runAutoUv(geometryChanged)
  };
};
