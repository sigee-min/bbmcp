import type { Capabilities, ExportPayload, FormatKind } from '@ashfox/contracts/types/internal';
import type { ProjectSession } from '../session';
import type { BlockbenchFormats } from '../adapters/blockbench/BlockbenchFormats';
import type { ExportPolicy } from '../usecases/policies';
import { readGlobals } from '../adapters/blockbench/blockbenchUtils';
import { buildInternalExport } from '../domain/exporters';
import { resolveFormatId, type FormatOverrides } from '../domain/formats';
import { PLUGIN_ID } from '../config';
import {
  PLUGIN_UI_EXPORT_COMPLETE,
  PLUGIN_UI_EXPORT_FAILED,
  PLUGIN_UI_EXPORT_FAILED_GENERIC
} from './messages';
import {
  ADAPTER_NATIVE_COMPILER_ASYNC_UNSUPPORTED,
  ADAPTER_NATIVE_COMPILER_EMPTY,
  ADAPTER_NATIVE_COMPILER_UNAVAILABLE,
  EXPORT_FORMAT_ID_MISSING_FOR_KIND
} from '../shared/messages';

export const registerCodecs = (args: {
  capabilities: Capabilities;
  session: ProjectSession;
  formats: BlockbenchFormats;
  formatOverrides: FormatOverrides;
  exportPolicy: ExportPolicy;
}): void => {
  const globals = readGlobals();
  const blockbench = globals.Blockbench;
  const codecCtor = globals.Codec;
  if (!blockbench || !codecCtor) return;

  const notifyExportFailure = (message?: string) => {
    const content = message ?? PLUGIN_UI_EXPORT_FAILED_GENERIC;
    blockbench.showQuickMessage?.(PLUGIN_UI_EXPORT_FAILED(content), 2000);
  };

  const buildInternalExportString = (exportKind: ExportPayload['format']): string | null => {
    const snapshot = args.session.snapshot();
    try {
      return JSON.stringify(buildInternalExport(exportKind, snapshot).data);
    } catch (_err) {
      return null;
    }
  };

  const resolveCompiler = (formatId: string | null) => {
    if (!formatId) return null;
    const registry = globals.Formats ?? globals.ModelFormat?.formats ?? null;
    if (!registry || typeof registry !== 'object') return null;
    const format = registry[formatId] ?? null;
    if (!format) return null;
    const compile = format.compile;
    if (typeof compile === 'function') {
      return () => compile();
    }
    const codecCompile = format.codec?.compile;
    if (typeof codecCompile === 'function') {
      return () => codecCompile();
    }
    return null;
  };

  const compileFor = (
    kind: FormatKind,
    exportKind: ExportPayload['format']
  ): { ok: true; data: string } | { ok: false; message: string } => {
    const formatId = resolveFormatId(kind, args.formats.listFormats(), args.formatOverrides);
    const compiler = resolveCompiler(formatId);
    if (compiler) {
      const compiled = compiler();
      if (compiled === null || compiled === undefined) {
        if (args.exportPolicy === 'best_effort') {
          const fallback = buildInternalExportString(exportKind);
          if (fallback) return { ok: true, data: fallback };
          return { ok: false, message: ADAPTER_NATIVE_COMPILER_EMPTY };
        }
        return { ok: false, message: ADAPTER_NATIVE_COMPILER_EMPTY };
      }
      if (isThenable(compiled)) {
        if (args.exportPolicy === 'best_effort') {
          const fallback = buildInternalExportString(exportKind);
          if (fallback) return { ok: true, data: fallback };
          return { ok: false, message: ADAPTER_NATIVE_COMPILER_ASYNC_UNSUPPORTED };
        }
        return { ok: false, message: ADAPTER_NATIVE_COMPILER_ASYNC_UNSUPPORTED };
      }
      if (typeof compiled === 'string') {
        return { ok: true, data: compiled };
      }
      try {
        return { ok: true, data: JSON.stringify(compiled) };
      } catch (_err) {
        return { ok: false, message: ADAPTER_NATIVE_COMPILER_EMPTY };
      }
    }
    if (args.exportPolicy === 'best_effort') {
      const fallback = buildInternalExportString(exportKind);
      if (fallback) return { ok: true, data: fallback };
      return { ok: false, message: ADAPTER_NATIVE_COMPILER_EMPTY };
    }
    const reason = formatId
      ? ADAPTER_NATIVE_COMPILER_UNAVAILABLE(formatId)
      : EXPORT_FORMAT_ID_MISSING_FOR_KIND(kind);
    return { ok: false, message: reason };
  };

  const compileWithNotice = (kind: FormatKind, exportKind: ExportPayload['format']): string | null => {
    const result = compileFor(kind, exportKind);
    if (!result.ok) {
      notifyExportFailure(result.message);
      return null;
    }
    return result.data;
  };

  const register = (kind: FormatKind, exportKind: ExportPayload['format'], codecName: string) => {
    new codecCtor({
      name: codecName,
      extension: 'json',
      remember: true,
      compile() {
        const compiled = compileWithNotice(kind, exportKind);
        return compiled ?? '';
      },
      export() {
        try {
          const compiled = compileWithNotice(kind, exportKind);
          if (!compiled) return;
          blockbench.exportFile?.(
            { content: compiled, name: 'model.json' },
            () => blockbench.showQuickMessage?.(PLUGIN_UI_EXPORT_COMPLETE, 1500)
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : PLUGIN_UI_EXPORT_FAILED_GENERIC;
          notifyExportFailure(message);
        }
      }
    });
  };

  if (args.capabilities.formats.find((f) => f.format === 'Java Block/Item' && f.enabled)) {
    register('Java Block/Item', 'java_block_item_json', PLUGIN_ID + '_java_block_item');
  }
  if (args.capabilities.formats.find((f) => f.format === 'geckolib' && f.enabled)) {
    register('geckolib', 'gecko_geo_anim', PLUGIN_ID + '_geckolib');
  }
  if (args.capabilities.formats.find((f) => f.format === 'animated_java' && f.enabled)) {
    register('animated_java', 'animated_java', PLUGIN_ID + '_animated_java');
  }
};

const isThenable = (value: unknown): value is { then: (onFulfilled: (arg: unknown) => unknown) => unknown } => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { then?: unknown };
  return typeof candidate.then === 'function';
};

