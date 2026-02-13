import type { EditorPort } from '../../ports/editor';
import type { SessionState } from '../../session';
import type { ExportResult } from '@ashfox/contracts/types/internal';
import { buildInternalExport } from '../../domain/exporters';
import type { InternalExportFormat } from '../../domain/export/types';
import { normalizeTextureDataUri } from '../../shared/textureData';
import { fail, ok, type UsecaseResult } from '../result';

const stripKnownExt = (destPath: string): string => {
  if (destPath.endsWith('.geo.json')) return destPath.slice(0, -'.geo.json'.length);
  if (destPath.endsWith('.animation.json')) return destPath.slice(0, -'.animation.json'.length);
  if (destPath.endsWith('.json')) return destPath.slice(0, -'.json'.length);
  if (destPath.endsWith('.gltf')) return destPath.slice(0, -'.gltf'.length);
  if (destPath.endsWith('.glb')) return destPath.slice(0, -'.glb'.length);
  return destPath;
};

const resolveArtifactPath = (
  destPath: string,
  path: { mode: 'destination' } | { mode: 'base_suffix'; suffix: string }
): string => {
  if (path.mode === 'destination') return destPath;
  return `${stripKnownExt(destPath)}${path.suffix}`;
};

export const writeInternalFallbackExport = (
  editor: EditorPort,
  format: InternalExportFormat,
  destPath: string,
  snapshot: SessionState,
  options?: {
    selectedTarget?: ExportResult['selectedTarget'];
    stage?: ExportResult['stage'];
    warnings?: string[];
  }
): UsecaseResult<ExportResult> => {
  const primaryTextureName = format === 'gltf' ? snapshot.textures[0]?.name : undefined;
  const textureRead = primaryTextureName ? editor.readTexture({ name: primaryTextureName }) : {};
  const primaryTextureDataUri = normalizeTextureDataUri(textureRead.result?.dataUri);

  const bundle = buildInternalExport(format, snapshot, { primaryTextureDataUri });
  const writes = bundle.artifacts.map((artifact) => ({
    id: artifact.id,
    path: resolveArtifactPath(destPath, artifact.path),
    data: artifact.data,
    primary: artifact.primary === true
  }));
  if (writes.length === 0) {
    return fail({
      code: 'unknown',
      message: `No codec artifacts generated for ${format}.`,
      details: { format }
    });
  }
  const primaryWrite = writes.find((write) => write.primary) ?? writes[0];
  for (const write of writes) {
    const serialized = JSON.stringify(write.data, null, 2);
    const err = editor.writeFile(write.path, serialized);
    if (err) return fail(err);
  }
  const artifactWarnings =
    writes.length <= 1
      ? []
      : writes
          .filter((write) => write !== primaryWrite)
          .map((write) => `additional artifact written: ${write.path}`);
  const warnings = mergeWarnings(
    options?.warnings,
    format === 'gltf' && destPath.endsWith('.glb') ? ['GLT-WARN-DEST_GLB_NOT_SUPPORTED'] : undefined,
    bundle.warnings,
    artifactWarnings
  );
  return ok({
    path: primaryWrite.path,
    ...(options?.selectedTarget ? { selectedTarget: options.selectedTarget } : {}),
    ...(options?.stage ? { stage: options.stage } : {}),
    ...(warnings.length > 0 ? { warnings } : {})
  });
};

const mergeWarnings = (...lists: Array<string[] | undefined>): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const item of list ?? []) {
      if (seen.has(item)) continue;
      seen.add(item);
      out.push(item);
    }
  }
  return out;
};
