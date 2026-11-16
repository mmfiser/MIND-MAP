/**
 * Uživatelské akce nad uzly – sdílené lištou, kontextovou nabídkou,
 * zkratkami, rejstříkem i detailem. Logiku dělají čisté funkce v model/.
 */
import { DEFAULT_PROJECT_COLOR, PROJECT_PALETTE } from '../model/labels';
import { createNode } from '../model/factory';
import { buildHierarchyIndex, childEdges, parentEdges } from '../model/graph';
import { formatShort, formatWithWeekday, isValidYmd } from '../model/dates';
import { dueBeforeStart } from '../model/deadline';
import { activeBlockers, listNames } from '../model/blocking';
import { newConflictMessage } from './linkActions';
import * as H from '../model/hierarchy';
import { nonWorkingReason, toLastWorkingDayOnOrBefore } from '../model/holidays';
import { normalizeTag } from '../model/tags';
import * as T from '../model/trash';
import type { ChecklistItem, DocData, MapNode, NodeType, OpResult, Position, Priority, Status } from '../model/types';
import { newId } from '../model/factory';
import { useDocStore, type ApplyOptions } from '../store/docStore';
import { choose, confirmDialog, toast, useUiStore } from '../store/uiStore';

export const GRID = 10;
export const NODE_SIZE: Record<NodeType, { w: number; h: number }> = {
  project: { w: 260, h: 110 },
  task: { w: 190, h: 64 },
  milestone: { w: 160, h: 44 },
};

/** Pomocník pro plochu – nastavuje Canvas (střed viditelné oblasti v souřadnicích plochy). */
export const canvasApi: { viewCenter: () => Position } = {
  viewCenter: () => ({ x: 0, y: 0 }),
};

const snap = (v: number) => Math.round(v / GRID) * GRID;
const snapPos = (p: Position): Position => ({ x: snap(p.x), y: snap(p.y) });

/** Posune pozici dolů, dokud se nový uzel nepřekrývá s existujícím (přibližné rozměry). */
function freeSpot(d: DocData, pos: Position, type: NodeType): Position {
  const { w, h } = NODE_SIZE[type];
  const gap = 12;
  const boxes = Object.values(d.nodes)
    .filter((n) => !n.deletedAt)
    .map((n) => ({ x: n.position.x, y: n.position.y, w: NODE_SIZE[n.type].w, h: NODE_SIZE[n.type].h }));
  const p = { ...pos };
  for (let i = 0; i < 200; i++) {
    const hit = boxes.find(
      (b) => p.x < b.x + b.w + gap && p.x + w + gap > b.x && p.y < b.y + b.h + gap && p.y + h + gap > b.y,
    );
    if (!hit) break;
    p.y = hit.y + hit.h + gap + 4;
  }
  return snapPos(p);
}

export function run(op: (d: DocData) => OpResult | DocData, opts?: ApplyOptions): boolean {
  const r = useDocStore.getState().apply(op, opts);
  if (!r.ok) {
    toast(r.reason, 'error');
    return false;
  }
  return true;
}

export function data(): DocData | null {
  const d = useDocStore.getState().doc;
  return d ? { nodes: d.nodes, edges: d.edges } : null;
}

function afterCreate(id: string): void {
  const ui = useUiStore.getState();
  ui.select(id, true);
  ui.set({ editTitleRequest: Date.now() });
  ui.focusNode(id);
}

/** Barva pro nový projekt – první z palety, kterou ještě žádný projekt nepoužívá. */
function nextProjectColor(d: DocData): string {
  const used = new Set(Object.values(d.nodes).filter((n) => n.type === 'project').map((n) => n.color));
  return PROJECT_PALETTE.find((c) => !used.has(c.key))?.key ?? DEFAULT_PROJECT_COLOR;
}

export function createProject(at?: Position): void {
  const d = data();
  if (!d) return;
  const c = at ?? canvasApi.viewCenter();
  const size = NODE_SIZE.project;
  const node = createNode({
    type: 'project',
    position: freeSpot(d, { x: c.x - size.w / 2, y: c.y - size.h / 2 }, 'project'),
    color: nextProjectColor(d),
  });
  if (run((x) => H.addNode(x, node))) afterCreate(node.id);
}

function childPosition(d: DocData, parentId: string): Position {
  const parent = d.nodes[parentId]!;
  const ps = NODE_SIZE[parent.type];
  const kids = childEdges(d, parentId)
    .map((e) => d.nodes[e.target])
    .filter((n): n is MapNode => !!n);
  const x = parent.position.x + ps.w + 70;
  if (!kids.length) return snapPos({ x, y: parent.position.y + (ps.h - NODE_SIZE.task.h) / 2 });
  const lowest = Math.max(...kids.map((k) => k.position.y + NODE_SIZE[k.type].h));
  const left = Math.min(...kids.map((k) => k.position.x));
  return snapPos({ x: left, y: lowest + 16 });
}

export function addChildTo(parentId: string | null): void {
  const d = data();
  if (!d || !parentId || !d.nodes[parentId]) {
    toast('Nejdřív vyberte uzel.', 'info');
    return;
  }
  const node = createNode({ type: 'task', position: freeSpot(d, childPosition(d, parentId), 'task') });
  if (run((x) => H.addChild(x, parentId, node))) afterCreate(node.id);
}

export function addSiblingTo(nodeId: string | null): void {
  const d = data();
  if (!d || !nodeId || !d.nodes[nodeId]) {
    toast('Nejdřív vyberte uzel.', 'info');
    return;
  }
  const n = d.nodes[nodeId];
  const parent = parentEdges(d, nodeId)[0];
  let node: MapNode;
  if (parent) {
    const kids = childEdges(d, parent.source)
      .map((e) => d.nodes[e.target])
      .filter((k): k is MapNode => !!k);
    const lowest = Math.max(...kids.map((k) => k.position.y + NODE_SIZE[k.type].h));
    node = createNode({ type: 'task', position: freeSpot(d, { x: n.position.x, y: lowest + 16 }, 'task') });
  } else {
    // Volný uzel / projekt: sourozenec stejného typu pod ním.
    const type: NodeType = n.type === 'project' ? 'project' : 'task';
    node = createNode({
      type,
      position: freeSpot(d, { x: n.position.x, y: n.position.y + NODE_SIZE[n.type].h + 120 }, type),
      color: type === 'project' ? nextProjectColor(d) : undefined,
    });
  }
  if (run((x) => H.addSibling(x, nodeId, node))) afterCreate(node.id);
}

export async function deleteWithConfirm(nodeId: string | null): Promise<void> {
  const d = data();
  if (!d || !nodeId || !d.nodes[nodeId]) {
    toast('Nejdřív vyberte uzel.', 'info');
    return;
  }
  const n = d.nodes[nodeId];
  const branch = H.branchNodesToDelete(d, nodeId);
  const others = branch.size - 1;
  const name = n.title.trim() || 'bez názvu';
  const msg =
    others > 0
      ? `Do koše se přesune „${name}“ a ${others} ${others === 1 ? 'podřízený uzel' : others < 5 ? 'podřízené uzly' : 'podřízených uzlů'}. Sdílené uzly, které mají rodiče i jinde, zůstanou.`
      : `Do koše se přesune „${name}“.`;
  const ok = await confirmDialog(
    'Přesunout do koše?',
    `${msg} Položky půjde obnovit z Koše nebo tlačítkem Zpět.`,
    'Přesunout do koše',
    true,
  );
  if (!ok) return;
  if (run((x) => T.trashBranch(x, nodeId))) {
    const ui = useUiStore.getState();
    if (ui.selectedId && branch.has(ui.selectedId)) ui.select(null);
  }
}

/**
 * Přesune uzel s větví pod nového rodiče. Pokud se uzel připojuje nově
 * (byl volný nebo se přesouvá od jiného rodiče), větev se posune vedle cíle.
 */
export function moveUnder(nodeId: string, fromParentId: string | null, toParentId: string): boolean {
  const d = data();
  if (!d) return false;
  if (fromParentId === toParentId) return true;
  return run((x) => {
    const r = H.moveBranch(x, nodeId, fromParentId, toParentId);
    if (!r.ok) return r;
    // Pokud má uzel po přesunu jen nového rodiče, posuň větev k němu.
    const parents = parentEdges(r.data, nodeId);
    if (parents.length === 1 && parents[0]!.source === toParentId) {
      const target = childPositionExcluding(r.data, toParentId, nodeId);
      const n = r.data.nodes[nodeId]!;
      return { ok: true, data: H.translateBranch(r.data, nodeId, target.x - n.position.x, target.y - n.position.y) };
    }
    return r;
  });
}

function childPositionExcluding(d: DocData, parentId: string, excludeId: string): Position {
  const without: DocData = {
    nodes: d.nodes,
    edges: Object.fromEntries(
      Object.entries(d.edges).filter(([, e]) => !(e.source === parentId && e.target === excludeId)),
    ),
  };
  return childPosition(without, parentId);
}

export function addParentTo(childId: string, parentId: string): boolean {
  const ok = run((x) => H.addParent(x, childId, parentId));
  if (ok) toast('Uzel je teď sdílený.', 'success');
  return ok;
}

export function detachFrom(childId: string, parentId: string): void {
  const d = data();
  if (!d) return;
  const last = parentEdges(d, childId).length === 1;
  if (run((x) => H.detachFromParent(x, childId, parentId)) && last) {
    toast('Uzel zůstal volně na ploše.', 'info');
  }
}

export function updateNodeFields(
  id: string,
  patch: Partial<Omit<MapNode, 'id'>>,
  coalesceKey?: string,
): void {
  run((x) => H.updateNode(x, id, patch), coalesceKey ? { coalesceKey } : undefined);
}

export function setNodeType(id: string, type: NodeType): void {
  const d = data();
  const n = d?.nodes[id];
  if (!d || !n || n.type === type) return;
  if (type === 'milestone' && childEdges(d, id).length) {
    toast('Uzel má poduzly – milník nemůže mít poduzly. Nejdřív je přesuňte jinam.', 'error');
    return;
  }
  const patch: Partial<MapNode> = { type };
  if (type === 'project' && !n.color) patch.color = nextProjectColor(d);
  if (type === 'milestone') {
    patch.status = 'new';
    patch.priority = 'medium';
    patch.checklist = [];
    if (n.checklist.length) toast('Checklist se u milníku nepoužívá – byl odebrán (Zpět ho vrátí).', 'info');
  }
  run((x) => {
    const r = H.updateNode(x, id, patch);
    if (!r.ok || type !== 'milestone' || !r.data.nodes[id]!.startDate) return r;
    const { startDate: _s, ...rest } = r.data.nodes[id]!;
    return { ok: true, data: { nodes: { ...r.data.nodes, [id]: rest }, edges: r.data.edges } };
  });
}

export function commitPositions(positions: Record<string, Position>): void {
  run((x) => H.setPositions(x, positions));
}

/** Možní cíloví rodiče pro „Přesunout pod…“ / „Přidat rodiče“ + důvod, proč nelze. */
export function parentCandidates(
  nodeId: string,
  mode: 'move' | 'addParent',
  fromParentId: string | null,
): { node: MapNode; disabledReason?: string }[] {
  const d = data();
  if (!d) return [];
  const idx = buildHierarchyIndex(d);
  const current = new Set((idx.parents.get(nodeId) ?? []).map((e) => e.source));
  const fromEdge = fromParentId
    ? (idx.parents.get(nodeId) ?? []).find((e) => e.source === fromParentId)
    : undefined;
  return Object.values(d.nodes)
    .filter((n) => !n.deletedAt && n.id !== nodeId)
    .sort((a, b) => a.title.localeCompare(b.title, 'cs'))
    .map((node) => {
      let disabledReason: string | undefined;
      if (mode === 'addParent' && current.has(node.id)) disabledReason = 'už je rodičem';
      else if (mode === 'move' && node.id === fromParentId) disabledReason = 'současný rodič';
      else if (H.wouldCreateCycle(d, 'hierarchy', node.id, nodeId, fromEdge?.id))
        disabledReason = 'vznikl by cyklus';
      return { node, disabledReason };
    });
}

// ---------- Fáze 2: stav, priorita, data, ikona, štítky, checklist, koš ----------

export function setStatusOf(id: string, status: Status): void {
  const d = data();
  const n = d?.nodes[id];
  if (!d || !n) return;
  if (status === 'done' && n.status !== 'done') {
    const blockers = activeBlockers(d, id, useUiStore.getState().today);
    if (blockers.length) toast(`Úkol má nedokončené blokující úkoly: ${listNames(blockers, 4)}.`, 'info');
  }
  const ok = run((x) => H.setStatus(x, id, status));
  // Znovu otevřený uzel se znovu počítá do kolizí.
  const after = data();
  if (ok && after && (n.status === 'done' || n.status === 'cancelled') && status !== 'done' && status !== 'cancelled') {
    const msg = newConflictMessage(d, after, [id]);
    if (msg) toast(msg, 'info');
  }
}

/** Zaškrtnutí na mapě / tlačítka Hotovo – Znovu otevřít (vrací stav Probíhá). */
export function toggleDone(id: string): void {
  const n = data()?.nodes[id];
  if (!n) return;
  setStatusOf(id, n.status === 'done' ? 'in_progress' : 'done');
}

export function setPriorityOf(id: string, priority: Priority): void {
  const n = data()?.nodes[id];
  if (!n || n.priority === priority) return;
  run((x) => H.updateNode(x, id, { priority }));
}

/**
 * Nastaví datum. Termín dokončení / deadline na nepracovní den se posune
 * na poslední pracovní den před ním a uživatel dostane oznámení.
 */
export function setDateOf(id: string, field: 'startDate' | 'dueDate', value: string | null): void {
  const n = data()?.nodes[id];
  if (!n) return;
  const messages: string[] = [];
  let v: string | undefined = value && isValidYmd(value) ? value : undefined;
  if (v && field === 'dueDate') {
    const shifted = toLastWorkingDayOnOrBefore(v);
    if (shifted !== v) {
      const today = useUiStore.getState().today;
      messages.push(
        `Termín ${formatShort(v, today)} připadá na ${nonWorkingReason(v)}, posunut na ${formatWithWeekday(shifted, today)}`,
      );
      v = shifted;
    }
  }
  // Kontrola až po případném posunu – posun může konflikt vytvořit.
  const next = { startDate: field === 'startDate' ? v : n.startDate, dueDate: field === 'dueDate' ? v : n.dueDate };
  if (v && dueBeforeStart(next)) messages.push('Termín je dříve než začátek.');
  if (n[field] === v) {
    if (messages.length) toast(messages.join(' '), 'info');
    return;
  }
  const before = data()!;
  const ok = run((x) => {
    const r = H.updateNode(x, id, {});
    if (!r.ok) return r;
    const node = { ...r.data.nodes[id]! };
    if (v) node[field] = v;
    else delete node[field];
    return { ok: true, data: { nodes: { ...r.data.nodes, [id]: node }, edges: r.data.edges } };
  });
  const after = data();
  if (ok && after && field === 'dueDate') {
    const msg = newConflictMessage(before, after, [id]);
    if (msg) messages.push(msg);
  }
  if (messages.length) toast(messages.join(' '), 'info');
}

export function setIconOf(id: string, icon: string | null): void {
  run((x) => {
    const r = H.updateNode(x, id, {});
    if (!r.ok) return r;
    const node = { ...r.data.nodes[id]! };
    if (icon) node.icon = icon;
    else delete node.icon;
    return { ok: true, data: { nodes: { ...r.data.nodes, [id]: node }, edges: r.data.edges } };
  });
}

export function addTagTo(id: string, raw: string): void {
  const tag = normalizeTag(raw);
  const n = data()?.nodes[id];
  if (!tag || !n) return;
  if (n.tags.some((t) => t.toLocaleLowerCase('cs') === tag.toLocaleLowerCase('cs'))) return;
  run((x) => H.updateNode(x, id, { tags: [...n.tags, tag] }));
}

export function removeTagFrom(id: string, tag: string): void {
  const n = data()?.nodes[id];
  if (!n) return;
  run((x) => H.updateNode(x, id, { tags: n.tags.filter((t) => t !== tag) }));
}

function setChecklist(id: string, fn: (list: ChecklistItem[]) => ChecklistItem[], coalesceKey?: string): void {
  const n = data()?.nodes[id];
  if (!n) return;
  run((x) => H.updateNode(x, id, { checklist: fn(n.checklist) }), coalesceKey ? { coalesceKey } : undefined);
}

/** Přidá položku (za index `after`, jinak na konec) a vrátí její id. */
export function addChecklistItem(id: string, text = '', after?: number): string {
  const item: ChecklistItem = { id: newId(), text, done: false };
  setChecklist(id, (list) => {
    const at = after === undefined ? list.length : after + 1;
    return [...list.slice(0, at), item, ...list.slice(at)];
  });
  return item.id;
}

export function updateChecklistText(id: string, itemId: string, text: string): void {
  setChecklist(id, (list) => list.map((c) => (c.id === itemId ? { ...c, text } : c)), `check:${itemId}`);
}

export function toggleChecklistItem(id: string, itemId: string): void {
  setChecklist(id, (list) => list.map((c) => (c.id === itemId ? { ...c, done: !c.done } : c)));
}

export function removeChecklistItem(id: string, itemId: string): void {
  setChecklist(id, (list) => list.filter((c) => c.id !== itemId));
}

export function moveChecklistItem(id: string, from: number, to: number): void {
  if (from === to) return;
  setChecklist(id, (list) => {
    const next = [...list];
    const [it] = next.splice(from, 1);
    if (!it) return list;
    next.splice(Math.max(0, Math.min(to, next.length)), 0, it);
    return next;
  });
}

export async function restoreFromTrash(batchId: string): Promise<void> {
  let result: T.RestoreResult | null = null;
  const ok = run((x) => {
    const r = T.restoreBatch(x, batchId);
    if ('error' in r) return { ok: false, reason: r.error };
    result = r;
    return { ok: true, data: r.data };
  });
  const res = result as T.RestoreResult | null;
  if (!ok || !res) return;
  if (res.notices.length) {
    await choose({
      title: 'Obnoveno s upozorněním',
      message: res.notices.join(' '),
      options: [{ value: 'ok', label: 'Rozumím', variant: 'primary' }],
    });
  } else {
    toast('Obnoveno.', 'success');
  }
  if (res.rootId) {
    const ui = useUiStore.getState();
    ui.select(res.rootId, true);
    ui.focusNode(res.rootId);
  }
}

export async function purgeFromTrash(batchId: string, title: string): Promise<void> {
  const ok = await confirmDialog(
    'Smazat trvale?',
    `„${title.trim() || 'bez názvu'}“ se smaže trvale i se všemi vazbami. Z koše už nepůjde obnovit (jen tlačítkem Zpět v tomto sezení).`,
    'Smazat trvale',
    true,
  );
  if (ok && run((x) => T.purgeBatch(x, batchId))) toast('Trvale smazáno.', 'success');
}

export async function emptyTrashWithConfirm(): Promise<void> {
  const d = data();
  if (!d) return;
  const n = T.listTrash(d).length;
  if (!n) return;
  const ok = await confirmDialog(
    'Vysypat koš?',
    `Trvale se smaže ${n} ${n === 1 ? 'položka' : n < 5 ? 'položky' : 'položek'} i se všemi vazbami.`,
    'Vysypat koš',
    true,
  );
  if (ok && run((x) => T.emptyTrash(x))) toast('Koš je prázdný.', 'success');
}
