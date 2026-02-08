import { SnapshotPort } from '../../ports/snapshot';
import { SessionState } from '../../session';
import { errorMessage, Logger } from '../../logging';
import { BlockbenchGlobals, readBlockbenchGlobals } from '../../types/blockbench';
import { readTextureSize } from './blockbenchUtils';
import { extractChannels, getAnimationState, normalizeLoop } from './snapshot/animations';
import { ensureRootBone, walkNodes } from './snapshot/nodes';
import { readAnimationId, readTextureId } from './snapshot/snapshotIds';
import {
  getActiveFormatId,
  getProjectDirty,
  getProjectId,
  getProjectName,
  guessFormatKind
} from './snapshot/projectMeta';
import { resolveAnimationTimePolicy } from '../../domain/animation/timePolicy';
import { normalizePixelsPerBlock } from '../../domain/uv/policy';

const readGlobals = (): BlockbenchGlobals => readBlockbenchGlobals();

export class BlockbenchSnapshot implements SnapshotPort {
  private readonly log?: Logger;

  constructor(log?: Logger) {
    this.log = log;
  }

  readSnapshot(): SessionState | null {
    try {
      const bones: SessionState['bones'] = [];
      const cubes: SessionState['cubes'] = [];
      const meshes: SessionState['meshes'] = [];
      const textures: SessionState['textures'] = [];
      const animations: SessionState['animations'] = [];
      const globals = readGlobals();
      const formatId = getActiveFormatId(globals);
      const format = guessFormatKind(formatId);
      const name = getProjectName(globals);
      const project = globals.Project ?? globals.Blockbench?.project ?? null;
      const id = getProjectId(globals);
      const dirty = getProjectDirty(globals);

      const root = globals.Outliner?.root;
      const nodes = Array.isArray(root) ? root : root?.children ?? [];
      walkNodes(nodes, undefined, bones, cubes, meshes, globals);
      ensureRootBone(bones, cubes);

      const texList = globals.Texture?.all ?? [];
      if (Array.isArray(texList)) {
        texList.forEach((tex) => {
          const size = readTextureSize(tex);
          textures.push({
            id: readTextureId(tex),
            name: tex?.name ?? tex?.id ?? 'texture',
            path: tex?.path ?? tex?.source,
            width: size.width ?? 0,
            height: size.height ?? 0
          });
        });
      }

      const animState = getAnimationState(globals);
      animState.animations.forEach((anim) => {
        const { channels, triggers } = extractChannels(anim);
        animations.push({
          id: readAnimationId(anim),
          name: anim?.name ?? 'animation',
          length: Number(anim?.length ?? anim?.animation_length ?? anim?.duration ?? 0),
          loop: normalizeLoop(anim?.loop),
          fps: Number(anim?.snapping ?? anim?.fps ?? 0) || undefined,
          channels,
          triggers
        });
      });

      const projectRecord = project as Record<string, unknown> | null | undefined;
      const bbmcpRaw = projectRecord?.bbmcp;
      const bbmcp = bbmcpRaw && typeof bbmcpRaw === 'object' ? (bbmcpRaw as Record<string, unknown>) : undefined;
      const uvPixelsPerBlock =
        projectRecord?.bbmcpUvPixelsPerBlock ??
        (bbmcp?.uvPixelsPerBlock as number | undefined) ??
        (bbmcp?.uv_pixels_per_block as number | undefined);

      return {
        id,
        format,
        formatId,
        name,
        dirty,
        uvPixelsPerBlock: normalizePixelsPerBlock(uvPixelsPerBlock),
        bones,
        cubes,
        meshes,
        textures,
        animations,
        animationsStatus: animState.status,
        animationTimePolicy: resolveAnimationTimePolicy()
      };
    } catch (err) {
      const message = errorMessage(err, 'snapshot read failed');
      this.log?.error('snapshot read failed', { message });
      return null;
    }
  }
}



