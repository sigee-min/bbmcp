import type { Capabilities, ExportPayload, ExportResult, ToolError } from '@ashfox/contracts/types/internal';
import type { ExportPort } from '../ports/exporter';
import type { EditorPort } from '../ports/editor';
import type { FormatPort } from '../ports/formats';
import type { NativeCodecTarget } from '../ports/exporter';
import type { ProjectSession } from '../session';
import { fail, ok, UsecaseResult } from './result';
import { type FormatOverrides } from '../domain/formats';
import { withFormatOverrideHint } from './formatHints';
import type { ExportPolicy } from './policies';
import {
  EXPORT_AUTHORING_FORMAT_ID_MISSING,
  EXPORT_AUTHORING_NOT_ENABLED,
  EXPORT_CODEC_ID_EMPTY,
  EXPORT_CODEC_ID_FORBIDDEN,
  EXPORT_CODEC_ID_REQUIRED,
  EXPORT_CODEC_UNSUPPORTED,
} from '../shared/messages';
import { exportRequiresAuthoringFormat } from '../domain/export/formatMapping';
import { ensureExportFormatEnabled } from '../domain/export/guards';
import { resolveExportFormatId } from '../domain/export/formatId';
import { resolveRequestedExport } from '../domain/export/requestedFormat';
import { writeInternalFallbackExport } from './export/writeInternalFallback';
import type { ResolvedExportSelection } from '../domain/export/types';

export interface ExportServiceDeps {
  capabilities: Capabilities;
  editor: EditorPort;
  exporter: ExportPort;
  formats: FormatPort;
  getSnapshot: () => ReturnType<ProjectSession['snapshot']>;
  ensureActive: () => ToolError | null;
  policies: {
    formatOverrides?: FormatOverrides;
    exportPolicy?: ExportPolicy;
  };
}

export class ExportService {
  private readonly capabilities: Capabilities;
  private readonly editor: EditorPort;
  private readonly exporter: ExportPort;
  private readonly formats: FormatPort;
  private readonly getSnapshot: () => ReturnType<ProjectSession['snapshot']>;
  private readonly ensureActive: () => ToolError | null;
  private readonly policies: ExportServiceDeps['policies'];

  constructor(deps: ExportServiceDeps) {
    this.capabilities = deps.capabilities;
    this.editor = deps.editor;
    this.exporter = deps.exporter;
    this.formats = deps.formats;
    this.getSnapshot = deps.getSnapshot;
    this.ensureActive = deps.ensureActive;
    this.policies = deps.policies;
  }

  async exportModel(payload: ExportPayload): Promise<UsecaseResult<ExportResult>> {
    const activeErr = this.ensureActive();
    if (activeErr) {
      return this.failWithExportHints(activeErr, this.getSnapshot(), this.listNativeCodecs());
    }

    const exportPolicy = payload.options?.fallback ?? this.policies.exportPolicy ?? 'strict';
    const includeDiagnostics = payload.options?.includeDiagnostics === true;
    const snapshot = this.getSnapshot();
    const nativeCodecs = this.listNativeCodecs();
    const requestedResult = resolveRequestedExport(payload);
    if (!requestedResult.ok) {
      switch (requestedResult.reason) {
        case 'codec_required':
          return this.failWithExportHints({ code: 'invalid_payload', message: EXPORT_CODEC_ID_REQUIRED }, snapshot, nativeCodecs);
        case 'codec_empty':
          return this.failWithExportHints({ code: 'invalid_payload', message: EXPORT_CODEC_ID_EMPTY }, snapshot, nativeCodecs);
        case 'codec_forbidden':
          return this.failWithExportHints({ code: 'invalid_payload', message: EXPORT_CODEC_ID_FORBIDDEN }, snapshot, nativeCodecs);
      }
    }

    const requested = requestedResult.value;
    const requestedFormat = requested.format;
    const requiresAuthoringFormat = exportRequiresAuthoringFormat(requestedFormat);
    const resolvedTarget = this.buildSelectedTarget(requested);
    const formatGuard = ensureExportFormatEnabled(this.capabilities, requiresAuthoringFormat);
    if (!formatGuard.ok) {
      return this.failWithExportHints(
        { code: 'unsupported_format', message: EXPORT_AUTHORING_NOT_ENABLED },
        snapshot,
        nativeCodecs
      );
    }

    if (requestedFormat === 'gltf') {
      const fallbackResult = writeInternalFallbackExport(this.editor, 'gltf', payload.destPath, snapshot, {
        selectedTarget: resolvedTarget,
        stage: 'fallback'
      });
      return this.withExportHintsResult(fallbackResult, snapshot, nativeCodecs);
    }
    if (requestedFormat === 'native_codec') {
      if (!requested.codecId) {
        return this.failWithExportHints({ code: 'invalid_payload', message: EXPORT_CODEC_ID_REQUIRED }, snapshot, nativeCodecs);
      }
      const codecId = this.resolveCodecId(requested.codecId, nativeCodecs);
      if (!codecId) {
        return this.failWithExportHints(
          { code: 'unsupported_format', message: EXPORT_CODEC_UNSUPPORTED(requested.codecId) },
          snapshot,
          nativeCodecs,
          requested.codecId
        );
      }
      const result = await this.exportCodec(codecId, payload.destPath, resolvedTarget);
      return this.withExportHintsResult(result, snapshot, nativeCodecs, codecId);
    }

    const formatId = resolveExportFormatId(
      snapshot,
      requiresAuthoringFormat,
      this.formats.listFormats(),
      this.policies.formatOverrides,
      this.formats.getActiveFormatId()
    );
    if (!formatId) {
      if (exportPolicy === 'best_effort') {
        const fallbackResult = writeInternalFallbackExport(
          this.editor,
          requestedFormat,
          payload.destPath,
          snapshot,
          {
            selectedTarget: resolvedTarget,
            stage: 'fallback'
          }
        );
        return this.withExportHintsResult(fallbackResult, snapshot, nativeCodecs);
      }
      return this.failWithExportHints(
        { code: 'unsupported_format', message: withFormatOverrideHint(EXPORT_AUTHORING_FORMAT_ID_MISSING) },
        snapshot,
        nativeCodecs
      );
    }

    const nativeErr = await this.exporter.exportNative({ formatId, destPath: payload.destPath });
    if (!nativeErr) {
      return ok({
        path: payload.destPath,
        selectedTarget: this.withFormatId(resolvedTarget, formatId),
        stage: 'done'
      });
    }
    if (exportPolicy === 'strict') {
      return this.failWithExportHints(nativeErr, snapshot, nativeCodecs);
    }
    if (nativeErr.code !== 'not_implemented' && nativeErr.code !== 'unsupported_format') {
      return this.failWithExportHints(nativeErr, snapshot, nativeCodecs);
    }
    return writeInternalFallbackExport(this.editor, requestedFormat, payload.destPath, snapshot, {
      selectedTarget: this.withFormatId(resolvedTarget, formatId),
      stage: 'fallback',
      warnings: includeDiagnostics ? [nativeErr.message] : undefined
    });
  }

  private async exportCodec(
    codecId: string,
    destPath: string,
    selectedTarget: NonNullable<ExportResult['selectedTarget']>
  ): Promise<UsecaseResult<ExportResult>> {
    if (typeof this.exporter.exportCodec !== 'function') {
      return fail({ code: 'not_implemented', message: 'Native codec export is not available in this runtime.' });
    }
    const err = await this.exporter.exportCodec({ codecId, destPath });
    if (err) return fail(err);
    return ok({ path: destPath, selectedTarget, stage: 'done' });
  }

  private listNativeCodecs() {
    const list = this.exporter.listNativeCodecs;
    if (typeof list !== 'function') return [];
    return list();
  }

  private resolveCodecId(requestedCodecId: string, nativeCodecs: NativeCodecTarget[]): string | null {
    const token = normalizeCodecToken(requestedCodecId);
    if (!token) return null;
    for (const codec of nativeCodecs) {
      if (normalizeCodecToken(codec.id) === token) return codec.id;
      if (codec.extensions.some((value) => normalizeCodecToken(value) === token)) return codec.id;
    }
    return null;
  }

  private failWithExportHints(
    error: ToolError,
    snapshot: ReturnType<ProjectSession['snapshot']>,
    nativeCodecs: NativeCodecTarget[],
    requestedCodecId?: string
  ): UsecaseResult<never> {
    return fail(this.withExportHints(error, snapshot, nativeCodecs, requestedCodecId));
  }

  private withExportHintsResult<T extends ExportResult>(
    result: UsecaseResult<T>,
    snapshot: ReturnType<ProjectSession['snapshot']>,
    nativeCodecs: NativeCodecTarget[],
    requestedCodecId?: string
  ): UsecaseResult<T> {
    if (result.ok) return result;
    return fail(this.withExportHints(result.error, snapshot, nativeCodecs, requestedCodecId));
  }

  private withExportHints(
    error: ToolError,
    snapshot: ReturnType<ProjectSession['snapshot']>,
    nativeCodecs: NativeCodecTarget[],
    requestedCodecId?: string
  ): ToolError {
    const details: Record<string, unknown> = { ...(error.details ?? {}) };
    const availableTargets = this.listAvailableExportTargets();
    if (availableTargets.length > 0) details.availableTargets = availableTargets;
    const recommendedTarget = this.recommendExportTarget(snapshot, availableTargets);
    if (recommendedTarget) details.recommendedTarget = recommendedTarget;
    if (nativeCodecs.length > 0) {
      details.availableCodecs = nativeCodecs.map((codec) => ({
        id: codec.id,
        label: codec.label,
        extensions: codec.extensions
      }));
    }
    if (requestedCodecId) details.requestedCodecId = requestedCodecId;
    return Object.keys(details).length === 0 ? error : { ...error, details };
  }

  private listAvailableExportTargets(): Array<{ kind: string; id: string; label: string; extensions?: string[] }> {
    return (this.capabilities.exportTargets ?? [])
      .filter((target) => target.available)
      .map((target) => ({
        kind: target.kind,
        id: target.id,
        label: target.label,
        ...(target.extensions && target.extensions.length > 0 ? { extensions: target.extensions } : {})
      }));
  }

  private recommendExportTarget(
    _snapshot: ReturnType<ProjectSession['snapshot']>,
    availableTargets: Array<{ kind: string; id: string; label: string; extensions?: string[] }>
  ): { kind: string; id: string; label: string; extensions?: string[] } | null {
    if (availableTargets.length === 0) return null;
    const order = ['gecko_geo_anim', 'gltf', 'native_codec'];
    for (const id of order) {
      const found = availableTargets.find((target) => target.id === id);
      if (found) return found;
    }
    return availableTargets[0];
  }

  private buildSelectedTarget(
    selection: ResolvedExportSelection
  ): NonNullable<ExportResult['selectedTarget']> {
    switch (selection.format) {
      case 'native_codec':
        return {
          kind: 'native_codec',
          id: selection.codecId ?? 'native_codec',
          ...(selection.codecId ? { codecId: selection.codecId } : {})
        };
      case 'gltf':
        return { kind: 'gltf', id: 'gltf' };
      default:
        return { kind: 'internal', id: selection.format };
    }
  }

  private withFormatId(
    selectedTarget: NonNullable<ExportResult['selectedTarget']>,
    formatId: string
  ): NonNullable<ExportResult['selectedTarget']> {
    if (selectedTarget.kind !== 'internal') return selectedTarget;
    return { ...selectedTarget, formatId };
  }
}

const normalizeCodecToken = (value: string): string =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
