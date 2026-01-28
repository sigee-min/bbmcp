import type { Capabilities, ExportPayload, FormatKind, ToolError } from '../types';
import type { ExportPort } from '../ports/exporter';
import type { EditorPort } from '../ports/editor';
import type { FormatPort } from '../ports/formats';
import type { ProjectSession } from '../session';
import { ProjectStateService } from '../services/projectState';
import { ok, fail, UsecaseResult } from './result';
import { resolveFormatId, FormatOverrides, matchesFormatKind } from '../services/format';
import { buildInternalExport } from '../services/exporters';
import { withFormatOverrideHint } from './formatHints';
import type { ExportPolicy } from './policies';
import { ensureActiveOnly } from './guards';
import {
  EXPORT_FORMAT_ID_MISSING,
  EXPORT_FORMAT_MISMATCH,
  EXPORT_FORMAT_NOT_ENABLED
} from '../shared/messages';

export interface ExportServiceDeps {
  capabilities: Capabilities;
  editor: EditorPort;
  exporter: ExportPort;
  formats: FormatPort;
  projectState: ProjectStateService;
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
  private readonly projectState: ProjectStateService;
  private readonly getSnapshot: () => ReturnType<ProjectSession['snapshot']>;
  private readonly ensureActive: () => ToolError | null;
  private readonly policies: ExportServiceDeps['policies'];

  constructor(deps: ExportServiceDeps) {
    this.capabilities = deps.capabilities;
    this.editor = deps.editor;
    this.exporter = deps.exporter;
    this.formats = deps.formats;
    this.projectState = deps.projectState;
    this.getSnapshot = deps.getSnapshot;
    this.ensureActive = deps.ensureActive;
    this.policies = deps.policies;
  }

  exportModel(payload: ExportPayload): UsecaseResult<{ path: string }> {
    const activeErr = ensureActiveOnly(this.ensureActive);
    if (activeErr) return fail(activeErr);
    const exportPolicy = this.policies.exportPolicy ?? 'strict';
    const snapshot = this.getSnapshot();
    const expectedFormat = exportFormatToCapability(payload.format);
    if (expectedFormat) {
      const formatCapability = this.capabilities.formats.find((f) => f.format === expectedFormat);
      if (!formatCapability || !formatCapability.enabled) {
        return fail({ code: 'unsupported_format', message: EXPORT_FORMAT_NOT_ENABLED(expectedFormat) });
      }
    }
    if (expectedFormat) {
      if (snapshot.format && snapshot.format !== expectedFormat) {
        return fail({ code: 'invalid_payload', message: EXPORT_FORMAT_MISMATCH });
      }
      if (
        !snapshot.format &&
        snapshot.formatId &&
        !matchesFormatKind(expectedFormat, snapshot.formatId) &&
        this.projectState.matchOverrideKind(snapshot.formatId) !== expectedFormat
      ) {
        return fail({
          code: 'invalid_payload',
          message: withFormatOverrideHint(EXPORT_FORMAT_MISMATCH)
        });
      }
    }
    const formatId =
      snapshot.formatId ??
      (expectedFormat ? resolveFormatId(expectedFormat, this.formats.listFormats(), this.policies.formatOverrides) : null);
    if (!formatId) {
      return fail({ code: 'unsupported_format', message: withFormatOverrideHint(EXPORT_FORMAT_ID_MISSING) });
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
}

const exportFormatToCapability = (format: ExportPayload['format']): FormatKind | null => {
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
};
