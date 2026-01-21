import {
  Capabilities,
  ExportPayload,
  FormatKind,
  GenerateBlockPipelineResult,
  GenerateTexturePresetResult,
  PreflightTextureResult,
  PreflightUsageSummary,
  PreflightUvBounds,
  ProjectDiff,
  ProjectState,
  ProjectStateDetail,
  ReadTextureResult,
  RenderPreviewPayload,
  RenderPreviewResult,
  TexturePresetName,
  ToolError
} from '../types';
import { ProjectSession, SessionState } from '../session';
import { CubeFaceDirection, EditorPort, FaceUvMap, TextureSource, TextureUsageResult } from '../ports/editor';
import { TextureMeta } from '../types/texture';
import { FormatPort } from '../ports/formats';
import { SnapshotPort } from '../ports/snapshot';
import { ExportPort } from '../ports/exporter';
import { buildRigTemplate } from '../templates';
import { RigTemplateKind } from '../spec';
import { buildInternalExport } from '../domain/exporters';
import { validateSnapshot } from '../domain/validation';
import { buildBlockPipeline, BlockPipelineSpec, BlockResource } from '../domain/blockPipeline';
import { ok, fail, UsecaseResult } from './result';
import { resolveFormatId, FormatOverrides, matchesFormatKind } from '../domain/format';
import { mergeSnapshots } from '../domain/snapshot';
import { diffSnapshots } from '../domain/diff';
import { mergeRigParts, RigMergeStrategy } from '../domain/rig';
import { isZeroSize } from '../domain/geometry';
import { DEFAULT_UV_POLICY, UvPolicyConfig, computeExpectedUvSize, getFaceDimensions, shouldAutoFixUv } from '../domain/uvPolicy';
import { TexturePresetResult, generateTexturePreset } from '../domain/texturePresets';
import { ProjectStateService } from '../services/projectState';
import { RevisionStore } from '../services/revision';
import { createId } from '../services/id';
import { HostPort } from '../ports/host';
import { ResourceStore } from '../ports/resources';
import { TextureRendererPort } from '../ports/textureRenderer';
import { BlockPipelineMode, BlockPipelineOnConflict, BlockPipelineTextures, BlockVariant } from '../types/blockPipeline';
import {
  collectDescendantBones,
  isDescendantBone,
  resolveAnimationTarget,
  resolveBoneNameById,
  resolveBoneTarget,
  resolveCubeTarget,
  resolveTextureTarget
} from '../services/lookup';

const FORMAT_OVERRIDE_HINT = 'Set Format ID override in Settings (bbmcp).';
const REVISION_CACHE_LIMIT = 5;

function withFormatOverrideHint(message: string) {
  return `${message} ${FORMAT_OVERRIDE_HINT}`;
}

export interface ToolServiceDeps {
  session: ProjectSession;
  capabilities: Capabilities;
  editor: EditorPort;
  formats: FormatPort;
  snapshot: SnapshotPort;
  exporter: ExportPort;
  host?: HostPort;
  resources?: ResourceStore;
  textureRenderer?: TextureRendererPort;
  policies?: ToolPolicies;
}

export class ToolService {
  private readonly session: ProjectSession;
  private readonly capabilities: Capabilities;
  private readonly editor: EditorPort;
  private readonly formats: FormatPort;
  private readonly snapshotPort: SnapshotPort;
  private readonly exporter: ExportPort;
  private readonly host?: HostPort;
  private readonly resources?: ResourceStore;
  private readonly textureRenderer?: TextureRendererPort;
  private readonly policies: ToolPolicies;
  private readonly projectState: ProjectStateService;
  private readonly revisionStore: RevisionStore;
  private revisionBypassDepth = 0;
  private readonly manualUvCubeIds = new Set<string>();
  private readonly manualUvCubeNames = new Set<string>();

  constructor(deps: ToolServiceDeps) {
    this.session = deps.session;
    this.capabilities = deps.capabilities;
    this.editor = deps.editor;
    this.formats = deps.formats;
    this.snapshotPort = deps.snapshot;
    this.exporter = deps.exporter;
    this.host = deps.host;
    this.resources = deps.resources;
    this.textureRenderer = deps.textureRenderer;
    this.policies = deps.policies ?? {};
    this.projectState = new ProjectStateService(this.formats, this.policies.formatOverrides);
    this.revisionStore = new RevisionStore(REVISION_CACHE_LIMIT);
  }

  listCapabilities(): Capabilities {
    return this.capabilities;
  }

  isRevisionRequired(): boolean {
    return Boolean(this.policies.requireRevision);
  }

  isAutoRetryRevisionEnabled(): boolean {
    return Boolean(this.policies.autoRetryRevision);
  }

  runWithoutRevisionGuard<T>(fn: () => T): T {
    this.revisionBypassDepth += 1;
    try {
      return fn();
    } finally {
      this.revisionBypassDepth = Math.max(0, this.revisionBypassDepth - 1);
    }
  }

  reloadPlugins(payload: { confirm?: boolean; delayMs?: number }): UsecaseResult<{ scheduled: true; delayMs: number; method: 'devReload' }> {
    if (payload.confirm !== true) {
      return fail({
        code: 'invalid_payload',
        message: 'confirm=true is required to reload plugins.',
        fix: 'Set confirm=true to proceed.'
      });
    }
    if (!this.host) {
      return fail({ code: 'not_implemented', message: 'Plugin reload is not available in this host.' });
    }
    const delayMs = normalizeReloadDelay(payload.delayMs);
    const err = this.host.schedulePluginReload(delayMs);
    if (err) return fail(err);
    return ok({ scheduled: true, delayMs, method: 'devReload' });
  }

  getProjectTextureResolution(): { width: number; height: number } | null {
    return this.editor.getProjectTextureResolution();
  }

  setProjectTextureResolution(payload: {
    width: number;
    height: number;
    ifRevision?: string;
    modifyUv?: boolean;
  }): UsecaseResult<{ width: number; height: number }> {
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const revisionErr = this.ensureRevisionMatch(payload.ifRevision);
    if (revisionErr) return fail(revisionErr);
    const width = Number(payload.width);
    const height = Number(payload.height);
    const modifyUv = payload.modifyUv === true;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return fail({ code: 'invalid_payload', message: 'width and height must be positive numbers.' });
    }
    if (!Number.isInteger(width) || !Number.isInteger(height)) {
      return fail({ code: 'invalid_payload', message: 'width and height must be integers.' });
    }
    const maxSize = this.capabilities.limits.maxTextureSize;
    if (width > maxSize || height > maxSize) {
      return fail({
        code: 'invalid_payload',
        message: `Texture resolution exceeds max size (${maxSize}).`,
        fix: `Use width/height <= ${maxSize}.`,
        details: { width, height, maxSize }
      });
    }
    const err = this.editor.setProjectTextureResolution(width, height, modifyUv);
    if (err) return fail(err);
    return ok({ width, height });
  }

  getTextureUsage(payload: { textureId?: string; textureName?: string }): UsecaseResult<{
    textures: Array<{
      id?: string;
      name: string;
      cubeCount: number;
      faceCount: number;
      cubes: Array<{ id?: string; name: string; faces: Array<{ face: CubeFaceDirection; uv?: [number, number, number, number] }> }>;
    }>;
    unresolved?: Array<{ textureRef: string; cubeId?: string; cubeName: string; face: CubeFaceDirection }>;
  }> {
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const res = this.editor.getTextureUsage(payload);
    if (res.error) return fail(res.error);
    return ok(res.result!);
  }

  preflightTexture(payload: { textureId?: string; textureName?: string; includeUsage?: boolean }): UsecaseResult<PreflightTextureResult> {
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const usageRes = this.editor.getTextureUsage({ textureId: payload.textureId, textureName: payload.textureName });
    if (usageRes.error) return fail(usageRes.error);
    const usage = usageRes.result ?? { textures: [] };
    const textureResolution = this.editor.getProjectTextureResolution() ?? undefined;
    const usageSummary = summarizeTextureUsage(usage);
    const uvBounds = computeUvBounds(usage);
    const warnings: string[] = [];
    if (!uvBounds) {
      warnings.push('No UV rects found; preflight cannot compute UV bounds.');
    }
    if (usageSummary.unresolvedCount > 0) {
      warnings.push(`Unresolved texture references detected (${usageSummary.unresolvedCount}).`);
    }
    if (textureResolution && uvBounds) {
      if (uvBounds.maxX > textureResolution.width || uvBounds.maxY > textureResolution.height) {
        warnings.push(
          `UV bounds exceed textureResolution (${uvBounds.maxX}x${uvBounds.maxY} > ${textureResolution.width}x${textureResolution.height}).`
        );
      }
    }
    const recommendedResolution = recommendResolution(uvBounds, textureResolution, this.capabilities.limits.maxTextureSize);
    const result: PreflightTextureResult = {
      textureResolution,
      usageSummary,
      uvBounds: uvBounds ?? undefined,
      recommendedResolution: recommendedResolution ?? undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
      textureUsage: payload.includeUsage ? usage : undefined
    };
    return ok(result);
  }

  generateTexturePreset(payload: {
    preset: TexturePresetName;
    width: number;
    height: number;
    name?: string;
    targetId?: string;
    targetName?: string;
    mode?: 'create' | 'update';
    seed?: number;
    palette?: string[];
    ifRevision?: string;
  }): UsecaseResult<GenerateTexturePresetResult> {
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const revisionErr = this.ensureRevisionMatch(payload.ifRevision);
    if (revisionErr) return fail(revisionErr);
    if (!this.textureRenderer) {
      return fail({ code: 'not_implemented', message: 'Texture renderer unavailable.' });
    }
    const width = Number(payload.width);
    const height = Number(payload.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return fail({ code: 'invalid_payload', message: 'width and height must be positive numbers.' });
    }
    if (!Number.isInteger(width) || !Number.isInteger(height)) {
      return fail({ code: 'invalid_payload', message: 'width and height must be integers.' });
    }
    const maxSize = this.capabilities.limits.maxTextureSize;
    if (width > maxSize || height > maxSize) {
      return fail({
        code: 'invalid_payload',
        message: `Texture size exceeds max ${maxSize}.`,
        fix: `Use width/height <= ${maxSize}.`,
        details: { width, height, maxSize }
      });
    }
    const mode = payload.mode ?? (payload.targetId || payload.targetName ? 'update' : 'create');
    if (mode === 'create' && !payload.name) {
      return fail({
        code: 'invalid_payload',
        message: 'name is required when mode=create.'
      });
    }
    if (mode === 'update' && !payload.targetId && !payload.targetName) {
      return fail({
        code: 'invalid_payload',
        message: 'targetId or targetName is required when mode=update.'
      });
    }
    const snapshot = this.getSnapshot(this.policies.snapshotPolicy ?? 'hybrid');
    const target =
      mode === 'update'
        ? resolveTextureTarget(snapshot.textures, payload.targetId, payload.targetName)
        : null;
    if (mode === 'update' && !target) {
      const label = payload.targetId ?? payload.targetName ?? 'unknown';
      return fail({ code: 'invalid_payload', message: `Texture not found: ${label}` });
    }
    if (mode === 'create' && payload.name) {
      const conflict = snapshot.textures.some((texture) => texture.name === payload.name);
      if (conflict) {
        return fail({ code: 'invalid_payload', message: `Texture already exists: ${payload.name}` });
      }
    }
    const preset: TexturePresetResult = generateTexturePreset({
      preset: payload.preset,
      width,
      height,
      seed: payload.seed,
      palette: payload.palette
    });
    const renderRes = this.textureRenderer.renderPixels({
      width: preset.width,
      height: preset.height,
      data: preset.data
    });
    if (renderRes.error) return fail(renderRes.error);
    if (!renderRes.result) {
      return fail({ code: 'not_implemented', message: 'Texture renderer failed to produce an image.' });
    }
    const image = renderRes.result.image;
    const result =
      mode === 'update'
        ? this.updateTexture({
            id: target?.id,
            name: target?.name,
            image,
            width: preset.width,
            height: preset.height,
            ifRevision: payload.ifRevision
          })
        : this.importTexture({
            name: payload.name ?? payload.preset,
            image,
            width: preset.width,
            height: preset.height,
            ifRevision: payload.ifRevision
          });
    if (!result.ok) return result as UsecaseResult<GenerateTexturePresetResult>;
    return ok({
      textureId: result.value.id,
      textureName: result.value.name,
      preset: payload.preset,
      mode,
      width: preset.width,
      height: preset.height,
      seed: preset.seed,
      coverage: preset.coverage
    });
  }

  getProjectState(payload: { detail?: ProjectStateDetail }): UsecaseResult<{ project: ProjectState }> {
    const detail: ProjectStateDetail = payload.detail ?? 'summary';
    const snapshot = this.getSnapshot(this.policies.snapshotPolicy ?? 'hybrid');
    const info = this.projectState.toProjectInfo(snapshot);
    const active = Boolean(info);
    const revision = this.revisionStore.track(snapshot);
    const project = this.projectState.buildProjectState(snapshot, detail, active, revision);
    const resolution = this.editor.getProjectTextureResolution();
    if (resolution) {
      project.textureResolution = resolution;
    }
    if (detail === 'full') {
      const usage = this.editor.getTextureUsage({});
      if (!usage.error && usage.result) {
        project.textureUsage = usage.result;
      }
    }
    return ok({ project });
  }

  getProjectDiff(payload: { sinceRevision: string; detail?: ProjectStateDetail }): UsecaseResult<{ diff: ProjectDiff }> {
    const detail: ProjectStateDetail = payload.detail ?? 'summary';
    const snapshot = this.getSnapshot(this.policies.snapshotPolicy ?? 'hybrid');
    const info = this.projectState.toProjectInfo(snapshot);
    if (!info) {
      return fail({ code: 'invalid_state', message: 'No active project.' });
    }
    const currentRevision = this.revisionStore.hash(snapshot);
    const previous = this.revisionStore.get(payload.sinceRevision);
    const baseMissing = !previous;
    const emptyBase = {
      ...snapshot,
      bones: [],
      cubes: [],
      textures: [],
      animations: [],
      animationsStatus: snapshot.animationsStatus
    };
    const diffResult = diffSnapshots(previous ?? emptyBase, snapshot, detail === 'full');
    const diff: ProjectDiff = {
      sinceRevision: payload.sinceRevision,
      currentRevision,
      baseMissing: baseMissing || undefined,
      counts: diffResult.counts
    };
    if (detail === 'full' && diffResult.sets) {
      diff.bones = diffResult.sets.bones;
      diff.cubes = diffResult.sets.cubes;
      diff.textures = diffResult.sets.textures;
      diff.animations = diffResult.sets.animations;
    }
    this.revisionStore.remember(snapshot, currentRevision);
    return ok({ diff });
  }

  ensureProject(payload: {
    format?: Capabilities['formats'][number]['format'];
    name?: string;
    match?: 'none' | 'format' | 'name' | 'format_and_name';
    onMismatch?: 'reuse' | 'error' | 'create';
    onMissing?: 'create' | 'error';
    confirmDiscard?: boolean;
    dialog?: Record<string, unknown>;
    confirmDialog?: boolean;
    ifRevision?: string;
  }): UsecaseResult<{ action: 'created' | 'reused'; project: { id: string; format: FormatKind; name: string | null; formatId?: string | null } }> {
    const matchMode = payload.match ?? 'none';
    const onMissing = payload.onMissing ?? 'create';
    const onMismatch = payload.onMismatch ?? 'reuse';
    const requiresFormat = matchMode === 'format' || matchMode === 'format_and_name';
    const requiresName = matchMode === 'name' || matchMode === 'format_and_name';
    if (requiresFormat && !payload.format) {
      return fail({
        code: 'invalid_payload',
        message: 'format is required when match includes format.'
      });
    }
    if (requiresName && !payload.name) {
      return fail({
        code: 'invalid_payload',
        message: 'name is required when match includes name.'
      });
    }

    const snapshot = this.getSnapshot(this.policies.snapshotPolicy ?? 'hybrid');
    const normalized = this.projectState.normalize(snapshot);
    const info = this.projectState.toProjectInfo(normalized);
    const hasActive = Boolean(info && normalized.format);

    if (!hasActive) {
      if (onMissing === 'error') {
        return fail({ code: 'invalid_state', message: 'No active project.' });
      }
      if (!payload.format || !payload.name) {
        return fail({
          code: 'invalid_payload',
          message: 'format and name are required to create a new project.',
          fix: 'Provide format and name or set onMissing=error.'
        });
      }
      const created = this.createProject(payload.format, payload.name, {
        confirmDiscard: payload.confirmDiscard,
        dialog: payload.dialog,
        confirmDialog: payload.confirmDialog,
        ifRevision: payload.ifRevision
      });
      if (!created.ok) return created;
      const sessionState = this.session.snapshot();
      return ok({
        action: 'created',
        project: {
          id: created.value.id,
          format: created.value.format,
          name: created.value.name,
          formatId: sessionState.formatId ?? null
        }
      });
    }

    if (!normalized.format || !info) {
      return fail({ code: 'invalid_state', message: 'Active project format is unknown.' });
    }

    const formatMismatch = requiresFormat && payload.format && normalized.format !== payload.format;
    const nameMismatch = requiresName && payload.name && info.name !== payload.name;
    const mismatch = formatMismatch || nameMismatch;

    if (mismatch && onMismatch === 'error') {
      return fail({
        code: 'invalid_state',
        message: 'Active project does not match requested criteria.',
        details: {
          expected: { format: payload.format ?? null, name: payload.name ?? null, match: matchMode },
          actual: { format: normalized.format, name: info.name ?? null }
        }
      });
    }

    if (mismatch && onMismatch === 'create') {
      if (!payload.format || !payload.name) {
        return fail({
          code: 'invalid_payload',
          message: 'format and name are required to create a new project.',
          fix: 'Provide format and name or set onMismatch=reuse/error.'
        });
      }
      const created = this.createProject(payload.format, payload.name, {
        confirmDiscard: payload.confirmDiscard,
        dialog: payload.dialog,
        confirmDialog: payload.confirmDialog,
        ifRevision: payload.ifRevision
      });
      if (!created.ok) return created;
      const sessionState = this.session.snapshot();
      return ok({
        action: 'created',
        project: {
          id: created.value.id,
          format: created.value.format,
          name: created.value.name,
          formatId: sessionState.formatId ?? null
        }
      });
    }

    const attachRes = this.session.attach(normalized);
    if (!attachRes.ok) return fail(attachRes.error);
    return ok({
      action: 'reused',
      project: {
        id: attachRes.data.id,
        format: normalized.format,
        name: attachRes.data.name,
        formatId: normalized.formatId ?? null
      }
    });
  }

  generateBlockPipeline(payload: {
    name: string;
    texture: string;
    namespace?: string;
    variants?: BlockVariant[];
    textures?: BlockPipelineTextures;
    onConflict?: BlockPipelineOnConflict;
    mode?: BlockPipelineMode;
    ifRevision?: string;
  }): UsecaseResult<GenerateBlockPipelineResult> {
    const name = String(payload.name ?? '').trim();
    if (!name) {
      return fail({ code: 'invalid_payload', message: 'name is required' });
    }
    const texture = String(payload.texture ?? '').trim();
    if (!texture) {
      return fail({ code: 'invalid_payload', message: 'texture is required' });
    }
    const namespace = normalizeBlockNamespace(payload.namespace);
    if (!isValidResourceToken(namespace)) {
      return fail({
        code: 'invalid_payload',
        message: `Invalid namespace: ${namespace}`,
        fix: 'Use lowercase letters, numbers, underscore, dash, or dot.'
      });
    }
    if (!isValidResourceToken(name)) {
      return fail({
        code: 'invalid_payload',
        message: `Invalid name: ${name}`,
        fix: 'Use lowercase letters, numbers, underscore, dash, or dot.'
      });
    }
    if (name.includes(':')) {
      return fail({
        code: 'invalid_payload',
        message: 'name must not include a namespace prefix.',
        fix: 'Provide only the base name (e.g., adamantium_ore).'
      });
    }
    const variants = normalizeBlockVariants(payload.variants);
    if (variants.length === 0) {
      return fail({
        code: 'invalid_payload',
        message: 'variants must include at least one of block, slab, stairs, or wall.'
      });
    }

    const onConflict: BlockPipelineOnConflict = payload.onConflict ?? 'error';
    const mode: BlockPipelineMode = payload.mode ?? 'json_only';
    if (!this.resources) {
      return fail({ code: 'not_implemented', message: 'Resource store is not available.' });
    }

    const spec: BlockPipelineSpec = {
      name,
      namespace,
      texture,
      textures: payload.textures,
      variants
    };
    const pipeline = buildBlockPipeline(spec);
    const assets = collectBlockAssets(pipeline.resources);
    const baseEntries = buildBlockResourceEntries(namespace, pipeline.resources);
    const conflicts = baseEntries.filter((entry) => this.resources?.has(entry.uri)).map((entry) => entry.uri);

    let entries = baseEntries;
    let versionSuffix: string | undefined;
    if (conflicts.length > 0) {
      if (onConflict === 'error') {
        return fail({
          code: 'invalid_payload',
          message: 'Resources already exist for this block pipeline.',
          details: { conflicts }
        });
      }
      if (onConflict === 'versioned') {
        const resolved = resolveVersionedEntries(this.resources, baseEntries);
        if (!resolved) {
          return fail({
            code: 'invalid_payload',
            message: 'Could not allocate versioned resource names.',
            details: { conflicts }
          });
        }
        entries = resolved.entries;
        versionSuffix = resolved.suffix;
      }
    }

    const notes: string[] = [];
    if (mode === 'with_blockbench') {
      if (!payload.ifRevision) {
        return fail({
          code: 'invalid_state',
          message: 'ifRevision is required when mode=with_blockbench.',
          fix: 'Call get_project_state and retry with ifRevision.'
        });
      }
      const created = this.createProject('Java Block/Item', name, {
        confirmDiscard: onConflict === 'overwrite',
        ifRevision: payload.ifRevision
      });
      if (!created.ok) {
        return fail(created.error);
      }
      const modelRes = this.runWithoutRevisionGuard(() => {
        const boneRes = this.addBone({ name: 'block', pivot: [0, 0, 0] });
        if (!boneRes.ok) return boneRes;
        const cubeRes = this.addCube({
          name: 'block',
          from: [0, 0, 0],
          to: [16, 16, 16],
          bone: 'block'
        });
        if (!cubeRes.ok) return cubeRes;
        return ok({ ok: true });
      });
      if (!modelRes.ok) {
        return fail(modelRes.error);
      }
      notes.push('Blockbench project created with a base cube. Import textures separately.');
    }

    entries.forEach((entry) => {
      this.resources?.put({
        uri: entry.uri,
        name: entry.name,
        mimeType: entry.mimeType,
        text: entry.text
      });
    });

    return ok({
      name,
      namespace,
      variants,
      mode,
      onConflict,
      resources: entries.map((entry) => ({
        uri: entry.uri,
        kind: entry.kind,
        name: entry.name,
        mimeType: entry.mimeType
      })),
      assets,
      ...(versionSuffix ? { versionSuffix } : {}),
      ...(notes.length > 0 ? { notes } : {})
    });
  }

  createProject(
    format: Capabilities['formats'][number]['format'],
    name: string,
    options?: { confirmDiscard?: boolean; dialog?: Record<string, unknown>; confirmDialog?: boolean; ifRevision?: string }
  ): UsecaseResult<{ id: string; format: string; name: string }> {
    const revisionErr = this.ensureRevisionMatch(options?.ifRevision);
    if (revisionErr) {
      return fail(revisionErr);
    }
    const capability = this.capabilities.formats.find((f) => f.format === format);
    if (!capability || !capability.enabled) {
      return fail({
        code: 'unsupported_format',
        message: `Unsupported format: ${format}`,
        fix: 'Use list_capabilities to pick an enabled format.'
      });
    }
    if (!name) {
      return fail({
        code: 'invalid_payload',
        message: 'Project name is required',
        fix: 'Provide a non-empty project name.'
      });
    }
    const formatId = resolveFormatId(format, this.formats.listFormats(), this.policies.formatOverrides);
    if (!formatId) {
      return fail({
        code: 'unsupported_format',
        message: withFormatOverrideHint(`No matching format ID for ${format}`),
        fix: 'Set a format ID override in settings or choose another format.'
      });
    }
    const { ifRevision: _ifRevision, ...editorOptions } = options ?? {};
    const effectiveConfirmDiscard = editorOptions.confirmDiscard ?? this.policies.autoDiscardUnsaved;
    const nextOptions =
      effectiveConfirmDiscard === undefined
        ? editorOptions
        : { ...editorOptions, confirmDiscard: effectiveConfirmDiscard };
    const err = this.editor.createProject(name, formatId, format, nextOptions);
    if (err) return fail(err);
    const result = this.session.create(format, name, formatId);
    if (!result.ok) {
      return fail(result.error);
    }
    this.clearManualUvState();
    return ok(result.data);
  }

  importTexture(payload: {
    id?: string;
    name: string;
    image: CanvasImageSource;
    width?: number;
    height?: number;
    ifRevision?: string;
  } & TextureMeta): UsecaseResult<{ id: string; name: string }> {
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const revisionErr = this.ensureRevisionMatch(payload.ifRevision);
    if (revisionErr) return fail(revisionErr);
    if (!payload.name) {
      return fail({ code: 'invalid_payload', message: 'Texture name is required' });
    }
    const snapshot = this.getSnapshot(this.policies.snapshotPolicy ?? 'hybrid');
    const nameConflict = snapshot.textures.some((t) => t.name === payload.name);
    if (nameConflict) {
      return fail({ code: 'invalid_payload', message: `Texture already exists: ${payload.name}` });
    }
    const id = payload.id ?? createId('tex');
    const idConflict = snapshot.textures.some((t) => t.id && t.id === id);
    if (idConflict) {
      return fail({ code: 'invalid_payload', message: `Texture id already exists: ${id}` });
    }
    const contentHash = hashCanvasImage(payload.image);
    const err = this.editor.importTexture({
      id,
      name: payload.name,
      image: payload.image,
      width: payload.width,
      height: payload.height,
      namespace: payload.namespace,
      folder: payload.folder,
      particle: payload.particle,
      visible: payload.visible,
      renderMode: payload.renderMode,
      renderSides: payload.renderSides,
      pbrChannel: payload.pbrChannel,
      group: payload.group,
      frameTime: payload.frameTime,
      frameOrderType: payload.frameOrderType,
      frameOrder: payload.frameOrder,
      frameInterpolate: payload.frameInterpolate,
      internal: payload.internal,
      keepSize: payload.keepSize
    });
    if (err) return fail(err);
    const match = this.editor
      .listTextures()
      .find((t) => (t.id && t.id === id) || t.name === payload.name);
    const resolvedSize = resolveTextureSize({
      width: match?.width,
      height: match?.height
    }, { width: payload.width, height: payload.height });
    this.session.addTexture({
      id,
      name: payload.name,
      width: resolvedSize.width,
      height: resolvedSize.height,
      contentHash: contentHash ?? undefined,
      namespace: payload.namespace,
      folder: payload.folder,
      particle: payload.particle,
      visible: payload.visible,
      renderMode: payload.renderMode,
      renderSides: payload.renderSides,
      pbrChannel: payload.pbrChannel,
      group: payload.group,
      frameTime: payload.frameTime,
      frameOrderType: payload.frameOrderType,
      frameOrder: payload.frameOrder,
      frameInterpolate: payload.frameInterpolate,
      internal: payload.internal,
      keepSize: payload.keepSize
    });
    return ok({ id, name: payload.name });
  }

  updateTexture(payload: {
    id?: string;
    name?: string;
    newName?: string;
    image: CanvasImageSource;
    width?: number;
    height?: number;
    ifRevision?: string;
  } & TextureMeta): UsecaseResult<{ id: string; name: string }> {
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const revisionErr = this.ensureRevisionMatch(payload.ifRevision);
    if (revisionErr) return fail(revisionErr);
    const snapshot = this.getSnapshot(this.policies.snapshotPolicy ?? 'hybrid');
    if (!payload.id && !payload.name) {
      return fail({
        code: 'invalid_payload',
        message: 'Texture id or name is required',
        fix: 'Provide id or name for the texture.'
      });
    }
    const target = resolveTextureTarget(snapshot.textures, payload.id, payload.name);
    if (!target) {
      const label = payload.id ?? payload.name ?? 'unknown';
      return fail({ code: 'invalid_payload', message: `Texture not found: ${label}` });
    }
    const contentHash = hashCanvasImage(payload.image);
    const targetName = target.name;
    const targetId = target.id ?? payload.id ?? createId('tex');
    if (payload.newName && payload.newName !== targetName) {
      const conflict = snapshot.textures.some((t) => t.name === payload.newName && t.name !== targetName);
      if (conflict) {
        return fail({ code: 'invalid_payload', message: `Texture already exists: ${payload.newName}` });
      }
    }
    const renaming = Boolean(payload.newName && payload.newName !== targetName);
    if (contentHash && target.contentHash && contentHash === target.contentHash && !renaming) {
      return fail({
        code: 'no_change',
        message: 'Texture content is unchanged.',
        fix: 'Adjust ops or include a rename before updating.'
      });
    }
    const err = this.editor.updateTexture({
      id: targetId,
      name: targetName,
      newName: payload.newName,
      image: payload.image,
      width: payload.width,
      height: payload.height,
      namespace: payload.namespace,
      folder: payload.folder,
      particle: payload.particle,
      visible: payload.visible,
      renderMode: payload.renderMode,
      renderSides: payload.renderSides,
      pbrChannel: payload.pbrChannel,
      group: payload.group,
      frameTime: payload.frameTime,
      frameOrderType: payload.frameOrderType,
      frameOrder: payload.frameOrder,
      frameInterpolate: payload.frameInterpolate,
      internal: payload.internal,
      keepSize: payload.keepSize
    });
    if (err) return fail(err);
    const effectiveName = payload.newName ?? targetName;
    const match = this.editor
      .listTextures()
      .find((t) => (t.id && t.id === targetId) || t.name === effectiveName);
    const resolvedSize = resolveTextureSize(
      { width: match?.width, height: match?.height },
      { width: payload.width, height: payload.height },
      { width: target.width, height: target.height }
    );
    this.session.updateTexture(targetName, {
      id: targetId,
      newName: payload.newName,
      width: resolvedSize.width,
      height: resolvedSize.height,
      contentHash: contentHash ?? undefined,
      namespace: payload.namespace,
      folder: payload.folder,
      particle: payload.particle,
      visible: payload.visible,
      renderMode: payload.renderMode,
      renderSides: payload.renderSides,
      pbrChannel: payload.pbrChannel,
      group: payload.group,
      frameTime: payload.frameTime,
      frameOrderType: payload.frameOrderType,
      frameOrder: payload.frameOrder,
      frameInterpolate: payload.frameInterpolate,
      internal: payload.internal,
      keepSize: payload.keepSize
    });
    return ok({ id: targetId, name: effectiveName });
  }

  deleteTexture(payload: { id?: string; name?: string; ifRevision?: string }): UsecaseResult<{ id: string; name: string }> {
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const revisionErr = this.ensureRevisionMatch(payload.ifRevision);
    if (revisionErr) return fail(revisionErr);
    const snapshot = this.getSnapshot(this.policies.snapshotPolicy ?? 'hybrid');
    if (!payload.id && !payload.name) {
      return fail({ code: 'invalid_payload', message: 'Texture id or name is required' });
    }
    const target = resolveTextureTarget(snapshot.textures, payload.id, payload.name);
    if (!target) {
      const label = payload.id ?? payload.name ?? 'unknown';
      return fail({ code: 'invalid_payload', message: `Texture not found: ${label}` });
    }
    const err = this.editor.deleteTexture({ id: target.id ?? payload.id, name: target.name });
    if (err) return fail(err);
    this.session.removeTextures([target.name]);
    return ok({ id: target.id ?? payload.id ?? target.name, name: target.name });
  }

  readTexture(payload: { id?: string; name?: string }): UsecaseResult<TextureSource> {
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    if (!payload.id && !payload.name) {
      return fail({ code: 'invalid_payload', message: 'Texture id or name is required' });
    }
    const res = this.editor.readTexture({ id: payload.id, name: payload.name });
    if (res.error) return fail(res.error);
    return ok(res.result!);
  }

  readTextureImage(payload: { id?: string; name?: string }): UsecaseResult<ReadTextureResult> {
    const sourceRes = this.readTexture(payload);
    if (!sourceRes.ok) return sourceRes;
    const source = sourceRes.value;
    const dataUri = normalizeTextureDataUri(source.dataUri);
    if (!dataUri) {
      return fail({ code: 'not_implemented', message: 'Texture data unavailable.' });
    }
    const mimeType = parseDataUriMimeType(dataUri) ?? 'image/png';
    return ok({
      texture: {
        id: source.id,
        name: source.name,
        width: source.width,
        height: source.height,
        path: source.path,
        dataUri,
        mimeType
      }
    });
  }

  assignTexture(payload: {
    textureId?: string;
    textureName?: string;
    cubeIds?: string[];
    cubeNames?: string[];
    faces?: CubeFaceDirection[];
    ifRevision?: string;
  }): UsecaseResult<{ textureId?: string; textureName: string; cubeCount: number; faces?: CubeFaceDirection[] }> {
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const revisionErr = this.ensureRevisionMatch(payload.ifRevision);
    if (revisionErr) return fail(revisionErr);
    if (!payload.textureId && !payload.textureName) {
      return fail({
        code: 'invalid_payload',
        message: 'textureId or textureName is required',
        fix: 'Provide textureId or textureName from list_textures.'
      });
    }
    const snapshot = this.getSnapshot(this.policies.snapshotPolicy ?? 'hybrid');
    const texture = resolveTextureTarget(snapshot.textures, payload.textureId, payload.textureName);
    if (!texture) {
      const label = payload.textureId ?? payload.textureName ?? 'unknown';
      return fail({ code: 'invalid_payload', message: `Texture not found: ${label}` });
    }
    const cubes = resolveCubeTargets(snapshot.cubes, payload.cubeIds, payload.cubeNames);
    if (cubes.length === 0) {
      return fail({ code: 'invalid_payload', message: 'No target cubes found' });
    }
    const faces = normalizeCubeFaces(payload.faces);
    if (payload.faces && payload.faces.length > 0 && !faces) {
      return fail({
        code: 'invalid_payload',
        message: 'faces must include valid directions (north/south/east/west/up/down)'
      });
    }
    const cubeIds = Array.from(new Set(cubes.map((cube) => cube.id).filter(Boolean) as string[]));
    const cubeNames = Array.from(new Set(cubes.map((cube) => cube.name)));
    const err = this.editor.assignTexture({
      textureId: texture.id ?? payload.textureId,
      textureName: texture.name,
      cubeIds,
      cubeNames,
      faces: faces ?? undefined
    });
    if (err) return fail(err);
    this.applyAutoUvPolicy({
      texture: {
        id: texture.id ?? payload.textureId,
        name: texture.name,
        width: texture.width,
        height: texture.height
      },
      cubes,
      faces
    });
    return ok({
      textureId: texture.id ?? payload.textureId,
      textureName: texture.name,
      cubeCount: cubes.length,
      faces: faces ?? undefined
    });
  }

  setFaceUv(payload: {
    cubeId?: string;
    cubeName?: string;
    faces: FaceUvMap;
    ifRevision?: string;
  }): UsecaseResult<{ cubeId?: string; cubeName: string; faces: CubeFaceDirection[] }> {
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const revisionErr = this.ensureRevisionMatch(payload.ifRevision);
    if (revisionErr) return fail(revisionErr);
    if (!payload.cubeId && !payload.cubeName) {
      return fail({
        code: 'invalid_payload',
        message: 'cubeId or cubeName is required',
        fix: 'Provide cubeId or cubeName from get_project_state.'
      });
    }
    const snapshot = this.getSnapshot(this.policies.snapshotPolicy ?? 'hybrid');
    const target = resolveCubeTarget(snapshot.cubes, payload.cubeId, payload.cubeName);
    if (!target) {
      const label = payload.cubeId ?? payload.cubeName ?? 'unknown';
      return fail({ code: 'invalid_payload', message: `Cube not found: ${label}` });
    }
    const faceEntries = Object.entries(payload.faces ?? {});
    if (faceEntries.length === 0) {
      return fail({
        code: 'invalid_payload',
        message: 'faces must include at least one face mapping',
        fix: 'Provide a faces map with at least one face (e.g., {"north":[0,0,4,4]}).'
      });
    }
    const faces: CubeFaceDirection[] = [];
    const normalized: FaceUvMap = {};
    for (const [faceKey, uv] of faceEntries) {
      if (!VALID_CUBE_FACES.has(faceKey as CubeFaceDirection)) {
        return fail({
          code: 'invalid_payload',
          message: `Invalid face: ${faceKey}`,
          fix: 'Use north, south, east, west, up, or down.'
        });
      }
      if (!Array.isArray(uv) || uv.length !== 4) {
        return fail({
          code: 'invalid_payload',
          message: `UV for ${faceKey} must be [x1,y1,x2,y2].`
        });
      }
      const [x1, y1, x2, y2] = uv;
      if (![x1, y1, x2, y2].every((value) => typeof value === 'number' && Number.isFinite(value))) {
        return fail({
          code: 'invalid_payload',
          message: `UV for ${faceKey} must contain finite numbers.`
        });
      }
      const boundsErr = this.ensureFaceUvWithinResolution([x1, y1, x2, y2]);
      if (boundsErr) return fail(boundsErr);
      normalized[faceKey as CubeFaceDirection] = [x1, y1, x2, y2];
      faces.push(faceKey as CubeFaceDirection);
    }
    const err = this.editor.setFaceUv({
      cubeId: target.id ?? payload.cubeId,
      cubeName: target.name,
      faces: normalized
    });
    if (err) return fail(err);
    this.markManualUv({ id: target.id ?? payload.cubeId, name: target.name });
    return ok({ cubeId: target.id ?? payload.cubeId, cubeName: target.name, faces });
  }

  addBone(payload: {
    id?: string;
    name: string;
    parent?: string;
    parentId?: string;
    pivot: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
    ifRevision?: string;
  }): UsecaseResult<{ id: string; name: string }> {
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const revisionErr = this.ensureRevisionMatch(payload.ifRevision);
    if (revisionErr) return fail(revisionErr);
    const snapshot = this.getSnapshot(this.policies.snapshotPolicy ?? 'hybrid');
      if (!payload.name) {
        return fail({
          code: 'invalid_payload',
          message: 'Bone name is required',
          fix: 'Provide a non-empty bone name.'
        });
      }
    const parentName = payload.parentId
      ? resolveBoneNameById(snapshot.bones, payload.parentId)
      : payload.parent;
    if (payload.parentId && !parentName) {
      return fail({ code: 'invalid_payload', message: `Parent bone not found: ${payload.parentId}` });
    }
    const existing = snapshot.bones.find((b) => b.name === payload.name);
    if (existing) {
      return fail({ code: 'invalid_payload', message: `Bone already exists: ${payload.name}` });
    }
    const id = payload.id ?? createId('bone');
    const idConflict = snapshot.bones.some((b) => b.id && b.id === id);
    if (idConflict) {
      return fail({ code: 'invalid_payload', message: `Bone id already exists: ${id}` });
    }
    const err = this.editor.addBone({
      id,
      name: payload.name,
      parent: parentName,
      pivot: payload.pivot,
      rotation: payload.rotation,
      scale: payload.scale
    });
    if (err) return fail(err);
    this.session.addBone({
      id,
      name: payload.name,
      parent: parentName,
      pivot: payload.pivot,
      rotation: payload.rotation,
      scale: payload.scale
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
    ifRevision?: string;
  }): UsecaseResult<{ id: string; name: string }> {
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const revisionErr = this.ensureRevisionMatch(payload.ifRevision);
    if (revisionErr) return fail(revisionErr);
    const snapshot = this.getSnapshot(this.policies.snapshotPolicy ?? 'hybrid');
    if (!payload.id && !payload.name) {
      return fail({ code: 'invalid_payload', message: 'Bone id or name is required' });
    }
    const target = resolveBoneTarget(snapshot.bones, payload.id, payload.name);
    if (!target) {
      const label = payload.id ?? payload.name ?? 'unknown';
      return fail({ code: 'invalid_payload', message: `Bone not found: ${label}` });
    }
    const targetName = target.name;
    const targetId = target.id ?? payload.id ?? createId('bone');
    if (payload.newName && payload.newName !== targetName) {
      const conflict = snapshot.bones.some((b) => b.name === payload.newName && b.name !== targetName);
      if (conflict) {
        return fail({ code: 'invalid_payload', message: `Bone already exists: ${payload.newName}` });
      }
    }
    const parentUpdate =
      payload.parentRoot
        ? null
        : payload.parentId
          ? resolveBoneNameById(snapshot.bones, payload.parentId)
          : payload.parent !== undefined
            ? payload.parent
            : undefined;
    if (payload.parentId && !parentUpdate) {
      return fail({ code: 'invalid_payload', message: `Parent bone not found: ${payload.parentId}` });
    }
    if (typeof parentUpdate === 'string') {
      if (parentUpdate === targetName) {
        return fail({ code: 'invalid_payload', message: 'Bone cannot be parented to itself' });
      }
      const parentExists = snapshot.bones.some((b) => b.name === parentUpdate);
      if (!parentExists) {
        return fail({ code: 'invalid_payload', message: `Parent bone not found: ${parentUpdate}` });
      }
      if (isDescendantBone(snapshot.bones, targetName, parentUpdate)) {
        return fail({ code: 'invalid_payload', message: 'Bone cannot be parented to its descendant' });
      }
    }
    const parentForEditor = typeof parentUpdate === 'string' ? parentUpdate : undefined;
    const err = this.editor.updateBone({
      id: targetId,
      name: targetName,
      newName: payload.newName,
      parent: payload.parentRoot ? undefined : parentForEditor,
      parentRoot: payload.parentRoot,
      pivot: payload.pivot,
      rotation: payload.rotation,
      scale: payload.scale
    });
    if (err) return fail(err);
    this.session.updateBone(targetName, {
      id: targetId,
      newName: payload.newName,
      parent: parentUpdate,
      pivot: payload.pivot,
      rotation: payload.rotation,
      scale: payload.scale
    });
    return ok({ id: targetId, name: payload.newName ?? targetName });
  }

  deleteBone(payload: {
    id?: string;
    name?: string;
    ifRevision?: string;
  }): UsecaseResult<{ id: string; name: string; removedBones: number; removedCubes: number }> {
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const revisionErr = this.ensureRevisionMatch(payload.ifRevision);
    if (revisionErr) return fail(revisionErr);
    const snapshot = this.getSnapshot(this.policies.snapshotPolicy ?? 'hybrid');
    if (!payload.id && !payload.name) {
      return fail({ code: 'invalid_payload', message: 'Bone id or name is required' });
    }
    const target = resolveBoneTarget(snapshot.bones, payload.id, payload.name);
    if (!target) {
      const label = payload.id ?? payload.name ?? 'unknown';
      return fail({ code: 'invalid_payload', message: `Bone not found: ${label}` });
    }
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
    uv?: [number, number];
    inflate?: number;
    mirror?: boolean;
    ifRevision?: string;
  }): UsecaseResult<{ id: string; name: string }> {
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const revisionErr = this.ensureRevisionMatch(payload.ifRevision);
    if (revisionErr) return fail(revisionErr);
    const snapshot = this.getSnapshot(this.policies.snapshotPolicy ?? 'hybrid');
      if (!payload.name) {
        return fail({
          code: 'invalid_payload',
          message: 'Cube name is required',
          fix: 'Provide a non-empty cube name.'
        });
      }
      if (!payload.bone && !payload.boneId) {
        return fail({
          code: 'invalid_payload',
          message: 'Cube bone is required',
          fix: 'Provide bone or boneId to attach the cube.'
        });
      }
    const resolvedBone =
      payload.boneId ? resolveBoneNameById(snapshot.bones, payload.boneId) : payload.bone;
    if (!resolvedBone) {
      const label = payload.boneId ?? payload.bone;
      return fail({ code: 'invalid_payload', message: `Bone not found: ${label}` });
    }
    const boneExists = snapshot.bones.some((b) => b.name === resolvedBone);
    if (!boneExists) {
      return fail({ code: 'invalid_payload', message: `Bone not found: ${resolvedBone}` });
    }
    const existing = snapshot.cubes.find((c) => c.name === payload.name);
    if (existing) {
      return fail({ code: 'invalid_payload', message: `Cube already exists: ${payload.name}` });
    }
    const limitErr = this.ensureCubeLimit(1);
    if (limitErr) return fail(limitErr);
    const id = payload.id ?? createId('cube');
    const idConflict = snapshot.cubes.some((c) => c.id && c.id === id);
    if (idConflict) {
      return fail({ code: 'invalid_payload', message: `Cube id already exists: ${id}` });
    }
    const uvErr = this.ensureUvWithinResolution(payload.uv);
    if (uvErr) return fail(uvErr);
    const err = this.editor.addCube({
      id,
      name: payload.name,
      from: payload.from,
      to: payload.to,
      bone: resolvedBone,
      uv: payload.uv,
      inflate: payload.inflate,
      mirror: payload.mirror
    });
    if (err) return fail(err);
    this.session.addCube({
      id,
      name: payload.name,
      from: payload.from,
      to: payload.to,
      bone: resolvedBone,
      uv: payload.uv,
      inflate: payload.inflate,
      mirror: payload.mirror
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
    uv?: [number, number];
    inflate?: number;
    mirror?: boolean;
    ifRevision?: string;
  }): UsecaseResult<{ id: string; name: string }> {
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const revisionErr = this.ensureRevisionMatch(payload.ifRevision);
    if (revisionErr) return fail(revisionErr);
    const snapshot = this.getSnapshot(this.policies.snapshotPolicy ?? 'hybrid');
    if (!payload.id && !payload.name) {
      return fail({ code: 'invalid_payload', message: 'Cube id or name is required' });
    }
    const target = resolveCubeTarget(snapshot.cubes, payload.id, payload.name);
    if (!target) {
      const label = payload.id ?? payload.name ?? 'unknown';
      return fail({ code: 'invalid_payload', message: `Cube not found: ${label}` });
    }
    const targetName = target.name;
    const targetId = target.id ?? payload.id ?? createId('cube');
    if (payload.newName && payload.newName !== targetName) {
      const conflict = snapshot.cubes.some((c) => c.name === payload.newName && c.name !== targetName);
      if (conflict) {
        return fail({ code: 'invalid_payload', message: `Cube already exists: ${payload.newName}` });
      }
    }
    const boneUpdate = payload.boneRoot
      ? 'root'
      : payload.boneId
        ? resolveBoneNameById(snapshot.bones, payload.boneId)
        : payload.bone !== undefined
          ? payload.bone
          : undefined;
    if (payload.boneId && !boneUpdate) {
      return fail({ code: 'invalid_payload', message: `Bone not found: ${payload.boneId}` });
    }
    if (typeof boneUpdate === 'string' && boneUpdate !== 'root') {
      const boneExists = snapshot.bones.some((b) => b.name === boneUpdate);
      if (!boneExists) {
        return fail({ code: 'invalid_payload', message: `Bone not found: ${boneUpdate}` });
      }
    }
    const uvErr = this.ensureUvWithinResolution(payload.uv);
    if (uvErr) return fail(uvErr);
    const err = this.editor.updateCube({
      id: targetId,
      name: targetName,
      newName: payload.newName,
      bone: payload.boneRoot ? undefined : typeof boneUpdate === 'string' ? boneUpdate : undefined,
      boneRoot: payload.boneRoot,
      from: payload.from,
      to: payload.to,
      uv: payload.uv,
      inflate: payload.inflate,
      mirror: payload.mirror
    });
    if (err) return fail(err);
    if (boneUpdate === 'root' && !snapshot.bones.some((b) => b.name === 'root')) {
      this.session.addBone({ id: createId('bone'), name: 'root', pivot: [0, 0, 0] });
    }
    this.session.updateCube(targetName, {
      id: targetId,
      newName: payload.newName,
      bone: boneUpdate,
      from: payload.from,
      to: payload.to,
      uv: payload.uv,
      inflate: payload.inflate,
      mirror: payload.mirror
    });
    if (payload.newName && payload.newName !== targetName) {
      this.renameManualUv(targetName, payload.newName);
    }
    return ok({ id: targetId, name: payload.newName ?? targetName });
  }

  deleteCube(payload: { id?: string; name?: string; ifRevision?: string }): UsecaseResult<{ id: string; name: string }> {
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const revisionErr = this.ensureRevisionMatch(payload.ifRevision);
    if (revisionErr) return fail(revisionErr);
    const snapshot = this.getSnapshot(this.policies.snapshotPolicy ?? 'hybrid');
    if (!payload.id && !payload.name) {
      return fail({ code: 'invalid_payload', message: 'Cube id or name is required' });
    }
    const target = resolveCubeTarget(snapshot.cubes, payload.id, payload.name);
    if (!target) {
      const label = payload.id ?? payload.name ?? 'unknown';
      return fail({ code: 'invalid_payload', message: `Cube not found: ${label}` });
    }
    const err = this.editor.deleteCube({ id: target.id ?? payload.id, name: target.name });
    if (err) return fail(err);
    this.session.removeCubes([target.name]);
    this.clearManualUv({ id: target.id ?? payload.id, name: target.name });
    return ok({ id: target.id ?? payload.id ?? target.name, name: target.name });
  }

  applyRigTemplate(payload: { templateId: string; ifRevision?: string }): UsecaseResult<{ templateId: string }> {
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const revisionErr = this.ensureRevisionMatch(payload.ifRevision);
    if (revisionErr) return fail(revisionErr);
    const templateId = payload.templateId;
    if (!['empty', 'biped', 'quadruped', 'block_entity'].includes(templateId)) {
      return fail({ code: 'invalid_payload', message: `Unknown template: ${templateId}` });
    }
    const templateParts = buildRigTemplate(templateId as RigTemplateKind, []);
    const cubeParts = templateParts.filter((part) => !isZeroSize(part.size));
    const limitErr = this.ensureCubeLimit(cubeParts.length);
    if (limitErr) return fail(limitErr);
    const snapshot = this.getSnapshot(this.policies.snapshotPolicy ?? 'hybrid');
    const existing = new Set(snapshot.bones.map((b) => b.name));
    let partsToAdd = templateParts;
    try {
      const merged = mergeRigParts(templateParts, existing, this.policies.rigMergeStrategy ?? 'skip_existing');
      partsToAdd = merged.parts;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'rig template merge failed';
      return fail({ code: 'invalid_payload', message });
    }

    for (const part of partsToAdd) {
      const boneRes = this.addBone({
        name: part.id,
        parent: part.parent,
        pivot: part.pivot ?? [0, 0, 0]
      });
      if (!boneRes.ok) return boneRes;
      if (!isZeroSize(part.size)) {
        const from: [number, number, number] = [...part.offset];
        const to: [number, number, number] = [
          part.offset[0] + part.size[0],
          part.offset[1] + part.size[1],
          part.offset[2] + part.size[2]
        ];
        const cubeRes = this.addCube({
          name: part.id,
          from,
          to,
          bone: part.id,
          uv: part.uv,
          inflate: part.inflate,
          mirror: part.mirror
        });
        if (!cubeRes.ok) return cubeRes;
      }
    }
    return ok({ templateId });
  }

  createAnimationClip(payload: {
    id?: string;
    name: string;
    length: number;
    loop: boolean;
    fps: number;
    ifRevision?: string;
  }): UsecaseResult<{ id: string; name: string }> {
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const revisionErr = this.ensureRevisionMatch(payload.ifRevision);
    if (revisionErr) return fail(revisionErr);
    const format = this.session.snapshot().format;
    const capability = this.capabilities.formats.find((f) => f.format === format);
    if (!capability || !capability.animations) {
      return fail({ code: 'unsupported_format', message: 'Animations are not supported for this format' });
    }
    if (!payload.name) {
      return fail({ code: 'invalid_payload', message: 'Animation name is required' });
    }
    if (!Number.isFinite(payload.length) || payload.length <= 0) {
      return fail({ code: 'invalid_payload', message: 'Animation length must be > 0' });
    }
    if (!Number.isFinite(payload.fps) || payload.fps <= 0) {
      return fail({ code: 'invalid_payload', message: 'Animation fps must be > 0' });
    }
    if (payload.length > this.capabilities.limits.maxAnimationSeconds) {
      return fail({
        code: 'invalid_payload',
        message: `Animation length exceeds max ${this.capabilities.limits.maxAnimationSeconds} seconds`
      });
    }
    const snapshot = this.getSnapshot(this.policies.snapshotPolicy ?? 'hybrid');
    const nameConflict = snapshot.animations.some((a) => a.name === payload.name);
    if (nameConflict) {
      return fail({ code: 'invalid_payload', message: `Animation clip already exists: ${payload.name}` });
    }
    const id = payload.id ?? createId('anim');
    const idConflict = snapshot.animations.some((a) => a.id && a.id === id);
    if (idConflict) {
      return fail({ code: 'invalid_payload', message: `Animation id already exists: ${id}` });
    }
    const err = this.editor.createAnimation({
      id,
      name: payload.name,
      length: payload.length,
      loop: payload.loop,
      fps: payload.fps
    });
    if (err) return fail(err);
    this.session.addAnimation({
      id,
      name: payload.name,
      length: payload.length,
      loop: payload.loop,
      fps: payload.fps,
      channels: []
    });
    return ok({ id, name: payload.name });
  }

  updateAnimationClip(payload: {
    id?: string;
    name?: string;
    newName?: string;
    length?: number;
    loop?: boolean;
    fps?: number;
    ifRevision?: string;
  }): UsecaseResult<{ id: string; name: string }> {
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const revisionErr = this.ensureRevisionMatch(payload.ifRevision);
    if (revisionErr) return fail(revisionErr);
    const format = this.session.snapshot().format;
    const capability = this.capabilities.formats.find((f) => f.format === format);
    if (!capability || !capability.animations) {
      return fail({ code: 'unsupported_format', message: 'Animations are not supported for this format' });
    }
    const snapshot = this.getSnapshot(this.policies.snapshotPolicy ?? 'hybrid');
    if (!payload.id && !payload.name) {
      return fail({ code: 'invalid_payload', message: 'Animation clip id or name is required' });
    }
    const target = resolveAnimationTarget(snapshot.animations, payload.id, payload.name);
    if (!target) {
      const label = payload.id ?? payload.name ?? 'unknown';
      return fail({ code: 'invalid_payload', message: `Animation clip not found: ${label}` });
    }
    const targetName = target.name;
    const targetId = target.id ?? payload.id ?? createId('anim');
    if (payload.newName && payload.newName !== targetName) {
      const conflict = snapshot.animations.some((a) => a.name === payload.newName && a.name !== targetName);
      if (conflict) {
        return fail({ code: 'invalid_payload', message: `Animation clip already exists: ${payload.newName}` });
      }
    }
    if (payload.length !== undefined) {
      if (!Number.isFinite(payload.length) || payload.length <= 0) {
        return fail({ code: 'invalid_payload', message: 'Animation length must be > 0' });
      }
      if (payload.length > this.capabilities.limits.maxAnimationSeconds) {
        return fail({
          code: 'invalid_payload',
          message: `Animation length exceeds max ${this.capabilities.limits.maxAnimationSeconds} seconds`
        });
      }
    }
    if (payload.fps !== undefined && (!Number.isFinite(payload.fps) || payload.fps <= 0)) {
      return fail({ code: 'invalid_payload', message: 'Animation fps must be > 0' });
    }
    const err = this.editor.updateAnimation({
      id: targetId,
      name: targetName,
      newName: payload.newName,
      length: payload.length,
      loop: payload.loop,
      fps: payload.fps
    });
    if (err) return fail(err);
    this.session.updateAnimation(targetName, {
      id: targetId,
      newName: payload.newName,
      length: payload.length,
      loop: payload.loop,
      fps: payload.fps
    });
    return ok({ id: targetId, name: payload.newName ?? targetName });
  }

  deleteAnimationClip(payload: { id?: string; name?: string; ifRevision?: string }): UsecaseResult<{ id: string; name: string }> {
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const revisionErr = this.ensureRevisionMatch(payload.ifRevision);
    if (revisionErr) return fail(revisionErr);
    const format = this.session.snapshot().format;
    const capability = this.capabilities.formats.find((f) => f.format === format);
    if (!capability || !capability.animations) {
      return fail({ code: 'unsupported_format', message: 'Animations are not supported for this format' });
    }
    const snapshot = this.getSnapshot(this.policies.snapshotPolicy ?? 'hybrid');
    if (!payload.id && !payload.name) {
      return fail({ code: 'invalid_payload', message: 'Animation clip id or name is required' });
    }
    const target = resolveAnimationTarget(snapshot.animations, payload.id, payload.name);
    if (!target) {
      const label = payload.id ?? payload.name ?? 'unknown';
      return fail({ code: 'invalid_payload', message: `Animation clip not found: ${label}` });
    }
    const err = this.editor.deleteAnimation({ id: target.id ?? payload.id, name: target.name });
    if (err) return fail(err);
    this.session.removeAnimations([target.name]);
    return ok({ id: target.id ?? payload.id ?? target.name, name: target.name });
  }

  setKeyframes(payload: {
    clipId?: string;
    clip: string;
    bone: string;
    channel: 'rot' | 'pos' | 'scale';
    keys: { time: number; value: [number, number, number]; interp?: 'linear' | 'step' | 'catmullrom' }[];
    ifRevision?: string;
  }): UsecaseResult<{ clip: string; clipId?: string; bone: string }> {
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const revisionErr = this.ensureRevisionMatch(payload.ifRevision);
    if (revisionErr) return fail(revisionErr);
    const snapshot = this.getSnapshot(this.policies.snapshotPolicy ?? 'hybrid');
    const anim = resolveAnimationTarget(snapshot.animations, payload.clipId, payload.clip);
    if (!anim) {
      const label = payload.clipId ?? payload.clip;
      return fail({ code: 'invalid_payload', message: `Animation clip not found: ${label}` });
    }
    const err = this.editor.setKeyframes({
      clipId: anim.id,
      clip: anim.name,
      bone: payload.bone,
      channel: payload.channel,
      keys: payload.keys
    });
    if (err) return fail(err);
    this.session.upsertAnimationChannel(anim.name, {
      bone: payload.bone,
      channel: payload.channel,
      keys: payload.keys
    });
    return ok({ clip: anim.name, clipId: anim.id ?? undefined, bone: payload.bone });
  }

  exportModel(payload: ExportPayload): UsecaseResult<{ path: string }> {
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const exportPolicy = this.policies.exportPolicy ?? 'strict';
    const snapshot = this.getSnapshot(this.policies.snapshotPolicy ?? 'hybrid');
    const expectedFormat = exportFormatToCapability(payload.format);
    if (expectedFormat) {
      const formatCapability = this.capabilities.formats.find((f) => f.format === expectedFormat);
      if (!formatCapability || !formatCapability.enabled) {
        return fail({ code: 'unsupported_format', message: `Export format not enabled: ${expectedFormat}` });
      }
    }
    if (expectedFormat) {
      if (snapshot.format && snapshot.format !== expectedFormat) {
        return fail({ code: 'invalid_payload', message: 'Export format does not match active format' });
      }
      if (
        !snapshot.format &&
        snapshot.formatId &&
        !matchesFormatKind(expectedFormat, snapshot.formatId) &&
        this.projectState.matchOverrideKind(snapshot.formatId) !== expectedFormat
      ) {
        return fail({
          code: 'invalid_payload',
          message: withFormatOverrideHint('Export format does not match active format')
        });
      }
    }
    const formatId =
      snapshot.formatId ??
      (expectedFormat ? resolveFormatId(expectedFormat, this.formats.listFormats(), this.policies.formatOverrides) : null);
    if (!formatId) {
      return fail({ code: 'unsupported_format', message: withFormatOverrideHint('No matching format ID for export') });
    }
    const nativeErr = this.exporter.exportNative({ formatId, destPath: payload.destPath });
    if (!nativeErr) return ok({ path: payload.destPath });
    if (exportPolicy === 'strict') {
      return fail(nativeErr);
    }
    if (nativeErr.code !== 'not_implemented' && nativeErr.code !== 'unsupported_format') {
      return fail(nativeErr);
    }
    const bundle = buildInternalExport(payload.format, snapshot);
    const serialized = JSON.stringify(bundle.data, null, 2);
    const err = this.editor.writeFile(payload.destPath, serialized);
    if (err) return fail(err);
    return ok({ path: payload.destPath });
  }

  renderPreview(payload: RenderPreviewPayload): UsecaseResult<RenderPreviewResult> {
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const res = this.editor.renderPreview(payload);
    if (res.error) return fail(res.error);
    return ok(res.result!);
  }

  validate(): UsecaseResult<{ findings: { code: string; message: string; severity: 'error' | 'warning' | 'info' }[] }> {
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const snapshot = this.getSnapshot(this.policies.snapshotPolicy ?? 'hybrid');
    const textures = this.editor.listTextures();
    const textureResolution = this.editor.getProjectTextureResolution() ?? undefined;
    const usage = this.editor.getTextureUsage({});
    const findings = validateSnapshot(snapshot, {
      limits: this.capabilities.limits,
      textures,
      textureResolution,
      textureUsage: usage.error ? undefined : usage.result
    });
    return ok({ findings });
  }

  private getSnapshot(policy: SnapshotPolicy) {
    const sessionSnapshot = this.session.snapshot();
    if (policy === 'session') return this.projectState.normalize(sessionSnapshot);
    const live = this.snapshotPort.readSnapshot();
    if (!live) {
      return this.projectState.normalize(sessionSnapshot);
    }
    const merged = policy === 'live' ? live : mergeSnapshots(sessionSnapshot, live);
    return this.projectState.normalize(merged);
  }

  private ensureActive(): ToolError | null {
    const stateError = this.session.ensureActive();
    if (!stateError) return null;
    if (!this.policies.autoAttachActiveProject) {
      return {
        ...stateError,
        fix: 'Use ensure_project to create or reuse an active project before mutating.'
      };
    }
    const live = this.snapshotPort.readSnapshot();
    if (!live) {
      return {
        ...stateError,
        fix: 'Use ensure_project to create or reuse an active project before mutating.'
      };
    }
    const normalized = this.projectState.normalize(live);
    if (!this.projectState.toProjectInfo(normalized) || !normalized.format) {
      return {
        ...stateError,
        fix: 'Use ensure_project to create or reuse an active project before mutating.'
      };
    }
    const attachRes = this.session.attach(normalized);
    return attachRes.ok
      ? null
      : {
          ...attachRes.error,
          fix: 'Call get_project_state and retry, or create a new project.'
        };
  }

  private ensureRevisionMatch(expected?: string): ToolError | null {
    if (!this.policies.requireRevision) return null;
    if (this.revisionBypassDepth > 0) return null;
    const snapshot = this.getSnapshot(this.policies.snapshotPolicy ?? 'hybrid');
    const hasProject = Boolean(this.projectState.toProjectInfo(snapshot));
    const currentRevision = this.revisionStore.track(snapshot);
    if (!expected) {
      return {
        code: 'invalid_state',
        message: 'ifRevision is required. Call get_project_state before mutating.',
        fix: 'Call get_project_state and retry with ifRevision set to the returned revision.',
        details: { reason: 'missing_ifRevision', currentRevision, active: hasProject }
      };
    }
    if (currentRevision !== expected) {
      if (this.policies.autoRetryRevision) {
        return null;
      }
      return {
        code: 'invalid_state',
        message: 'Project revision mismatch. Refresh project state before retrying.',
        fix: 'Call get_project_state and retry with the latest revision.',
        details: { expected, currentRevision }
      };
    }
    return null;
  }

  private ensureUvWithinResolution(uv?: [number, number]): ToolError | null {
    if (!uv) return null;
    const resolution = this.editor.getProjectTextureResolution();
    if (!resolution) return null;
    const [u, v] = uv;
    if (u < 0 || v < 0 || u >= resolution.width || v >= resolution.height) {
      return {
        code: 'invalid_payload',
        message: `UV ${u},${v} is outside texture resolution ${resolution.width}x${resolution.height}.`,
        fix: 'Use get_project_state to read textureResolution and adjust uv or change the project texture resolution.',
        details: { uv, textureResolution: resolution }
      };
    }
    return null;
  }

  private ensureFaceUvWithinResolution(uv: [number, number, number, number]): ToolError | null {
    const resolution = this.editor.getProjectTextureResolution();
    if (!resolution) return null;
    const [x1, y1, x2, y2] = uv;
    if (x1 < 0 || y1 < 0 || x2 < 0 || y2 < 0) {
      return {
        code: 'invalid_payload',
        message: 'Face UV coordinates must be non-negative.',
        details: { uv, textureResolution: resolution }
      };
    }
    if (x1 > resolution.width || x2 > resolution.width || y1 > resolution.height || y2 > resolution.height) {
      return {
        code: 'invalid_payload',
        message: `Face UV is outside texture resolution ${resolution.width}x${resolution.height}.`,
        fix: 'Use get_project_state to read textureResolution and adjust UVs or change the project texture resolution.',
        details: { uv, textureResolution: resolution }
      };
    }
    if (x2 < x1 || y2 < y1) {
      return {
        code: 'invalid_payload',
        message: 'Face UV coordinates must satisfy x2 >= x1 and y2 >= y1.',
        details: { uv }
      };
    }
    return null;
  }

  private ensureCubeLimit(increment: number): ToolError | null {
    const snapshot = this.getSnapshot(this.policies.snapshotPolicy ?? 'hybrid');
    const current = snapshot.cubes.length;
    const limit = this.capabilities.limits.maxCubes;
    if (current + increment > limit) {
      return { code: 'invalid_payload', message: `Cube limit exceeded (${limit})` };
    }
    return null;
  }

  private clearManualUvState() {
    this.manualUvCubeIds.clear();
    this.manualUvCubeNames.clear();
  }

  private markManualUv(cube: { id?: string; name?: string }) {
    if (cube.id) this.manualUvCubeIds.add(cube.id);
    if (cube.name) this.manualUvCubeNames.add(cube.name);
  }

  private renameManualUv(oldName: string, newName: string) {
    if (!this.manualUvCubeNames.has(oldName)) return;
    this.manualUvCubeNames.delete(oldName);
    this.manualUvCubeNames.add(newName);
  }

  private clearManualUv(cube: { id?: string; name?: string }) {
    if (cube.id) this.manualUvCubeIds.delete(cube.id);
    if (cube.name) this.manualUvCubeNames.delete(cube.name);
  }

  private isManualUv(cube: { id?: string; name?: string }): boolean {
    if (cube.id && this.manualUvCubeIds.has(cube.id)) return true;
    if (cube.name && this.manualUvCubeNames.has(cube.name)) return true;
    return false;
  }

  private getUvPolicyConfig(): UvPolicyConfig {
    const policy = this.policies.uvPolicy;
    return {
      modelUnitsPerBlock: policy?.modelUnitsPerBlock ?? DEFAULT_UV_POLICY.modelUnitsPerBlock,
      scaleTolerance: policy?.scaleTolerance ?? DEFAULT_UV_POLICY.scaleTolerance,
      tinyThreshold: policy?.tinyThreshold ?? DEFAULT_UV_POLICY.tinyThreshold
    };
  }

  private applyAutoUvPolicy(params: {
    texture: { id?: string; name: string; width?: number; height?: number };
    cubes: SessionState['cubes'];
    faces?: CubeFaceDirection[] | null;
  }) {
    if (!params.texture.name && !params.texture.id) return;
    const size = resolveTextureSize(
      { width: params.texture.width, height: params.texture.height },
      this.editor.getProjectTextureResolution() ?? undefined
    );
    if (!size.width || !size.height) return;
    const usage = this.editor.getTextureUsage({
      textureId: params.texture.id,
      textureName: params.texture.name
    });
    if (usage.error || !usage.result) return;
    const usageEntry =
      usage.result.textures.find((entry) => (params.texture.id && entry.id === params.texture.id) || entry.name === params.texture.name) ??
      usage.result.textures[0];
    if (!usageEntry) return;
    const faceUvByCubeName = new Map<string, FaceUvMap>();
    usageEntry.cubes.forEach((cube) => {
      const faceMap: FaceUvMap = {};
      cube.faces.forEach((face) => {
        if (face.uv) faceMap[face.face] = face.uv;
      });
      faceUvByCubeName.set(cube.name, faceMap);
    });
    const faces = params.faces && params.faces.length > 0 ? params.faces : Array.from(VALID_CUBE_FACES);
    const policy = this.getUvPolicyConfig();
    params.cubes.forEach((cube) => {
      if (this.isManualUv(cube)) return;
      const faceMap = faceUvByCubeName.get(cube.name);
      const updates: FaceUvMap = {};
      faces.forEach((face) => {
        const faceDimensions = getFaceDimensions(cube, face);
        const expected = computeExpectedUvSize(faceDimensions, { width: size.width, height: size.height }, policy);
        if (!expected) return;
        const actual = faceMap?.[face];
        if (!shouldAutoFixUv(actual, expected, policy)) return;
        updates[face] = [0, 0, expected.width, expected.height];
      });
      if (Object.keys(updates).length === 0) return;
      this.editor.setFaceUv({ cubeId: cube.id, cubeName: cube.name, faces: updates });
    });
  }

}

const hashCanvasImage = (image: CanvasImageSource | undefined): string | null => {
  if (!image) return null;
  const candidate = image as { toDataURL?: (type?: string) => string };
  if (typeof candidate.toDataURL !== 'function') return null;
  return hashText(candidate.toDataURL('image/png'));
};

const parseDataUriMimeType = (dataUri: string): string | null => {
  const match = /^data:([^;]+);base64,/i.exec(String(dataUri ?? ''));
  return match?.[1] ?? null;
};

const normalizeTextureDataUri = (value?: string): string | null => {
  if (!value) return null;
  return value.startsWith('data:') ? value : `data:image/png;base64,${value}`;
};

const resolveTextureSize = (
  primary: { width?: number; height?: number },
  ...fallbacks: Array<{ width?: number; height?: number } | undefined>
): { width?: number; height?: number } => {
  const pick = (value?: number): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
  const candidates = [primary, ...fallbacks].filter(Boolean) as Array<{ width?: number; height?: number }>;
  let width: number | undefined;
  let height: number | undefined;
  candidates.forEach((entry) => {
    if (width === undefined) width = pick(entry.width);
    if (height === undefined) height = pick(entry.height);
  });
  return { width, height };
};

const hashText = (value: string): string => {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
};

const VALID_CUBE_FACES: ReadonlySet<CubeFaceDirection> = new Set([
  'north',
  'south',
  'east',
  'west',
  'up',
  'down'
]);

const normalizeCubeFaces = (faces?: CubeFaceDirection[]): CubeFaceDirection[] | null => {
  if (!faces || faces.length === 0) return null;
  const normalized: CubeFaceDirection[] = [];
  for (const face of faces) {
    if (!VALID_CUBE_FACES.has(face)) {
      return null;
    }
    if (!normalized.includes(face)) {
      normalized.push(face);
    }
  }
  return normalized.length > 0 ? normalized : null;
};

const resolveCubeTargets = (cubes: SessionState['cubes'], cubeIds?: string[], cubeNames?: string[]) => {
  const ids = new Set(cubeIds ?? []);
  const names = new Set(cubeNames ?? []);
  if (ids.size === 0 && names.size === 0) {
    return [...cubes];
  }
  return cubes.filter((cube) => (cube.id && ids.has(cube.id)) || names.has(cube.name));
};

const summarizeTextureUsage = (usage: TextureUsageResult): PreflightUsageSummary => {
  let cubeCount = 0;
  let faceCount = 0;
  usage.textures.forEach((entry) => {
    cubeCount += entry.cubeCount;
    faceCount += entry.faceCount;
  });
  return {
    textureCount: usage.textures.length,
    cubeCount,
    faceCount,
    unresolvedCount: usage.unresolved?.length ?? 0
  };
};

const computeUvBounds = (usage: TextureUsageResult): PreflightUvBounds | null => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let faceCount = 0;
  usage.textures.forEach((entry) => {
    entry.cubes.forEach((cube) => {
      cube.faces.forEach((face) => {
        if (!face.uv) return;
        const [x1, y1, x2, y2] = face.uv;
        const localMinX = Math.min(x1, x2);
        const localMinY = Math.min(y1, y2);
        const localMaxX = Math.max(x1, x2);
        const localMaxY = Math.max(y1, y2);
        if (localMinX < minX) minX = localMinX;
        if (localMinY < minY) minY = localMinY;
        if (localMaxX > maxX) maxX = localMaxX;
        if (localMaxY > maxY) maxY = localMaxY;
        faceCount += 1;
      });
    });
  });
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
    faceCount
  };
};

const recommendResolution = (
  bounds: PreflightUvBounds | null,
  current: { width: number; height: number } | undefined,
  maxSize: number
): { width: number; height: number; reason: string } | null => {
  if (!bounds) return null;
  const requiredWidth = Math.max(bounds.maxX, current?.width ?? 0);
  const requiredHeight = Math.max(bounds.maxY, current?.height ?? 0);
  const width = clampResolution(roundUpResolution(requiredWidth), maxSize);
  const height = clampResolution(roundUpResolution(requiredHeight), maxSize);
  if (current && width <= current.width && height <= current.height) return null;
  const reason = current ? 'uv_bounds_exceed_resolution' : 'resolution_missing';
  return { width, height, reason };
};

const roundUpResolution = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 16;
  if (value <= 16) return 16;
  return Math.ceil(value / 32) * 32;
};

const clampResolution = (value: number, maxSize: number): number => {
  if (value <= 0) return 16;
  if (value > maxSize) return maxSize;
  return value;
};

const DEFAULT_RELOAD_DELAY_MS = 100;
const MAX_RELOAD_DELAY_MS = 10_000;

const normalizeReloadDelay = (value?: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_RELOAD_DELAY_MS;
  const rounded = Math.max(0, Math.trunc(value));
  return Math.min(rounded, MAX_RELOAD_DELAY_MS);
};

function exportFormatToCapability(format: ExportPayload['format']): FormatKind | null {
  switch (format) {
    case 'java_block_item_json':
      return 'Java Block/Item';
    case 'gecko_geo_anim':
      return 'geckolib';
    case 'animated_java':
      return 'animated_java';
    default:
      return null;
  }
}

type BlockResourceEntry = {
  uri: string;
  kind: BlockResource['kind'];
  name: string;
  mimeType: string;
  text: string;
};

const DEFAULT_BLOCK_NAMESPACE = 'mod';
const VALID_RESOURCE_TOKEN = /^[a-z0-9._-]+$/;

const normalizeBlockNamespace = (value?: string): string => {
  const trimmed = String(value ?? '').trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_BLOCK_NAMESPACE;
};

const normalizeBlockVariants = (variants?: BlockVariant[]): BlockVariant[] => {
  const list = Array.isArray(variants) && variants.length > 0 ? variants : ['block'];
  const valid: BlockVariant[] = ['block', 'slab', 'stairs', 'wall'];
  const set = new Set<BlockVariant>();
  list.forEach((variant) => {
    if (valid.includes(variant)) {
      set.add(variant);
    }
  });
  return Array.from(set);
};

const isValidResourceToken = (value: string): boolean => VALID_RESOURCE_TOKEN.test(value);

const stripPrefix = (value: string, prefix: string): string =>
  value.startsWith(prefix) ? value.slice(prefix.length) : value;

const buildBlockResourceUri = (namespace: string, resource: BlockResource): string => {
  if (resource.kind === 'blockstate') {
    return `bbmcp://blockstate/${namespace}/${resource.name}`;
  }
  if (resource.kind === 'model') {
    const modelName = stripPrefix(resource.name, 'block/');
    return `bbmcp://model/block/${namespace}/${modelName}`;
  }
  const itemName = stripPrefix(resource.name, 'item/');
  return `bbmcp://model/item/${namespace}/${itemName}`;
};

const collectBlockAssets = (resources: BlockResource[]) => {
  const blockstates: Record<string, unknown> = {};
  const models: Record<string, unknown> = {};
  const items: Record<string, unknown> = {};
  resources.forEach((resource) => {
    if (resource.kind === 'blockstate') {
      blockstates[resource.name] = resource.json;
    } else if (resource.kind === 'model') {
      models[resource.name] = resource.json;
    } else if (resource.kind === 'item') {
      items[resource.name] = resource.json;
    }
  });
  return { blockstates, models, items };
};

const buildBlockResourceEntries = (namespace: string, resources: BlockResource[]): BlockResourceEntry[] =>
  resources.map((resource) => ({
    uri: buildBlockResourceUri(namespace, resource),
    kind: resource.kind,
    name: resource.name,
    mimeType: 'application/json',
    text: JSON.stringify(resource.json, null, 2)
  }));

const appendUriSuffix = (uri: string, suffix: string): string => {
  const idx = uri.lastIndexOf('/');
  if (idx < 0) return `${uri}${suffix}`;
  return `${uri.slice(0, idx + 1)}${uri.slice(idx + 1)}${suffix}`;
};

const resolveVersionedEntries = (
  store: ResourceStore,
  entries: BlockResourceEntry[]
): { suffix: string; entries: BlockResourceEntry[] } | null => {
  for (let version = 2; version < 100; version += 1) {
    const suffix = `_v${version}`;
    const next = entries.map((entry) => ({ ...entry, uri: appendUriSuffix(entry.uri, suffix) }));
    if (next.every((entry) => !store.has(entry.uri))) {
      return { suffix, entries: next };
    }
  }
  return null;
};

export type SnapshotPolicy = 'session' | 'live' | 'hybrid';

export interface ToolPolicies {
  formatOverrides?: FormatOverrides;
  snapshotPolicy?: SnapshotPolicy;
  rigMergeStrategy?: RigMergeStrategy;
  exportPolicy?: ExportPolicy;
  autoDiscardUnsaved?: boolean;
  autoAttachActiveProject?: boolean;
  autoIncludeState?: boolean;
  requireRevision?: boolean;
  autoRetryRevision?: boolean;
  uvPolicy?: {
    modelUnitsPerBlock?: number;
    scaleTolerance?: number;
    tinyThreshold?: number;
  };
}

export type ExportPolicy = 'strict' | 'best_effort';
