/**
 * Sbalování větví (fáze 3) – viditelnost uzlů a přesměrování vazeb.
 * Čisté funkce, O(uzly + vazby). Počítají se jen při změně dat (ne při posunu plochy).
 *
 * Viditelnost: kořeny (živé uzly bez rodiče) jsou vidět vždy. Potomek je vidět,
 * pokud má aspoň jednoho viditelného a rozbaleného rodiče – tj. existuje cesta
 * ke kořeni přes samé rozbalené předky. Sdílený uzel s jedním rodičem sbaleným
 * a druhým rozbaleným tedy zůstává vidět.
 */
import { buildHierarchyIndex, type HierarchyIndex } from './graph';
import type { DocData, EdgeKind, MapEdge } from './types';

export interface VisibilityInfo {
  visible: Set<string>;
  /** viditelný uzel se skrytými poduzly → počet uzlů, které jsou pod ním skryté */
  hiddenCount: Map<string, number>;
  /** uzel → má v hierarchii poduzly (lze sbalit) */
  hasChildren: Set<string>;
  /** viditelné uzly, jejichž poduzly skrývá jen úroveň detailu (ne ruční sbalení) */
  lodLimited: Set<string>;
  /** viditelný uzel → počet skrytých označených uzlů (shody filtru / hledání) pod ním */
  hiddenMarks: Map<string, number>;
  /** skrytý uzel → nejbližší viditelný předek po nejstarší rodičovské vazbě */
  rep: (id: string) => string;
}

export interface VisibilityOptions {
  /** Nejhlubší zobrazená úroveň (úroveň detailu podle zoomu); výchozí = vše. */
  maxDepth?: number;
  /**
   * Výjimky z úrovně detailu: uzel se zobrazí i s cestou ke kořeni (vybraný uzel,
   * kliknutý výsledek hledání, shody filtru). Ruční sbalení má přednost.
   */
  keep?: Iterable<string>;
  /** Označené uzly (shody filtru a hledání) – skryté se spočítají u viditelného předka. */
  marks?: Iterable<string>;
}

/**
 * Cesta výjimky ke kořeni, která nevede přes ručně sbalený uzel (hledání do
 * šířky nahoru, nejstarší rodiče první). null = uzel skrývá ruční sbalení.
 */
function keepPath(data: DocData, idx: HierarchyIndex, id: string): string[] | null {
  const prev = new Map<string, string | null>([[id, null]]);
  const queue = [id];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]!;
    const parents = idx.parents.get(cur) ?? [];
    if (!parents.length) {
      const path: string[] = [];
      let p: string | null | undefined = cur;
      while (p) {
        path.push(p);
        p = prev.get(p);
      }
      return path;
    }
    for (const e of parents) {
      if (prev.has(e.source) || data.nodes[e.source]!.collapsed) continue;
      prev.set(e.source, cur);
      queue.push(e.source);
    }
  }
  return null;
}

export function computeVisibility(data: DocData, index?: HierarchyIndex, opts: VisibilityOptions = {}): VisibilityInfo {
  const idx = index ?? buildHierarchyIndex(data);
  const maxDepth = opts.maxDepth ?? Infinity;
  const live = (id: string) => {
    const n = data.nodes[id];
    return !!n && !n.deletedAt;
  };

  // Výjimky z úrovně detailu (i s cestou), pokud je neskrývá ruční sbalení.
  const forced = new Set<string>();
  if (maxDepth !== Infinity) {
    for (const id of opts.keep ?? []) {
      if (!live(id) || forced.has(id)) continue;
      const path = keepPath(data, idx, id);
      if (path) for (const p of path) forced.add(p);
    }
  }

  const visible = new Set<string>();
  const depth = new Map<string, number>();
  const queue: string[] = [];
  for (const n of Object.values(data.nodes)) {
    if (n.deletedAt) continue;
    if (!idx.parents.has(n.id)) {
      visible.add(n.id);
      depth.set(n.id, 0);
      queue.push(n.id);
    }
  }
  const lodLimited = new Set<string>();
  // Do šířky: uzel dostane nejmenší hloubku přes rozbalené předky.
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    if (data.nodes[id]!.collapsed) continue;
    const d = depth.get(id)!;
    for (const e of idx.children.get(id) ?? []) {
      if (visible.has(e.target)) continue;
      if (d + 1 > maxDepth && !forced.has(e.target)) {
        lodLimited.add(id);
        continue;
      }
      visible.add(e.target);
      depth.set(e.target, d + 1);
      queue.push(e.target);
    }
  }
  for (const id of lodLimited) {
    // Má-li všechny poduzly přesto vidět (výjimky / jiný rodič), omezení se neukazuje.
    if ((idx.children.get(id) ?? []).every((e) => visible.has(e.target))) lodLimited.delete(id);
  }

  const hasChildren = new Set<string>();
  for (const [id, list] of idx.children) if (list.length) hasChildren.add(id);

  // Počet skrytých uzlů pod viditelným uzlem: projde jen skryté potomky
  // (viditelný sdílený potomek si svou větev „nese“ sám).
  const hiddenCount = new Map<string, number>();
  for (const id of visible) {
    if (!(data.nodes[id]!.collapsed && hasChildren.has(id)) && !lodLimited.has(id)) continue;
    const seen = new Set<string>();
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const e of idx.children.get(cur) ?? []) {
        const c = e.target;
        if (visible.has(c) || seen.has(c)) continue;
        seen.add(c);
        stack.push(c);
      }
    }
    hiddenCount.set(id, seen.size);
  }

  const repMemo = new Map<string, string>();
  const rep = (id: string): string => {
    if (visible.has(id)) return id;
    const known = repMemo.get(id);
    if (known) return known;
    // Iterativně nahoru po nejstarší rodičovské vazbě (hierarchie je bez cyklů).
    const chain: string[] = [];
    let cur = id;
    let result = id;
    for (;;) {
      const m = repMemo.get(cur);
      if (m) {
        result = m;
        break;
      }
      const parent = idx.parents.get(cur)?.[0]?.source;
      if (!parent) {
        result = cur; // nemělo by nastat – kořeny jsou viditelné
        break;
      }
      chain.push(cur);
      if (visible.has(parent)) {
        result = parent;
        break;
      }
      cur = parent;
    }
    for (const c of chain) repMemo.set(c, result);
    return result;
  };

  const hiddenMarks = new Map<string, number>();
  for (const id of opts.marks ?? []) {
    if (!live(id) || visible.has(id)) continue;
    const r = rep(id);
    hiddenMarks.set(r, (hiddenMarks.get(r) ?? 0) + 1);
  }

  return { visible, hiddenCount, hasChildren, lodLimited, hiddenMarks, rep };
}

export interface RoutedEdge {
  /** id vazby, nebo `m:<klíč>` u sloučených */
  id: string;
  kind: EdgeKind;
  /** viditelné konce */
  source: string;
  target: string;
  /** skutečné vazby, které čára představuje (nejstarší první) */
  edgeIds: string[];
  /** aspoň jeden konec vede do sbalené větve */
  redirected: boolean;
  /** kolmé odsazení oblouku (px), aby se souběžné čáry nepřekrývaly */
  bend: number;
}

const KIND_ORDER: Record<EdgeKind, number> = { hierarchy: 0, dependency: 1, related: 2 };
export const LANE_GAP = 22;

/**
 * Vazby k vykreslení. Konec ve sbalené větvi se přesměruje do nejbližšího
 * viditelného předka (u hierarchie přes rodiče dané vazby). Přesměrované vazby
 * stejného druhu mezi stejnou dvojicí se sloučí; vazba se stejným koncem na obou
 * stranách se nevykreslí. Souběžné čáry mezi dvojicí uzlů dostanou odsazení.
 */
export function routeEdges(data: DocData, vis: VisibilityInfo): RoutedEdge[] {
  const live = (id: string) => {
    const n = data.nodes[id];
    return !!n && !n.deletedAt;
  };
  const sorted = Object.values(data.edges)
    .filter((e) => live(e.source) && live(e.target))
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1));

  const out: RoutedEdge[] = [];
  const merged = new Map<string, RoutedEdge>();
  for (const e of sorted) {
    const s = vis.rep(e.source);
    // Hierarchie: skrytý potomek se ukáže ve větvi svého rodiče z této vazby.
    const t = vis.visible.has(e.target) ? e.target : e.kind === 'hierarchy' ? s : vis.rep(e.target);
    if (s === t) continue;
    if (s === e.source && t === e.target) {
      out.push({ id: e.id, kind: e.kind, source: s, target: t, edgeIds: [e.id], redirected: false, bend: 0 });
      continue;
    }
    const key = e.kind === 'related' ? `${e.kind}:${[s, t].sort().join('|')}` : `${e.kind}:${s}|${t}`;
    const m = merged.get(key);
    if (m) m.edgeIds.push(e.id);
    else {
      const r: RoutedEdge = { id: `m:${key}`, kind: e.kind, source: s, target: t, edgeIds: [e.id], redirected: true, bend: 0 };
      merged.set(key, r);
      out.push(r);
    }
  }
  for (const r of merged.values()) if (r.edgeIds.length === 1) r.id = r.edgeIds[0]!;

  // Odsazení souběžných čar mezi stejnou dvojicí (bez ohledu na směr).
  const pairs = new Map<string, RoutedEdge[]>();
  for (const r of out) {
    const k = r.source < r.target ? `${r.source}|${r.target}` : `${r.target}|${r.source}`;
    let l = pairs.get(k);
    if (!l) pairs.set(k, (l = []));
    l.push(r);
  }
  for (const list of pairs.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (a.id < b.id ? -1 : 1));
    list.forEach((r, i) => {
      const off = (i - (list.length - 1) / 2) * LANE_GAP;
      // Kladný směr je vztažený ke „kanonickému“ pořadí dvojice, aby opačně
      // orientované čáry nespadly na stejnou stranu.
      r.bend = r.source < r.target ? off : -off;
    });
  }
  return out;
}

/** Sbalení předci na cestě ke kořeni (po nejstarších rodičích) – rozbalí se, aby byl uzel vidět. */
export function collapsedAncestors(data: DocData, id: string, index?: HierarchyIndex): string[] {
  const idx = index ?? buildHierarchyIndex(data);
  const out: string[] = [];
  const seen = new Set<string>([id]);
  let cur = idx.parents.get(id)?.[0]?.source;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    if (data.nodes[cur]?.collapsed) out.push(cur);
    cur = idx.parents.get(cur)?.[0]?.source;
  }
  return out;
}

/** Nastaví `collapsed` více uzlům (stav pohledu – nemění updatedAt). */
export function setCollapsed(data: DocData, ids: Iterable<string>, collapsed: boolean): DocData {
  let nodes: DocData['nodes'] | null = null;
  for (const id of ids) {
    const n = data.nodes[id];
    if (!n || n.collapsed === collapsed) continue;
    nodes ??= { ...data.nodes };
    nodes[id] = { ...n, collapsed };
  }
  return nodes ? { nodes, edges: data.edges } : data;
}

/** „Sbalit vše na projekty“: sbalí projekty, které mají poduzly. */
export function collapseAllToProjects(data: DocData, index?: HierarchyIndex): DocData {
  const idx = index ?? buildHierarchyIndex(data);
  const ids = Object.values(data.nodes)
    .filter((n) => !n.deletedAt && n.type === 'project' && (idx.children.get(n.id)?.length ?? 0) > 0)
    .map((n) => n.id);
  return setCollapsed(data, ids, true);
}

export function expandAll(data: DocData): DocData {
  return setCollapsed(
    data,
    Object.values(data.nodes).filter((n) => n.collapsed).map((n) => n.id),
    false,
  );
}

/** Popis skutečných vazeb sloučené čáry (pro tooltip / seznam). */
export function edgesOf(data: DocData, ids: string[]): MapEdge[] {
  return ids.map((id) => data.edges[id]).filter((e): e is MapEdge => !!e);
}
