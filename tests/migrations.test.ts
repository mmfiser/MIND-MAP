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
