import type { ExportPayload } from '@ashfox/contracts/types/internal';
import type { SessionState } from '../session';
import type { NonGltfExportFormat } from './export/types';
import { buildCanonicalExportModel } from './export/canonicalModel';
import { CodecRegistry } from './export/codecRegistry';
import type { CodecArtifact } from './export/codecs/types';

export type ExportKind = ExportPayload['format'];

export interface ExportBundle {
  format: NonGltfExportFormat;
  data: unknown;
  artifacts: CodecArtifact[];
  warnings: string[];
  lossy: boolean;
}

const DEFAULT_CODEC_REGISTRY = new CodecRegistry();

const primaryArtifact = (artifacts: CodecArtifact[]): CodecArtifact =>
  artifacts.find((artifact) => artifact.primary) ?? artifacts[0];

export function buildInternalExport(
  format: NonGltfExportFormat,
  state: SessionState
): ExportBundle {
  const strategyResult = DEFAULT_CODEC_REGISTRY.resolve(format);
  if (!strategyResult.ok) {
    const fallbackArtifact: CodecArtifact = {
      id: 'snapshot',
      path: { mode: 'destination' },
      primary: true,
      data: {
        meta: { formatId: state.formatId ?? null, name: state.name },
        bones: state.bones,
        cubes: state.cubes,
        meshes: state.meshes ?? [],
        textures: state.textures,
        animations: state.animations
      }
    };
    return {
      format,
      data: fallbackArtifact.data,
      artifacts: [fallbackArtifact],
      warnings: [strategyResult.error.message],
      lossy: true
    };
  }
  const model = buildCanonicalExportModel(state);
  const encoded = strategyResult.data.encode(model);
  const primary = primaryArtifact(encoded.artifacts);
  return {
    format,
    data: primary.data,
    artifacts: encoded.artifacts,
    warnings: encoded.warnings ?? [],
    lossy: Boolean(encoded.lossy)
  };
}
