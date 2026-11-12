import { Crosshair, CornerDownRight, FolderPlus, GitFork, ListPlus, MoveRight, StickyNote, Trash2, Unlink } from 'lucide-react';
import { useCallback } from 'react';
import { addChildTo, addSiblingTo, createProject, deleteWithConfirm, detachFrom } from '../../app/actions';
import { parentEdges } from '../../model/graph';
import { useDocStore } from '../../store/docStore';
import { useUiStore } from '../../store/uiStore';
import { Menu, type MenuEntry } from '../common/Menu';

const I = 17;

/** Akce uzlu – sdílené kontextovou nabídkou a detailem. */
export function nodeMenuEntries(nodeId: string): MenuEntry[] {
  const doc = useDocStore.getState().doc;
  const ui = useUiStore.getState();
  if (!doc?.nodes[nodeId]) return [];
  const parents = parentEdges(doc, nodeId);
  const entries: MenuEntry[] = [
    { key: 'child', label: 'Přidat podúkol', icon: <CornerDownRight size={I} />, kbd: 'Tab', onSelect: () => addChildTo(nodeId) },
    { key: 'sib', label: 'Přidat sourozence', icon: <ListPlus size={I} />, kbd: 'Enter', onSelect: () => addSiblingTo(nodeId) },
    { key: 'notes', label: 'Poznámky', icon: <StickyNote size={I} />, onSelect: () => ui.set({ notesFor: nodeId }) },
    'sep',
    {
      key: 'move',
      label: 'Přesunout pod…',
      icon: <MoveRight size={I} />,
      onSelect: () => ui.set({ picker: { mode: 'move', nodeId, fromParentId: parents[0]?.source ?? null } }),
    },
    {
      key: 'addParent',
      label: 'Přidat dalšího rodiče…',
      icon: <GitFork size={I} />,
      onSelect: () => ui.set({ picker: { mode: 'addParent', nodeId, fromParentId: null } }),
    },
  ];
  for (const p of parents) {
    const name = doc.nodes[p.source]?.title.trim() || 'bez názvu';
    entries.push({
      key: `detach-${p.id}`,
      label: parents.length > 1 ? `Odpojit od „${name}“` : 'Odpojit od rodiče',
      icon: <Unlink size={I} />,
      onSelect: () => detachFrom(nodeId, p.source),
    });
  }
  entries.push(
    'sep',
    { key: 'focus', label: 'Vystředit', icon: <Crosshair size={I} />, kbd: 'F', onSelect: () => ui.focusNode(nodeId) },
    { key: 'del', label: 'Smazat…', icon: <Trash2 size={I} />, kbd: 'Del', danger: true, onSelect: () => void deleteWithConfirm(nodeId) },
  );
  return entries;
}

export function NodeContextMenu() {
  const menu = useUiStore((s) => s.contextMenu);
  const close = useCallback(() => useUiStore.getState().set({ contextMenu: null }), []);
  if (!menu) return null;
  let entries: MenuEntry[];
  if (menu.nodeId) {
    const title = useDocStore.getState().doc?.nodes[menu.nodeId]?.title.trim() || 'Bez názvu';
    entries = [{ title }, ...nodeMenuEntries(menu.nodeId)];
  } else {
    entries = [
      {
        key: 'newProject',
        label: 'Nový projekt zde',
        icon: <FolderPlus size={I} />,
        onSelect: () => createProject(menu.flowPos),
      },
    ];
  }
  return <Menu x={menu.x} y={menu.y} entries={entries} onClose={close} />;
}
