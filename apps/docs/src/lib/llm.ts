export type DocIntent =
  | 'task-guide'
  | 'tool-reference'
  | 'troubleshooting'
  | 'specification'
  | 'contributor'
  | 'overview';

export const docIntentOrder: DocIntent[] = [
  'task-guide',
  'tool-reference',
  'troubleshooting',
  'specification',
  'contributor',
  'overview',
];

export const docIntentLabels: Record<DocIntent, string> = {
  'task-guide': 'Task Guides',
  'tool-reference': 'Tool Reference',
  troubleshooting: 'Troubleshooting',
  specification: 'Specifications',
  contributor: 'Contributor Docs',
  overview: 'Overview',
};

export function inferDocIntent(slugs: string[]): DocIntent {
  if (slugs.includes('tool-reference')) return 'tool-reference';
  if (slugs.includes('tasks') || slugs.includes('guides')) return 'task-guide';
  if (slugs.includes('troubleshooting')) return 'troubleshooting';
  if (slugs.includes('mcp-spec') || slugs.includes('normative') || slugs.includes('examples')) {
    return 'specification';
  }
  if (slugs[0] === 'contributors') return 'contributor';
  return 'overview';
}
