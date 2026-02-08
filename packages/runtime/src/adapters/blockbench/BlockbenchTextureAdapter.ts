import { ToolError } from '@ashfox/contracts/types/internal';
import { Logger } from '../../logging';
import {
  ImportTextureCommand,
  ReadTextureCommand,
  TextureSource,
  TextureStat,
  UpdateTextureCommand,
  DeleteTextureCommand
} from '../../ports/editor';
import {
  runDeleteTexture,
  runImportTexture,
  runListTextures,
  runReadTexture,
  runUpdateTexture
} from './texture/textureCommands';

export class BlockbenchTextureAdapter {
  private readonly log: Logger;

  constructor(log: Logger) {
    this.log = log;
  }

  importTexture(params: ImportTextureCommand): ToolError | null {
    return runImportTexture(this.log, params);
  }

  updateTexture(params: UpdateTextureCommand): ToolError | null {
    return runUpdateTexture(this.log, params);
  }

  deleteTexture(params: DeleteTextureCommand): ToolError | null {
    return runDeleteTexture(this.log, params);
  }

  readTexture(params: ReadTextureCommand): { result?: TextureSource; error?: ToolError } {
    return runReadTexture(this.log, params);
  }

  listTextures(): TextureStat[] {
    return runListTextures();
  }
}




