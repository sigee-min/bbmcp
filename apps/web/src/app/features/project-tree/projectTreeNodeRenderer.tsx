import {
  ChevronDown,
  ChevronRight,
  FilePlus2,
  Folder,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Trash2
} from 'lucide-react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import type { ProjectLeafTreeNode, ProjectTreeNode, StreamStatus } from '../../../lib/dashboardModel';
import { cn } from '../../../lib/utils';
import styles from '../../page.module.css';
import {
  type DragEntity,
  type TreeInsertionTarget,
  isSameInsertionTarget
} from './projectTreeDnd';

export type TreeMenuState =
  | {
      kind: 'folder' | 'project';
      id: string;
    }
  | null;

interface TreeNodeRenderContext {
  selectedProjectId: string | null;
  streamStatus: StreamStatus;
  mutationBusy: boolean;
  collapsedFolders: Record<string, boolean>;
  setCollapsedFolders: Dispatch<SetStateAction<Record<string, boolean>>>;
  dropInsertion: TreeInsertionTarget | null;
  setDropInsertion: Dispatch<SetStateAction<TreeInsertionTarget | null>>;
  openTreeMenu: TreeMenuState;
  setOpenTreeMenu: Dispatch<SetStateAction<TreeMenuState>>;
  dragEntityRef: MutableRefObject<DragEntity>;
  resolveInsertionTarget: (
    kind: 'folder' | 'project',
    id: string,
    clientY: number,
    rowElement: HTMLDivElement
  ) => TreeInsertionTarget | null;
  applyDropInsertion: (target: TreeInsertionTarget | null) => Promise<void>;
  resetDragState: () => void;
  onSelectProject: (projectId: string) => void;
  onCreateFolder: (parentFolderId: string | null) => Promise<void>;
  onCreateProject: (parentFolderId: string | null) => Promise<void>;
  onRenameFolder: (folderId: string, currentName: string) => Promise<void>;
  onRenameProject: (projectId: string, currentName: string) => Promise<void>;
  onDeleteFolder: (folderId: string, currentName: string) => Promise<void>;
  onDeleteProject: (projectId: string, currentName: string) => Promise<void>;
}

const projectStatusTone = (
  node: ProjectLeafTreeNode
): 'idle' | 'sync' | 'busy' | 'error' => {
  if (node.activeJobStatus === 'failed') {
    return 'error';
  }
  if (node.lockState === 'locked-by-other') {
    return 'sync';
  }
  if (node.lockState === 'locked-by-self') {
    if (node.activeJobStatus === 'queued') {
      return 'sync';
    }
    return 'busy';
  }
  if (node.activeJobStatus === 'running') {
    return 'busy';
  }
  if (node.activeJobStatus === 'queued') {
    return 'sync';
  }
  return 'idle';
};

export const renderProjectTreeNode = (node: ProjectTreeNode, context: TreeNodeRenderContext): JSX.Element => {
  if (node.kind === 'folder') {
    const isCollapsed = Boolean(context.collapsedFolders[node.folderId]);
    const folderRowKey = `folder:${node.folderId}`;
    const isInsertBefore = context.dropInsertion?.rowKey === folderRowKey && context.dropInsertion.position === 'before';
    const isInsertInside = context.dropInsertion?.rowKey === folderRowKey && context.dropInsertion.position === 'inside';
    const isInsertAfter = context.dropInsertion?.rowKey === folderRowKey && context.dropInsertion.position === 'after';
    const folderMenuOpen = context.openTreeMenu?.kind === 'folder' && context.openTreeMenu.id === node.folderId;

    return (
      <div key={node.folderId} className={styles.treeNodeWrap}>
        <div
          className={cn(
            styles.treeRow,
            styles.treeFolderRow,
            isInsertBefore && styles.treeRowInsertBefore,
            isInsertInside && styles.treeRowInsertInside,
            isInsertAfter && styles.treeRowInsertAfter
          )}
          style={{ paddingInlineStart: `${0.3 + (node.depth - 1) * 0.72}rem` }}
          draggable={!context.mutationBusy}
          onDragStart={(event) => {
            context.dragEntityRef.current = { kind: 'folder', id: node.folderId };
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', `folder:${node.folderId}`);
          }}
          onDragEnd={context.resetDragState}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const nextTarget = context.resolveInsertionTarget('folder', node.folderId, event.clientY, event.currentTarget);
            if (!nextTarget) {
              return;
            }
            context.setDropInsertion((prev) => (isSameInsertionTarget(prev, nextTarget) ? prev : nextTarget));
          }}
          onDragLeave={(event) => {
            const nextTarget = event.relatedTarget as Node | null;
            if (nextTarget && event.currentTarget.contains(nextTarget)) {
              return;
            }
            context.setDropInsertion((prev) => (prev?.rowKey === folderRowKey ? null : prev));
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const target = context.resolveInsertionTarget('folder', node.folderId, event.clientY, event.currentTarget);
            void context.applyDropInsertion(target);
          }}
        >
          <button
            type="button"
            className={styles.treeToggleButton}
            aria-label={isCollapsed ? `${node.name} 폴더 펼치기` : `${node.name} 폴더 접기`}
            onClick={() => {
              context.setCollapsedFolders((prev) => ({
                ...prev,
                [node.folderId]: !prev[node.folderId]
              }));
            }}
          >
            {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          <div className={styles.treeMainLabel}>
            {isCollapsed ? <Folder className={styles.treeFolderIcon} /> : <FolderOpen className={styles.treeFolderIcon} />}
            <span className={styles.treeItemName}>{node.name}</span>
          </div>

          <div className={styles.treeRowActions}>
            <div data-tree-menu-root="true" className={styles.treeMenuRoot}>
              <button
                type="button"
                className={styles.treeMenuButton}
                aria-label={`${node.name} 폴더 메뉴`}
                aria-haspopup="menu"
                aria-expanded={folderMenuOpen}
                title="액션 메뉴"
                disabled={context.mutationBusy}
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  context.setOpenTreeMenu((prev) =>
                    prev?.kind === 'folder' && prev.id === node.folderId ? null : { kind: 'folder', id: node.folderId }
                  );
                }}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
              {folderMenuOpen ? (
                <div role="menu" aria-label={`${node.name} 폴더 액션`} className={styles.treeMenuList}>
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.treeMenuItem}
                    onClick={() => {
                      context.setOpenTreeMenu(null);
                      void context.onCreateFolder(node.folderId);
                    }}
                    disabled={context.mutationBusy}
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                    <span>하위 폴더 생성</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.treeMenuItem}
                    onClick={() => {
                      context.setOpenTreeMenu(null);
                      void context.onCreateProject(node.folderId);
                    }}
                    disabled={context.mutationBusy}
                  >
                    <FilePlus2 className="h-3.5 w-3.5" />
                    <span>프로젝트 생성</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.treeMenuItem}
                    onClick={() => {
                      context.setOpenTreeMenu(null);
                      void context.onRenameFolder(node.folderId, node.name);
                    }}
                    disabled={context.mutationBusy}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    <span>이름 변경</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={cn(styles.treeMenuItem, styles.treeMenuItemDanger)}
                    onClick={() => {
                      context.setOpenTreeMenu(null);
                      void context.onDeleteFolder(node.folderId, node.name);
                    }}
                    disabled={context.mutationBusy}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>폴더 삭제</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {!isCollapsed ? node.children.map((child) => renderProjectTreeNode(child, context)) : null}
      </div>
    );
  }

  const selected = context.selectedProjectId === node.projectId;
  const tone = projectStatusTone(node);
  const toneClass =
    tone === 'busy'
      ? styles.treeStatusBusy
      : tone === 'sync'
        ? styles.treeStatusSync
        : tone === 'error'
          ? styles.treeStatusError
          : styles.treeStatusIdle;

  const projectRowKey = `project:${node.projectId}`;
  const isInsertBefore = context.dropInsertion?.rowKey === projectRowKey && context.dropInsertion.position === 'before';
  const isInsertAfter = context.dropInsertion?.rowKey === projectRowKey && context.dropInsertion.position === 'after';
  const projectMenuOpen = context.openTreeMenu?.kind === 'project' && context.openTreeMenu.id === node.projectId;

  return (
    <div
      key={node.projectId}
      className={cn(
        styles.treeRow,
        styles.treeProjectRow,
        selected && styles.treeProjectRowActive,
        isInsertBefore && styles.treeRowInsertBefore,
        isInsertAfter && styles.treeRowInsertAfter
      )}
      style={{ paddingInlineStart: `${0.3 + (node.depth - 1) * 0.72}rem` }}
      draggable={!context.mutationBusy}
      onDragStart={(event) => {
        context.dragEntityRef.current = { kind: 'project', id: node.projectId };
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', `project:${node.projectId}`);
      }}
      onDragEnd={context.resetDragState}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const nextTarget = context.resolveInsertionTarget('project', node.projectId, event.clientY, event.currentTarget);
        if (!nextTarget) {
          return;
        }
        context.setDropInsertion((prev) => (isSameInsertionTarget(prev, nextTarget) ? prev : nextTarget));
      }}
      onDragLeave={(event) => {
        const nextTarget = event.relatedTarget as Node | null;
        if (nextTarget && event.currentTarget.contains(nextTarget)) {
          return;
        }
        context.setDropInsertion((prev) => (prev?.rowKey === projectRowKey ? null : prev));
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const target = context.resolveInsertionTarget('project', node.projectId, event.clientY, event.currentTarget);
        void context.applyDropInsertion(target);
      }}
    >
      <button
        type="button"
        className={styles.treeProjectButton}
        onClick={() => context.onSelectProject(node.projectId)}
        aria-pressed={selected}
        disabled={context.mutationBusy}
      >
        <span className={cn(styles.treeStatusDot, toneClass)} aria-hidden="true" />
        <span className={styles.treeItemName}>{node.name}</span>
      </button>

      <div className={styles.treeRowActions}>
        <div data-tree-menu-root="true" className={styles.treeMenuRoot}>
          <button
            type="button"
            className={styles.treeMenuButton}
            aria-label={`${node.name} 프로젝트 메뉴`}
            aria-haspopup="menu"
            aria-expanded={projectMenuOpen}
            title="액션 메뉴"
            disabled={context.mutationBusy}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
              context.setOpenTreeMenu((prev) =>
                prev?.kind === 'project' && prev.id === node.projectId ? null : { kind: 'project', id: node.projectId }
              );
            }}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          {projectMenuOpen ? (
            <div role="menu" aria-label={`${node.name} 프로젝트 액션`} className={styles.treeMenuList}>
              <button
                type="button"
                role="menuitem"
                className={styles.treeMenuItem}
                onClick={() => {
                  context.setOpenTreeMenu(null);
                  void context.onRenameProject(node.projectId, node.name);
                }}
                disabled={context.mutationBusy}
              >
                <Pencil className="h-3.5 w-3.5" />
                <span>이름 변경</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className={cn(styles.treeMenuItem, styles.treeMenuItemDanger)}
                onClick={() => {
                  context.setOpenTreeMenu(null);
                  void context.onDeleteProject(node.projectId, node.name);
                }}
                disabled={context.mutationBusy}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>프로젝트 삭제</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
