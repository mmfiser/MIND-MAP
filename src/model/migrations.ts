/**
 * Migrace dokumentu podle meta.schemaVersion.
 * migrations[n] převádí dokument verze n na verzi n + 1.
 * Po migraci se dokument normalizuje (doplní chybějící pole výchozími hodnotami).
 */
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
} from './types';

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationError';
  }
}

type Raw = Record<string, unknown>;
export type Migration = (doc: Raw) => Raw;

/** Registr migrací. Verze 1 je první – zatím žádné. */
export const MIGRATIONS: Record<number, Migration> = {
  // 1: (doc) => ({ ...doc, meta: { ...(doc.meta as Raw), schemaVersion: 2 }, ... }),
};

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
    throw new MigrationError(
      `Data pocházejí z novější verze aplikace (schéma ${version}, tato aplikace zná ${target}). Aktualizujte aplikaci (obnovte stránku).`,
    );
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
  const startDate = optStr(r.startDate);
  if (startDate) node.startDate = startDate;
  const dueDate = optStr(r.dueDate);
  if (dueDate) node.dueDate = dueDate;
  const deletedAt = optStr(r.deletedAt);
  if (deletedAt) node.deletedAt = deletedAt;
  if (r.positionLocked === true) node.positionLocked = true;
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
  const edges: Record<string, MapEdge> = {};
  if (isObj(raw.edges)) {
    for (const [id, r] of Object.entries(raw.edges)) {
      if (!isObj(r)) continue;
      const source = str(r.source);
      const target = str(r.target);
      if (!nodes[source] || !nodes[target] || source === target) continue;
      edges[id] = {
        id,
        kind: oneOf(r.kind, EDGE_KINDS, 'related'),
        source,
        target,
        order: num(r.order),
        createdAt: str(r.createdAt, new Date(0).toISOString()),
      };
    }
  }
  return { meta, nodes, edges };
}

/** Načte libovolná (dešifrovaná) data: migrace + normalizace. */
export function migrateDocument(raw: unknown): MapDocument {
  return normalizeDocument(runMigrations(raw));
}
