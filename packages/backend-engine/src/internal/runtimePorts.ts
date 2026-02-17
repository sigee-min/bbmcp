import type { ToolError } from '@ashfox/contracts/types/internal';
import { LocalTmpStore } from '../../../runtime/src/adapters/tmp/LocalTmpStore';
import { buildInternalExport } from '../../../runtime/src/domain/exporters';
import type {
  ExportCodecParams,
  ExportGltfParams,
  ExportNativeParams,
  ExportPort,
  NativeCodecTarget
} from '../../../runtime/src/ports/exporter';
import type { FormatDescriptor, FormatPort } from '../../../runtime/src/ports/formats';
import type { SnapshotPort } from '../../../runtime/src/ports/snapshot';
import { ProjectSession } from '../../../runtime/src/session';
import type { SessionState } from '../../../runtime/src/session/types';
import { hasProjectData } from './persistenceState';

export const ENGINE_TMP_STORE = new LocalTmpStore();

const ENGINE_FORMATS: FormatDescriptor[] = [
  {
    id: 'geckolib_model',
    name: 'GeckoLib',
    animationMode: true,
    boneRig: true,
    armatureRig: true
  }
];

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

const normalizeCodecToken = (value: string): string =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

export class EngineFormatPort implements FormatPort {
  private readonly session: ProjectSession;
  private readonly formats: FormatDescriptor[];

  constructor(session: ProjectSession, formats = ENGINE_FORMATS) {
    this.session = session;
    this.formats = formats;
  }

  listFormats(): FormatDescriptor[] {
    return this.formats.map((format) => ({ ...format }));
  }

  getActiveFormatId(): string | null {
    const snapshot = this.session.snapshot();
    if (snapshot.formatId) return snapshot.formatId;
    return hasProjectData(snapshot) ? this.formats[0]?.id ?? null : null;
  }
}

export class EngineSnapshotPort implements SnapshotPort {
  private readonly session: ProjectSession;

  constructor(session: ProjectSession) {
    this.session = session;
  }

  readSnapshot(): SessionState {
    return this.session.snapshot();
  }
}

export class EngineExportPort implements ExportPort {
  private static readonly CODECS: NativeCodecTarget[] = [
    {
      id: 'gltf',
      label: 'glTF (cleanroom codec)',
      extensions: ['gltf', 'glb']
    }
  ];

  constructor(private readonly session: ProjectSession, private readonly writer: (path: string, contents: string) => ToolError | null) {}

  listNativeCodecs(): NativeCodecTarget[] {
    return EngineExportPort.CODECS.map((codec) => ({ ...codec, extensions: [...codec.extensions] }));
  }

  exportNative(params: ExportNativeParams): ToolError | null {
    const token = normalizeCodecToken(params.formatId);
    const allowed = new Set(['entityrig', 'geckolib', 'geckolibmodel']);
    if (!allowed.has(token)) {
      return {
        code: 'unsupported_format',
        message: `Unsupported native export format: ${params.formatId}`
      };
    }
    return this.writeArtifacts('gecko_geo_anim', params.destPath);
  }

  exportGltf(params: ExportGltfParams): ToolError | null {
    return this.writeArtifacts('gltf', params.destPath);
  }

  exportCodec(params: ExportCodecParams): ToolError | null {
    const token = normalizeCodecToken(params.codecId);
    if (token === 'gltf' || token === 'glb' || token === 'gltfcodec') {
      return this.exportGltf({ destPath: params.destPath });
    }
    return {
      code: 'unsupported_format',
      message: `Unsupported native codec: ${params.codecId}`
    };
  }

  private writeArtifacts(format: 'gecko_geo_anim' | 'gltf', destPath: string): ToolError | null {
    const snapshot = this.session.snapshot();
    const bundle = buildInternalExport(format, snapshot);
    for (const artifact of bundle.artifacts) {
      const filePath = resolveArtifactPath(destPath, artifact.path);
      const serialized = JSON.stringify(artifact.data, null, 2);
      const writeError = this.writer(filePath, serialized);
      if (writeError) return writeError;
    }
    return null;
  }
}
