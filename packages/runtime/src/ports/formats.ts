export type FormatDescriptor = {
  id: string;
  name?: string;
  singleTexture?: boolean;
  perTextureUvSize?: boolean;
  boxUv?: boolean;
  optionalBoxUv?: boolean;
  uvRotation?: boolean;
  animationMode?: boolean;
  boneRig?: boolean;
  armatureRig?: boolean;
  meshes?: boolean;
  imageEditor?: boolean;
};

export interface FormatPort {
  listFormats: () => FormatDescriptor[];
  getActiveFormatId: () => string | null;
}


