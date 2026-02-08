export type ResourceDescriptor = {
  uri: string;
  name?: string;
  mimeType?: string;
  description?: string;
};

export type ResourceContent = {
  uri: string;
  mimeType: string;
  text: string;
  name?: string;
  description?: string;
};

export type ResourceTemplate = {
  uriTemplate: string;
  name?: string;
  mimeType?: string;
  description?: string;
};

export interface ResourceStore {
  list: () => ResourceDescriptor[];
  read: (uri: string) => ResourceContent | null;
  listTemplates: () => ResourceTemplate[];
  has: (uri: string) => boolean;
  put: (resource: ResourceContent) => void;
}


