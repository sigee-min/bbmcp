import {
  TOOL_NAMES,
  type Capabilities,
  type ToolName
} from '@ashfox/contracts/types/internal';
import { computeCapabilities } from '../../../runtime/src/config';
import type { NativeCodecTarget } from '../../../runtime/src/ports/exporter';
import type { FormatPort } from '../../../runtime/src/ports/formats';
import { buildToolRegistry } from '../../../runtime/src/transport/mcp/tools';

type ToolAvailabilityMap = NonNullable<Capabilities['toolAvailability']>;
type ToolAvailabilityEntry = NonNullable<ToolAvailabilityMap[ToolName]>;

const buildToolAvailability = (
  overrides: Partial<Record<ToolName, ToolAvailabilityEntry>>
): ToolAvailabilityMap => {
  const availability: ToolAvailabilityMap = {};
  for (const name of TOOL_NAMES) {
    availability[name] = { available: true };
  }
  for (const [name, entry] of Object.entries(overrides) as Array<[ToolName, ToolAvailabilityEntry | undefined]>) {
    if (!entry) continue;
    availability[name] = entry;
  }
  return availability;
};

export const buildEngineCapabilities = (formats: FormatPort, nativeCodecs: NativeCodecTarget[]): Capabilities => {
  const activeFormatId = formats.getActiveFormatId();
  const capabilities = computeCapabilities(
    'native',
    formats.listFormats(),
    activeFormatId ? { formatId: activeFormatId } : undefined
  );
  const toolRegistry = buildToolRegistry({ includeLowLevel: true });
  capabilities.toolRegistry = { hash: toolRegistry.hash, count: toolRegistry.count };
  capabilities.exportTargets = [
    {
      kind: 'internal',
      id: 'gecko_geo_anim',
      label: 'Entity Rig Geo+Anim JSON',
      extensions: ['json'],
      available: true
    },
    {
      kind: 'gltf',
      id: 'gltf',
      label: 'glTF (cleanroom codec)',
      extensions: ['gltf', 'glb'],
      available: true
    },
    {
      kind: 'native_codec',
      id: 'native_codec',
      label: 'Native Codec Export',
      available: nativeCodecs.length > 0
    }
  ];
  capabilities.exportTargets.push(
    ...nativeCodecs.map((codec) => ({
      kind: 'native_codec' as const,
      id: codec.id,
      label: codec.label,
      extensions: codec.extensions,
      available: true
    }))
  );
  capabilities.toolAvailability = buildToolAvailability({
    render_preview: {
      available: false,
      reason: 'no_render_profile',
      note: 'render_preview is unavailable in native no-render profile.'
    },
    reload_plugins: {
      available: false,
      reason: 'host_unavailable',
      note: 'reload_plugins requires host plugin APIs.'
    },
    export_trace_log: {
      available: false,
      reason: 'trace_log_unavailable',
      note: 'export_trace_log requires plugin trace log host support.'
    },
    paint_faces: {
      available: false,
      reason: 'texture_renderer_unavailable',
      note: 'paint_faces requires texture renderer host support.'
    }
  });
  return capabilities;
};
