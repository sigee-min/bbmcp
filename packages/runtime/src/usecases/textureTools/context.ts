import type { Capabilities, ToolError } from '@ashfox/contracts/types/internal';
import type { EditorPort } from '../../ports/editor';
import type { TextureRendererPort } from '../../ports/textureRenderer';
import type { SessionState } from '../../session';
import type { UvPolicyConfig } from '../../domain/uv/policy';
import type { UsecaseResult } from '../result';
import {
  buildUvAtlasMessages,
  buildUvGuardMessages,
  buildUvPaintMessages,
  buildUvPaintPixelMessages,
  buildUvPaintSourceMessages
} from '../../shared/messages';

export type TextureToolContext = {
  ensureActive: () => ToolError | null;
  ensureRevisionMatch: (ifRevision?: string) => ToolError | null;
  getSnapshot: () => SessionState;
  editor: EditorPort;
  textureRenderer?: TextureRendererPort;
  capabilities: Capabilities;
  getUvPolicyConfig: () => UvPolicyConfig;
  importTexture: (payload: {
    name: string;
    image: CanvasImageSource;
    width?: number;
    height?: number;
    ifRevision?: string;
  }) => UsecaseResult<{ id: string; name: string }>;
  updateTexture: (payload: {
    id?: string;
    name?: string;
    newName?: string;
    image: CanvasImageSource;
    width?: number;
    height?: number;
    ifRevision?: string;
  }) => UsecaseResult<{ id: string; name: string }>;
  setProjectUvPixelsPerBlock?: (value: number) => ToolError | null;
  assignTexture?: (payload: {
    textureId?: string;
    textureName?: string;
    cubeIds?: string[];
    cubeNames?: string[];
    faces?: import('../../ports/editor').CubeFaceDirection[];
    ifRevision?: string;
  }) => UsecaseResult<{ textureId?: string; textureName: string; cubeCount: number; faces?: import('../../ports/editor').CubeFaceDirection[] }>;
  createBlankTexture?: (payload: {
    name: string;
    width?: number;
    height?: number;
    background?: string;
    ifRevision?: string;
    allowExisting?: boolean;
  }) => UsecaseResult<{ id: string; name: string; created: boolean }>;
  preflightTexture?: (payload: { textureId?: string; textureName?: string; includeUsage?: boolean }) => UsecaseResult<import('@ashfox/contracts/types/internal').PreflightTextureResult>;
  autoUvAtlas?: (payload: import('@ashfox/contracts/types/internal').AutoUvAtlasPayload) => UsecaseResult<import('@ashfox/contracts/types/internal').AutoUvAtlasResult>;
  runWithoutRevisionGuard?: <T>(fn: () => T) => T;
};

export const uvAtlasMessages = buildUvAtlasMessages();
export const uvGuardMessages = buildUvGuardMessages();
export const uvPaintMessages = buildUvPaintMessages();
export const uvPaintPixelMessages = buildUvPaintPixelMessages();
export const uvPaintSourceMessages = buildUvPaintSourceMessages();

