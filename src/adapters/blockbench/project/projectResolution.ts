import type { ToolError } from '@ashfox/contracts/types/internal';
import type { Logger } from '../../../logging';
import { errorMessage } from '../../../logging';
import { readGlobals } from '../blockbenchUtils';
import { toolError } from '../../../shared/tooling/toolResponse';
import { PROJECT_NO_ACTIVE } from '../../../shared/messages';

export const readProjectTextureResolution = (): { width: number; height: number } | null => {
  try {
    const globals = readGlobals();
    const project = globals.Project ?? globals.Blockbench?.project ?? null;
    const width = Number(project?.texture_width);
    const height = Number(project?.texture_height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return null;
    }
    return { width, height };
  } catch (_err) {
    return null;
  }
};

export const runSetProjectTextureResolution = (
  log: Logger,
  width: number,
  height: number,
  modifyUv?: boolean
): ToolError | null => {
  try {
    const globals = readGlobals();
    const project = globals.Project ?? globals.Blockbench?.project ?? null;
    if (!project) {
      return { code: 'invalid_state', message: PROJECT_NO_ACTIVE };
    }
    const updateResolution = globals.updateProjectResolution;
    const normalizeUv = Boolean(modifyUv);
    if (typeof globals.setProjectResolution === 'function') {
      globals.setProjectResolution(width, height, normalizeUv);
      if (typeof updateResolution === 'function') updateResolution();
    } else {
      if (typeof project.setTextureSize === 'function') {
        project.setTextureSize(width, height);
      } else {
        project.texture_width = width;
        project.texture_height = height;
      }
      if (typeof updateResolution === 'function') updateResolution();
      if (normalizeUv) {
        log.warn('modifyUv requested but setProjectResolution is unavailable', { width, height });
      }
    }
    log.info('project texture resolution set', { width, height, modifyUv: normalizeUv });
    return null;
  } catch (err) {
    const message = errorMessage(err, 'project texture resolution update failed');
    log.error('project texture resolution update error', { message });
    return toolError('unknown', message, { reason: 'adapter_exception', context: 'project_texture_resolution' });
  }
};

export const runSetProjectUvPixelsPerBlock = (log: Logger, pixelsPerBlock: number): ToolError | null => {
  try {
    const globals = readGlobals();
    const project = globals.Project ?? globals.Blockbench?.project ?? null;
    if (!project) {
      return { code: 'invalid_state', message: PROJECT_NO_ACTIVE };
    }
    const projectRecord = project as Record<string, unknown>;
    projectRecord.ashfoxUvPixelsPerBlock = pixelsPerBlock;
    const ashfoxRaw = projectRecord.ashfox;
    const ashfox =
      ashfoxRaw && typeof ashfoxRaw === 'object'
        ? (ashfoxRaw as Record<string, unknown>)
        : ({}) as Record<string, unknown>;
    ashfox.uvPixelsPerBlock = pixelsPerBlock;
    ashfox.uv_pixels_per_block = pixelsPerBlock;
    projectRecord.ashfox = ashfox;
    log.info('project uv pixels per block set', { pixelsPerBlock });
    return null;
  } catch (err) {
    const message = errorMessage(err, 'project uv pixels per block update failed');
    log.error('project uv pixels per block update error', { message });
    return toolError('unknown', message, { reason: 'adapter_exception', context: 'project_uv_pixels_per_block' });
  }
};


