/**
 * Migrace dokumentu podle meta.schemaVersion.
 * migrations[n] převádí dokument verze n na verzi n + 1.
 * Po migraci se dokument normalizuje (doplní chybějící pole výchozími hodnotami).
 */
import { isValidYmd } from './dates';
import { toLastWorkingDayOnOrBefore } from './holidays';
import { DEFAULT_PROJECT_COLOR } from './labels';
import {
  SCHEMA_VERSION,
  type DocMeta,
  type EdgeKind,
  type MapDocument,
  type MapEdge,
  type MapNode,
  type NodeType,
  type Priority,
  type Status,
  type TrashInfo,
} from './types';

export const NEWER_VERSION_MESSAGE =
  'Soubor je z novější verze aplikace. Otevřete aplikaci s připojením k internetu, aby se aktualizovala, a zkuste to znovu.';

export class MigrationError extends Error {
  /** `newer` = data z novější verze aplikace (nabídnout kontrolu aktualizace). */
  readonly code: 'newer' | 'invalid';
  constructor(message: string, code: 'newer' | 'invalid' = 'invalid') {
    super(message);
    this.name = 'MigrationError';
    this.code = code;
  }
}

type Raw = Record<string, unknown>;
export type Migration = (doc: Raw) => Raw;

/** Registr migrací: MIGRATIONS[n] převádí verzi n na n + 1. */
export const MIGRATIONS: Record<number, Migration> = {
  /**
   * 1 → 2 (fáze 2): koš. Uzel smazaný bez informace o koši dostane vlastní
   * položku koše. Ostatní pole (stav, priorita, data, štítky…) už v modelu byla;
   * termíny a data zkontroluje normalizace.
   */
  1: (doc) => {
    const nodes = isObj(doc.nodes) ? doc.nodes : {};
    const out: Raw = {};
    for (const [id, n] of Object.entries(nodes)) {
      if (isObj(n) && typeof n.deletedAt === 'string' && n.deletedAt && !isObj(n.trash)) {
        out[id] = { ...n, trash: { batchId: id, isRoot: true } };
      } else out[id] = n;
    }
    return { ...doc, nodes: out };
  },
  /**
   * 2 → 3 (fáze 3): milníky, závislosti, souvislosti, sbalování. Nová pole
   * nepřibyla; úklid (milník bez stavu/checklistu, vazby na sebe, duplicity,
   * poduzly milníku, cykly) dělá normalizace, která běží po každé migraci.
   */
  2: (doc) => doc,
  /**
   * 3 → 4: projekt nesmí být v hierarchii podřízený. Hierarchické vazby, kde je
   * projekt potomkem, odstraní normalizace (a nahlásí je – viz migrationReport).
   */
  3: (doc) => doc,
};

/** Co normalizace při načtení opravila (pro oznámení uživateli). */
export interface MigrationReport {
  /** odebrané hierarchické vazby, kde byl projekt potomkem – podle projektu */
  removedProjectParents: { projectId: string; projectTitle: string; count: number }[];
}

const reports = new WeakMap<MapDocument, MigrationReport>();

/** Zpráva o opravách pro dokument vrácený z migrateDocument / normalizeDocument. */
export function migrationReport(doc: MapDocument): MigrationReport | undefined {
  return reports.get(doc);
}

const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);

export function runMigrations(
  raw: unknown,
  migrations: Record<number, Migration> = MIGRATIONS,
  target: number = SCHEMA_VERSION,
): Raw {
  if (!isObj(raw) || !isObj(raw.meta)) throw new MigrationError('Data nemají platný formát mapy.');
  let doc: Raw = raw;
  let version = Number((doc.meta as Raw).schemaVersion);
  if (!Number.isInteger(version) || version < 1) {
    throw new MigrationError('Data nemají platnou verzi schématu.');
  }
  if (version > target) {
    throw new MigrationError(NEWER_VERSION_MESSAGE, 'newer');
  }
  while (version < target) {
    const m = migrations[version];
    if (!m) throw new MigrationError(`Chybí migrace ze schématu ${version}.`);
    doc = m(doc);
    const meta = isObj(doc.meta) ? doc.meta : {};
    doc = { ...doc, meta: { ...meta, schemaVersion: version + 1 } };
    version += 1;
  }
  return doc;
}

const NODE_TYPES: NodeType[] = ['project', 'task', 'milestone'];
const STATUSES: Status[] = ['new', 'in_progress', 'waiting', 'blocked', 'done', 'cancelled'];
const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'critical'];
const EDGE_KINDS: EdgeKind[] = ['hierarchy', 'dependency', 'related'];

const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const optStr = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const oneOf = <T extends string>(v: unknown, list: T[], d: T): T =>
  list.includes(v as T) ? (v as T) : d;

function normalizeTrash(id: string, v: unknown): TrashInfo {
  if (!isObj(v)) return { batchId: id, isRoot: true };
  const t: TrashInfo = { batchId: str(v.batchId) || id, isRoot: v.isRoot === true };
  if (Array.isArray(v.parentIds)) t.parentIds = v.parentIds.filter((p): p is string => typeof p === 'string');
  const pt = optStr(v.projectTitle);
  if (pt) t.projectTitle = pt;
  return t;
}

function normalizeNode(id: string, r: Raw): MapNode {
  const createdAt = str(r.createdAt, new Date(0).toISOString());
  const type = oneOf(r.type, NODE_TYPES, 'task');
  const pos = isObj(r.position) ? r.position : {};
  const node: MapNode = {
    id,
    type,
    title: str(r.title),
    notes: str(r.notes),
    status: oneOf(r.status, STATUSES, 'new'),
    priority: oneOf(r.priority, PRIORITIES, 'medium'),
    createdAt,
    updatedAt: str(r.updatedAt, createdAt),
    tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === 'string') : [],
    checklist: Array.isArray(r.checklist)
      ? r.checklist.filter(isObj).map((c) => ({
          id: str(c.id) || crypto.randomUUID(),
          text: str(c.text),
          done: c.done === true,
        }))
      : [],
    position: { x: num(pos.x), y: num(pos.y) },
    collapsed: r.collapsed === true,
  };
  const color = optStr(r.color) ?? (type === 'project' ? DEFAULT_PROJECT_COLOR : undefined);
  if (color) node.color = color;
  const icon = optStr(r.icon);
  if (icon) node.icon = icon;
  const borderColor = optStr(r.borderColor);
  if (borderColor) node.borderColor = borderColor;
  if (isValidYmd(r.startDate)) node.startDate = r.startDate;
  // Termín dokončení / deadline vždy na pracovní den (posun na poslední pracovní den před ním).
  if (isValidYmd(r.dueDate)) node.dueDate = toLastWorkingDayOnOrBefore(r.dueDate);
  const deletedAt = optStr(r.deletedAt);
  if (deletedAt) {
    node.deletedAt = deletedAt;
    node.trash = normalizeTrash(id, r.trash);
  }
  if (r.positionLocked === true) node.positionLocked = true;
  if (type === 'milestone') {
    // Milník nemá stav, prioritu, checklist ani začátek.
    node.status = 'new';
    node.priority = 'medium';
    node.checklist = [];
    delete node.startDate;
  }
  return node;
}

/** Ověří strukturu a doplní výchozí hodnoty. Vadné vazby (na neexistující uzly) zahodí. */
export function normalizeDocument(raw: Raw): MapDocument {
  const m = isObj(raw.meta) ? raw.meta : {};
  const meta: DocMeta = {
    schemaVersion: SCHEMA_VERSION,
    docId: str(m.docId) || crypto.randomUUID(),
    revision: Math.max(0, Math.floor(num(m.revision))),
    updatedAt: str(m.updatedAt, new Date(0).toISOString()),
    deviceName: str(m.deviceName),
  };
  const nodes: Record<string, MapNode> = {};
  if (isObj(raw.nodes)) {
    for (const [id, r] of Object.entries(raw.nodes)) {
      if (isObj(r)) nodes[id] = normalizeNode(id, r);
    }
  }
  const candidates: MapEdge[] = [];
  const removed = new Map<string, number>();
  if (isObj(raw.edges)) {
    for (const [id, r] of Object.entries(raw.edges)) {
      if (!isObj(r)) continue;
      const source = str(r.source);
      const target = str(r.target);
      if (!nodes[source] || !nodes[target] || source === target) continue;
      let kind = oneOf(r.kind, EDGE_KINDS, 'related');
      // Milník nemůže mít poduzly – takovou vazbu zachovej jako souvislost.
      if (kind === 'hierarchy' && nodes[source]!.type === 'milestone') kind = 'related';
      // Projekt nemůže být podřízený – vazbu odeber a nahlas.
      if (kind === 'hierarchy' && nodes[target]!.type === 'project') {
        removed.set(target, (removed.get(target) ?? 0) + 1);
        continue;
      }
      candidates.push({
        id,
        kind,
        source,
        target,
        order: num(r.order),
        createdAt: str(r.createdAt, new Date(0).toISOString()),
      });
    }
  }
  const doc: MapDocument = { meta, nodes, edges: cleanEdges(candidates) };
  if (removed.size) {
    reports.set(doc, {
      removedProjectParents: [...removed].map(([projectId, count]) => ({
        projectId,
        projectTitle: nodes[projectId]!.title,
        count,
      })),
    });
  }
  return doc;
}

/**
 * Zahodí duplicitní vazby (u souvislosti v obou směrech) a vazby, které by
 * vytvořily cyklus v hierarchii nebo v závislostech. Rozhoduje stáří vazby
 * (starší vyhrává), takže výsledek je deterministický.
 */
function cleanEdges(list: MapEdge[]): Record<string, MapEdge> {
  list.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1));
  const edges: Record<string, MapEdge> = {};
  const seen = new Set<string>();
  const out: Record<'hierarchy' | 'dependency', Map<string, string[]>> = { hierarchy: new Map(), dependency: new Map() };
  const reaches = (adj: Map<string, string[]>, from: string, to: string): boolean => {
    const stack = [from];
    const visited = new Set([from]);
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === to) return true;
      for (const n of adj.get(cur) ?? []) if (!visited.has(n)) (visited.add(n), stack.push(n));
    }
    return false;
  };
  for (const e of list) {
    const key = e.kind === 'related' ? `r:${[e.source, e.target].sort().join('|')}` : `${e.kind}:${e.source}|${e.target}`;
    if (seen.has(key)) continue;
    if (e.kind !== 'related') {
      const adj = out[e.kind];
      if (reaches(adj, e.target, e.source)) continue;
      let l = adj.get(e.source);
      if (!l) adj.set(e.source, (l = []));
      l.push(e.target);
    }
    seen.add(key);
    edges[e.id] = e;
  }
  return edges;
}

/** Načte libovolná (dešifrovaná) data: migrace + normalizace. */
export function migrateDocument(raw: unknown): MapDocument {
  return normalizeDocument(runMigrations(raw));
}
