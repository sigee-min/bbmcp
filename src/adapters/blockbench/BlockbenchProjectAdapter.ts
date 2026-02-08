import type { FormatKind, ToolError } from '@ashfox/contracts/types/internal';
import type { Logger } from '../../logging';
import { runCloseProject } from './project/projectClose';
import { runCreateProject } from './project/projectCreate';
import {
  readProjectTextureResolution,
  runSetProjectTextureResolution,
  runSetProjectUvPixelsPerBlock
} from './project/projectResolution';
import { runWriteFile } from './project/projectWrite';

export class BlockbenchProjectAdapter {
  private readonly log: Logger;

  constructor(log: Logger) {
    this.log = log;
  }

  createProject(
    name: string,
    formatId: string,
    kind: FormatKind,
    options?: { confirmDiscard?: boolean; dialog?: Record<string, unknown> }
  ): ToolError | null {
    return runCreateProject(this.log, name, formatId, kind, options);
  }

  closeProject(options?: { force?: boolean }): ToolError | null {
    return runCloseProject(this.log, options);
  }

  writeFile(path: string, contents: string): ToolError | null {
    return runWriteFile(this.log, path, contents);
  }

  getProjectTextureResolution(): { width: number; height: number } | null {
    return readProjectTextureResolution();
  }

  setProjectTextureResolution(width: number, height: number, modifyUv?: boolean): ToolError | null {
    return runSetProjectTextureResolution(this.log, width, height, modifyUv);
  }

  setProjectUvPixelsPerBlock(pixelsPerBlock: number): ToolError | null {
    return runSetProjectUvPixelsPerBlock(this.log, pixelsPerBlock);
  }
}

