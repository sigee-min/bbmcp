import { ResourceContent, ResourceDescriptor, ResourceStore, ResourceTemplate } from '../../ports/resources';

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



