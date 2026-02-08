import type { Limits, TextureStat, ValidationFinding } from '../model';
import type { ValidationMessages } from './types';

export const collectTextureFindings = (args: {
  textures?: TextureStat[];
  limits: Limits;
  textureResolution?: { width: number; height: number };
  messages: ValidationMessages;
}): ValidationFinding[] => {
  const findings: ValidationFinding[] = [];
  const textures = args.textures;

  if (textures && textures.length > 0) {
    textures.forEach((tex) => {
      if (tex.width > args.limits.maxTextureSize || tex.height > args.limits.maxTextureSize) {
        findings.push({
          code: 'texture_too_large',
          message: args.messages.textureTooLarge(tex.name, args.limits.maxTextureSize),
          severity: 'error'
        });
      }
    });
  }

  if (args.textureResolution && textures && textures.length > 0) {
    const { width, height } = args.textureResolution;
    textures.forEach((tex) => {
      if (tex.width !== width || tex.height !== height) {
        findings.push({
          code: 'texture_size_mismatch',
          message: args.messages.textureSizeMismatch(tex.name, tex.width, tex.height, width, height),
          severity: 'warning'
        });
      }
    });
  }

  return findings;
};
