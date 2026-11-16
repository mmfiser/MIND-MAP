import { describe, expect, it } from 'vitest';
import { createEdge, createNode } from '../src/model/factory';
import { parentEdges } from '../src/model/graph';
import { PROJECT_NO_PARENT, addChild, addParent, addSibling, moveBranch } from '../src/model/hierarchy';
import { addLink, reconnectLink, validateLink } from '../src/model/links';
import { migrateDocument, migrationReport } from '../src/model/migrations';
import { restoreBatch, trashBranch } from '../src/model/trash';
import type { DocData, MapNode, OpResult } from '../src/model/types';
import { SCHEMA_VERSION } from '../src/model/types';

const MSG = 'Projekt nemůže být podřízený jinému uzlu. Pro propojení použijte závislost nebo souvislost.';

const unwrap = (r: OpResult): DocData => {
  if (!r.ok) throw new Error(r.reason);
  return r.data;
};
const rejected = (r: OpResult) => {
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.reason).toBe(MSG);
};
let seq = 0;
const node = (id: string, type: MapNode['type'] = 'task'): MapNode =>
  createNode({ id, type, title: id, createdAt: `2026-11-01T00:00:${String(seq++ % 60).padStart(2, '0')}.000Z` });

/** P (projekt) ─ T ─ U ; Q (projekt) ; M (milník pod P) */
function sample(): DocData {
  let d: DocData = { nodes: { P: node('P', 'project'), Q: node('Q', 'project') }, edges: {} };
  d = unwrap(addChild(d, 'P', node('T')));
  d = unwrap(addChild(d, 'T', node('U')));
  d = unwrap(addChild(d, 'P', node('M', 'milestone')));
  return d;
}

describe('projekt nesmí mít v hierarchii rodiče', () => {
  it('hláška odpovídá zadání', () => {
    expect(PROJECT_NO_PARENT).toBe(MSG);
  });

  it('vytvoření vazby (tažení z konektoru i Propojit) – „Přidat jako poduzel“ na projekt', () => {
    const d = sample();
    expect(validateLink(d, 'hierarchy', 'T', 'Q')).toBe(MSG);
    rejected(addLink(d, 'hierarchy', 'P', 'Q')); // ani jiný projekt
    rejected(addLink(d, 'hierarchy', 'T', 'Q')); // ani úkol
    expect(validateLink(d, 'hierarchy', 'M', 'Q')).toMatch(/Milník nemůže mít poduzly|Projekt nemůže/); // ani milník
  });

  it('závislosti a souvislosti s projekty zůstávají povolené', () => {
    let d = sample();
    d = unwrap(addLink(d, 'dependency', 'T', 'Q'));
    d = unwrap(addLink(d, 'dependency', 'Q', 'U'));
    d = unwrap(addLink(d, 'related', 'P', 'Q'));
    expect(Object.values(d.edges).filter((e) => e.kind !== 'hierarchy')).toHaveLength(3);
  });

  it('přepojení konce hierarchické vazby na projekt jako potomka', () => {
    const d = sample();
    const tu = Object.values(d.edges).find((e) => e.source === 'T' && e.target === 'U')!;
    rejected(reconnectLink(d, tu.id, 'target', 'Q'));
    // přepojení rodiče na projekt je v pořádku
    expect(reconnectLink(d, tu.id, 'source', 'Q').ok).toBe(true);
  });

  it('Přesunout pod… a Přidat rodiče', () => {
    const d = sample();
    rejected(moveBranch(d, 'Q', null, 'T'));
    rejected(moveBranch(d, 'P', null, 'Q'));
    rejected(addParent(d, 'Q', 'P'));
    rejected(addParent(d, 'P', 'U'));
  });

  it('nový projekt nejde přidat jako poduzel ani jako sourozenec podřízeného uzlu', () => {
    const d = sample();
    rejected(addChild(d, 'T', node('N', 'project')));
    rejected(addSibling(d, 'U', node('N2', 'project')));
    // sourozenec projektu na nejvyšší úrovni je v pořádku
    expect(addSibling(d, 'Q', node('N3', 'project')).ok).toBe(true);
  });

  it('obnovení z koše: vazba, která by z projektu udělala potomka, se zahodí s oznámením', () => {
    let d = sample();
    // starší data: neaktivní hierarchická vazba T → Q (Q je projekt)
    const bad = createEdge('hierarchy', 'T', 'Q', 5, '2026-11-01T01:00:00.000Z', 'bad');
    d = { nodes: d.nodes, edges: { ...d.edges, bad } };
    d = unwrap(trashBranch(d, 'T', { batchId: 'b' }));
    const r = restoreBatch(d, 'b');
    if ('error' in r) throw new Error(r.error);
    expect(r.data.edges.bad).toBeUndefined();
    expect(parentEdges(r.data, 'Q')).toHaveLength(0);
    expect(parentEdges(r.data, 'T').map((e) => e.source)).toEqual(['P']); // ostatní vazby se vrátí
    expect(r.notices.join(' ')).toMatch(/Projekt „Q“ nemůže být podřízený uzlu „T“/);
  });
});

describe('migrace na schéma 4', () => {
  const v3 = {
    meta: { schemaVersion: 3, docId: 'doc-3', revision: 2, updatedAt: '2026-11-16T10:00:00.000Z', deviceName: 'Notebook' },
    nodes: {
      A: { id: 'A', type: 'project', title: 'Síť', createdAt: '2026-11-10T10:00:00.000Z', position: { x: 0, y: 0 } },
      B: { id: 'B', type: 'project', title: 'Školení', createdAt: '2026-11-10T10:01:00.000Z', position: { x: 0, y: 300 } },
      C: { id: 'C', type: 'project', title: 'Rozpočet', createdAt: '2026-11-10T10:02:00.000Z', position: { x: 0, y: 600 } },
      T: { id: 'T', type: 'task', title: 'Úkol', createdAt: '2026-11-10T10:03:00.000Z', position: { x: 300, y: 0 } },
    },
    edges: {
      e1: { id: 'e1', kind: 'hierarchy', source: 'A', target: 'T', order: 0, createdAt: '2026-11-10T10:03:00.001Z' },
      e2: { id: 'e2', kind: 'hierarchy', source: 'A', target: 'B', order: 1, createdAt: '2026-11-10T10:04:00.000Z' },
      e3: { id: 'e3', kind: 'hierarchy', source: 'T', target: 'B', order: 0, createdAt: '2026-11-10T10:05:00.000Z' },
      e4: { id: 'e4', kind: 'hierarchy', source: 'T', target: 'C', order: 1, createdAt: '2026-11-10T10:06:00.000Z' },
      e5: { id: 'e5', kind: 'dependency', source: 'B', target: 'C', order: 0, createdAt: '2026-11-10T10:07:00.000Z' },
      e6: { id: 'e6', kind: 'related', source: 'T', target: 'A', order: 0, createdAt: '2026-11-10T10:08:00.000Z' },
    },
  };

  it('odstraní hierarchické vazby, kde je projekt potomkem, a nahlásí je podle projektu', () => {
    const doc = migrateDocument(JSON.parse(JSON.stringify(v3)));
    expect(doc.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(4);
    expect(Object.keys(doc.edges).sort()).toEqual(['e1', 'e5', 'e6']);
    expect(Object.keys(doc.nodes).sort()).toEqual(['A', 'B', 'C', 'T']); // uzly zůstanou
    expect(doc.nodes.B!.position).toEqual({ x: 0, y: 300 });
    expect(migrationReport(doc)?.removedProjectParents).toEqual([
      { projectId: 'B', projectTitle: 'Školení', count: 2 },
      { projectId: 'C', projectTitle: 'Rozpočet', count: 1 },
    ]);
  });

  it('dokument bez takových vazeb nemá žádnou zprávu', () => {
    const raw = JSON.parse(JSON.stringify(v3));
    delete raw.edges.e2;
    delete raw.edges.e3;
    delete raw.edges.e4;
    expect(migrationReport(migrateDocument(raw))).toBeUndefined();
  });
});
