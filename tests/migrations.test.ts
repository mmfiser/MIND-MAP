import { describe, expect, it } from 'vitest';
import { createEmptyDocument } from '../src/model/factory';
import {
  MigrationError,
  migrateDocument,
  normalizeDocument,
  runMigrations,
  type Migration,
} from '../src/model/migrations';
import { SCHEMA_VERSION } from '../src/model/types';

describe('migrace schématu', () => {
  it('aktuální verze projde beze změny', () => {
    const doc = createEmptyDocument('Telefon');
    expect(migrateDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });

  it('spustí migrace postupně až do cílové verze', () => {
    const migrations: Record<number, Migration> = {
      1: (d) => ({ ...d, renamed: true }),
      2: (d) => ({ ...d, nodes: { x: { title: 'z migrace' } } }),
    };
    const out = runMigrations({ meta: { schemaVersion: 1 }, nodes: {}, edges: {} }, migrations, 3);
    expect(out.renamed).toBe(true);
    expect((out.meta as { schemaVersion: number }).schemaVersion).toBe(3);
    expect((out.nodes as Record<string, unknown>).x).toEqual({ title: 'z migrace' });
  });

  it('chybějící migrace vyhodí chybu', () => {
    expect(() => runMigrations({ meta: { schemaVersion: 1 } }, {}, 2)).toThrow(MigrationError);
  });

  it('novější schéma, než aplikace zná, odmítne česky', () => {
    expect(() => migrateDocument({ meta: { schemaVersion: SCHEMA_VERSION + 1 } })).toThrow(/novější verze/);
  });

  it('neplatná data odmítne', () => {
    expect(() => migrateDocument(null)).toThrow(MigrationError);
    expect(() => migrateDocument({ meta: { schemaVersion: 0 } })).toThrow(MigrationError);
  });

  it('normalizace doplní výchozí hodnoty a zahodí vadné vazby', () => {
    const doc = normalizeDocument({
      meta: { schemaVersion: 1, docId: 'd', revision: 3 },
      nodes: {
        p: { type: 'project', title: 'P' },
        t: { type: 'neznamy', title: 'T', position: { x: 5 } },
      },
      edges: {
        e1: { kind: 'hierarchy', source: 'p', target: 't', order: 0 },
        e2: { kind: 'hierarchy', source: 'p', target: 'neexistuje' },
      },
    });
    expect(doc.meta.revision).toBe(3);
    expect(doc.nodes.p!.color).toBe('blue');
    expect(doc.nodes.t!.type).toBe('task');
    expect(doc.nodes.t!.position).toEqual({ x: 5, y: 0 });
    expect(doc.nodes.t!.status).toBe('new');
    expect(Object.keys(doc.edges)).toEqual(['e1']);
  });
});

describe('migrace reálného dokumentu verze 1 (fáze 1) na verzi 2', () => {
  // Struktura přesně tak, jak ji ukládala fáze 1 (uvnitř šifrovaného souboru).
  const v1 = {
    meta: {
      schemaVersion: 1,
      docId: '7b0c2f4e-1d9a-4c55-9a1e-0c3f6f1e2a10',
      revision: 4,
      updatedAt: '2026-11-12T17:20:41.512Z',
      deviceName: 'Notebook',
    },
    nodes: {
      pA: {
        id: 'pA', type: 'project', title: 'Projekt A', notes: '', color: 'red',
        status: 'new', priority: 'medium', createdAt: '2026-11-12T17:19:02.001Z',
        updatedAt: '2026-11-12T17:19:05.300Z', tags: [], checklist: [],
        position: { x: 240, y: 300 }, collapsed: false,
      },
      pB: {
        id: 'pB', type: 'project', title: 'Projekt B', notes: 'pozn.', color: 'crimson',
        status: 'new', priority: 'medium', createdAt: '2026-11-12T17:19:40.000Z',
        updatedAt: '2026-11-12T17:19:41.000Z', tags: [], checklist: [],
        position: { x: 600, y: 420 }, collapsed: false,
        dueDate: '2026-11-15', // neděle – musí se posunout na pátek
      },
      hw: {
        id: 'hw', type: 'task', title: 'Hardware', notes: '', status: 'new', priority: 'medium',
        createdAt: '2026-11-12T17:19:10.000Z', updatedAt: '2026-11-12T17:19:12.000Z',
        tags: [], checklist: [], position: { x: 560, y: 310 }, collapsed: false,
        startDate: 'nesmysl',
      },
      sklad: {
        id: 'sklad', type: 'task', title: 'Sklad', notes: '', status: 'new', priority: 'medium',
        createdAt: '2026-11-12T17:19:20.000Z', updatedAt: '2026-11-12T17:19:22.000Z',
        tags: [], checklist: [], position: { x: 830, y: 300 }, collapsed: false,
      },
    },
    edges: {
      e1: { id: 'e1', kind: 'hierarchy', source: 'pA', target: 'hw', order: 0, createdAt: '2026-11-12T17:19:10.001Z' },
      e2: { id: 'e2', kind: 'hierarchy', source: 'hw', target: 'sklad', order: 0, createdAt: '2026-11-12T17:19:20.001Z' },
      e3: { id: 'e3', kind: 'hierarchy', source: 'pB', target: 'sklad', order: 0, createdAt: '2026-11-12T17:21:00.000Z' },
    },
  };

  it('převede dokument beze ztráty dat a opraví neplatná data', () => {
    const doc = migrateDocument(JSON.parse(JSON.stringify(v1)));
    expect(doc.meta).toMatchObject({ schemaVersion: SCHEMA_VERSION, docId: v1.meta.docId, revision: 4, deviceName: 'Notebook' });
    expect(Object.keys(doc.nodes).sort()).toEqual(['hw', 'pA', 'pB', 'sklad']);
    expect(Object.keys(doc.edges).sort()).toEqual(['e1', 'e2', 'e3']);
    expect(doc.nodes.pA).toMatchObject({ title: 'Projekt A', color: 'red', position: { x: 240, y: 300 }, status: 'new' });
    expect(doc.nodes.pB!.notes).toBe('pozn.');
    expect(doc.nodes.pB!.dueDate).toBe('2026-11-13'); // neděle → pátek
    expect(doc.nodes.hw!.startDate).toBeUndefined(); // neplatné datum zahozeno
    expect(doc.nodes.sklad!.deletedAt).toBeUndefined();
    expect(doc.nodes.sklad!.trash).toBeUndefined();
  });

  it('uzel smazaný bez informace o koši dostane vlastní položku koše', () => {
    const raw = JSON.parse(JSON.stringify(v1));
    raw.nodes.hw.deletedAt = '2026-11-12T18:00:00.000Z';
    const doc = migrateDocument(raw);
    expect(doc.nodes.hw!.trash).toEqual({ batchId: 'hw', isRoot: true });
  });
});
