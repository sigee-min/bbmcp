import type { ProjectTreeNode, ProjectTreeSnapshot } from '../../../lib/dashboardModel';

export type DragEntity =
  | {
      kind: 'folder' | 'project';
      id: string;
    }
  | null;

export interface TreeInsertionTarget {
  rowKey: string | null;
  position: 'before' | 'inside' | 'after' | 'root-end';
  parentFolderId: string | null;
  index: number;
}

interface TreeNodeMeta {
  parentFolderId: string | null;
  index: number;
}

export interface TreeLookup {
  projectMeta: Map<string, TreeNodeMeta>;
  folderMeta: Map<string, TreeNodeMeta>;
  folderChildCount: Map<string, number>;
}

export const toTreeLookup = (tree: ProjectTreeSnapshot): TreeLookup => {
  const projectMeta = new Map<string, TreeNodeMeta>();
  const folderMeta = new Map<string, TreeNodeMeta>();
  const folderChildCount = new Map<string, number>();

  const walk = (nodes: readonly ProjectTreeNode[], parentFolderId: string | null) => {
    nodes.forEach((node, index) => {
      if (node.kind === 'project') {
        projectMeta.set(node.projectId, { parentFolderId, index });
        return;
      }
      folderMeta.set(node.folderId, { parentFolderId, index });
      folderChildCount.set(node.folderId, node.children.length);
      walk(node.children, node.folderId);
    });
  };

  walk(tree.roots, null);
  return { projectMeta, folderMeta, folderChildCount };
};

export const collectFolderIds = (nodes: readonly ProjectTreeNode[], output: Set<string>): void => {
  for (const node of nodes) {
    if (node.kind !== 'folder') {
      continue;
    }
    output.add(node.folderId);
    collectFolderIds(node.children, output);
  }
};

export const resolveInsertionTarget = (
  treeLookup: TreeLookup,
  kind: 'folder' | 'project',
  id: string,
  clientY: number,
  rowElement: HTMLDivElement
): TreeInsertionTarget | null => {
  const rect = rowElement.getBoundingClientRect();
  if (kind === 'folder') {
    const nodeMeta = treeLookup.folderMeta.get(id);
    if (!nodeMeta) {
      return null;
    }
    const topThreshold = rect.top + rect.height * 0.28;
    const bottomThreshold = rect.bottom - rect.height * 0.28;
    if (clientY < topThreshold) {
      return {
        rowKey: `folder:${id}`,
        position: 'before',
        parentFolderId: nodeMeta.parentFolderId,
        index: nodeMeta.index
      };
    }
    if (clientY > bottomThreshold) {
      return {
        rowKey: `folder:${id}`,
        position: 'after',
        parentFolderId: nodeMeta.parentFolderId,
        index: nodeMeta.index + 1
      };
    }
    return {
      rowKey: `folder:${id}`,
      position: 'inside',
      parentFolderId: id,
      index: treeLookup.folderChildCount.get(id) ?? 0
    };
  }

  const nodeMeta = treeLookup.projectMeta.get(id);
  if (!nodeMeta) {
    return null;
  }
  const position: 'before' | 'after' = clientY < rect.top + rect.height / 2 ? 'before' : 'after';
  return {
    rowKey: `${kind}:${id}`,
    position,
    parentFolderId: nodeMeta.parentFolderId,
    index: position === 'before' ? nodeMeta.index : nodeMeta.index + 1
  };
};

export const isSameInsertionTarget = (
  current: TreeInsertionTarget | null,
  next: TreeInsertionTarget | null
): boolean => {
  if (!current || !next) {
    return current === next;
  }
  return (
    current.rowKey === next.rowKey &&
    current.position === next.position &&
    current.parentFolderId === next.parentFolderId &&
    current.index === next.index
  );
};
