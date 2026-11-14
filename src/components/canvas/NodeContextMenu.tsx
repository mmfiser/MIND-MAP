import {
  CircleCheck,
  CircleDot,
  Crosshair,
  CornerDownRight,
  Flag,
  FolderPlus,
  GitFork,
  ListPlus,
  MoveRight,
  RotateCcw,
  StickyNote,
  Trash2,
  Unlink,
} from 'lucide-react';
import { useCallback } from 'react';
import {
  addChildTo,
  addSiblingTo,
  createProject,
  deleteWithConfirm,
  detachFrom,
  setPriorityOf,
  setStatusOf,
  toggleDone,
} from '../../app/actions';
import { PRIORITY_META, PRIORITY_ORDER, STATUS_META, STATUS_ORDER } from '../common/statusMeta';
import { parentEdges } from '../../model/graph';
import { useDocStore } from '../../store/docStore';
import { useUiStore } from '../../store/uiStore';
import { Menu, type MenuEntry } from '../common/Menu';

const I = 17;

/** Akce uzlu – sdílené kontextovou nabídkou a detailem. `at` = místo pro podnabídku. */
export function nodeMenuEntries(nodeId: string, at?: { x: number; y: number }): MenuEntry[] {
  const doc = useDocStore.getState().doc;
  const ui = useUiStore.getState();
  if (!doc?.nodes[nodeId]) return [];
  const parents = parentEdges(doc, nodeId);
  const node = doc.nodes[nodeId]!;
  const pos = at ?? { x: window.innerWidth / 2 - 110, y: window.innerHeight / 3 };
  const entries: MenuEntry[] = [
    node.status === 'done'
      ? { key: 'reopen', label: 'Znovu otevřít', icon: <RotateCcw size={I} />, onSelect: () => toggleDone(nodeId) }
      : { key: 'done', label: 'Hotovo', icon: <CircleCheck size={I} />, onSelect: () => toggleDone(nodeId) },
    {
      key: 'status',
      label: `Stav: ${STATUS_META[node.status].label}…`,
      icon: <CircleDot size={I} />,
      onSelect: () => ui.set({ subMenu: { ...pos, nodeId, kind: 'status' } }),
    },
    {
      key: 'priority',
      label: `Priorita: ${PRIORITY_META[node.priority].label}…`,
      icon: <Flag size={I} />,
      onSelect: () => ui.set({ subMenu: { ...pos, nodeId, kind: 'priority' } }),
    },
    'sep',
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

function SubMenu() {
  const sub = useUiStore((s) => s.subMenu);
  const node = useDocStore((s) => (sub ? s.doc?.nodes[sub.nodeId] : undefined));
  const close = useCallback(() => useUiStore.getState().set({ subMenu: null }), []);
  if (!sub || !node) return null;
  const entries: MenuEntry[] =
    sub.kind === 'status'
      ? [
          { title: 'Stav' },
          ...STATUS_ORDER.map((st) => {
            const m = STATUS_META[st];
            return {
              key: st,
              label: node.status === st ? `${m.label} ✓` : m.label,
              icon: <m.Icon size={I} />,
              onSelect: () => setStatusOf(sub.nodeId, st),
            };
          }),
        ]
      : [
          { title: 'Priorita' },
          ...PRIORITY_ORDER.map((p) => ({
            key: p,
            label: node.priority === p ? `${PRIORITY_META[p].label} ✓` : PRIORITY_META[p].label,
            icon: <span className="prio-dot" style={{ background: PRIORITY_META[p].color }} />,
            onSelect: () => setPriorityOf(sub.nodeId, p),
          })),
        ];
  return <Menu x={sub.x} y={sub.y} entries={entries} onClose={close} />;
}

export function NodeContextMenu() {
  const menu = useUiStore((s) => s.contextMenu);
  const close = useCallback(() => useUiStore.getState().set({ contextMenu: null }), []);
  if (!menu) return <SubMenu />;
  let entries: MenuEntry[];
  if (menu.nodeId) {
    const title = useDocStore.getState().doc?.nodes[menu.nodeId]?.title.trim() || 'Bez názvu';
    entries = [{ title }, ...nodeMenuEntries(menu.nodeId, { x: menu.x, y: menu.y })];
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
