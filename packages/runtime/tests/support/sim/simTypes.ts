import type { FormatDescriptor } from '../../../src/ports/formats';
import type { TextureResolution } from '../../../src/ports/editor';
import type { RenderPreviewResult, FormatKind } from '../../../src/types';
import type { TrackedAnimation, TrackedBone } from '../../../src/session';
import type { CubeInstance, TextureInstance } from '../../../src/types/blockbench';

export type BlockbenchSimProject = {
  id: string;
  name: string | null;
  format: FormatKind | null;
  formatId?: string | null;
  textureResolution: TextureResolution | null;
  uvPixelsPerBlock?: number;
};

export type BlockbenchSimState = {
  project: BlockbenchSimProject;
  cubes: CubeInstance[];
  textures: TextureInstance[];
  bones: TrackedBone[];
  animations: TrackedAnimation[];
  writes: Array<{ path: string; contents: string }>;
  preview?: RenderPreviewResult;
};

export type BlockbenchSimOptions = {
  project?: Partial<BlockbenchSimProject>;
  cubes?: CubeInstance[];
  textures?: TextureInstance[];
  bones?: TrackedBone[];
  animations?: TrackedAnimation[];
  preview?: RenderPreviewResult;
  formatCaps?: FormatDescriptor | null;
  resolveFormatCaps?: (formatId?: string | null, format?: FormatKind | null) => FormatDescriptor | null | undefined;
};

export type SimCounters = {
  nextTextureId: number;
  nextCubeId: number;
};
