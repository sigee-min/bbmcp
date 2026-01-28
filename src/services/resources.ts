import { ResourceContent, ResourceDescriptor, ResourceStore, ResourceTemplate } from '../ports/resources';

export class InMemoryResourceStore implements ResourceStore {
  private readonly entries = new Map<string, ResourceContent>();
  private readonly templates: ResourceTemplate[];

  constructor(templates: ResourceTemplate[] = []) {
    this.templates = templates;
  }

  list(): ResourceDescriptor[] {
    return Array.from(this.entries.values()).map((entry) => ({
      uri: entry.uri,
      name: entry.name,
      mimeType: entry.mimeType,
      description: entry.description
    }));
  }

  read(uri: string): ResourceContent | null {
    return this.entries.get(uri) ?? null;
  }

  listTemplates(): ResourceTemplate[] {
    return [...this.templates];
  }

  has(uri: string): boolean {
    return this.entries.has(uri);
  }

  put(resource: ResourceContent): void {
    this.entries.set(resource.uri, resource);
  }
}

export type ResourceStoreViewFilter = {
  allowResourceUri?: (uri: string) => boolean;
  allowTemplateUri?: (uriTemplate: string) => boolean;
};

export const createResourceStoreView = (
  store: ResourceStore,
  filter: ResourceStoreViewFilter
): ResourceStore => ({
  list: () => {
    const allow = filter.allowResourceUri;
    if (!allow) return store.list();
    return store.list().filter((entry) => allow(entry.uri));
  },
  read: (uri: string) => {
    if (filter.allowResourceUri && !filter.allowResourceUri(uri)) return null;
    return store.read(uri);
  },
  listTemplates: () => {
    const allow = filter.allowTemplateUri;
    if (!allow) return store.listTemplates();
    return store.listTemplates().filter((template) => allow(template.uriTemplate));
  },
  has: (uri: string) => store.has(uri),
  put: (resource: ResourceContent) => store.put(resource)
});
