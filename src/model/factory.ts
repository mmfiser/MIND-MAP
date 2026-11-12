import { DEFAULT_PROJECT_COLOR } from './labels';
import {
  SCHEMA_VERSION,
  type EdgeKind,
  type MapDocument,
  type MapEdge,
  type MapNode,
  type NodeType,
  type Position,
} from './types';

export function newId(): string {
  return crypto.randomUUID();
}

let lastTs = 0;

/**
 * Aktuální čas v ISO 8601, v rámci běhu striktně rostoucí
 * (dvě vazby vytvořené ve stejné milisekundě mají přesto jasné pořadí stáří).
 */
export function nowIso(): string {
  const now = Date.now();
  lastTs = now > lastTs ? now : lastTs + 1;
  return new Date(lastTs).toISOString();
}

export interface CreateNodeInput {
  type: NodeType;
  title?: string;
  position?: Position;
  color?: string;
  id?: string;
  createdAt?: string;
}

export function createNode(input: CreateNodeInput): MapNode {
  const ts = input.createdAt ?? nowIso();
  const node: MapNode = {
    id: input.id ?? newId(),
    type: input.type,
    title: input.title ?? (input.type === 'project' ? 'Nový projekt' : 'Nový úkol'),
    notes: '',
    status: 'new',
    priority: 'medium',
    createdAt: ts,
    updatedAt: ts,
    tags: [],
    checklist: [],
    position: input.position ?? { x: 0, y: 0 },
    collapsed: false,
  };
  if (input.type === 'project') node.color = input.color ?? DEFAULT_PROJECT_COLOR;
  return node;
}

export function createEdge(
  kind: EdgeKind,
  source: string,
  target: string,
  order = 0,
  createdAt: string = nowIso(),
  id: string = newId(),
): MapEdge {
  return { id, kind, source, target, order, createdAt };
}

export function createEmptyDocument(deviceName: string): MapDocument {
  return {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      docId: newId(),
      revision: 0,
      updatedAt: nowIso(),
      deviceName,
    },
    nodes: {},
    edges: {},
  };
}
