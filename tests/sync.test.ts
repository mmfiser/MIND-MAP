import { describe, expect, it } from 'vitest';
import { decideOnOpen, nextRevision, type OpenDecisionInput } from '../src/model/sync';

const base: OpenDecisionInput = {
  localDocId: 'A',
  localIsEmpty: false,
  dirty: false,
  baseRevision: 5,
  fileDocId: 'A',
  fileRevision: 5,
};

describe('rozhodnutí při otevření souboru', () => {
  it('novější soubor bez lokálních změn se načte bez dotazu', () => {
    expect(decideOnOpen({ ...base, fileRevision: 6 })).toBe('load');
  });
  it('novější soubor a lokální změny = konflikt (změnilo se obojí)', () => {
    expect(decideOnOpen({ ...base, fileRevision: 6, dirty: true })).toBe('conflict-both');
  });
  it('starší soubor = konflikt', () => {
    expect(decideOnOpen({ ...base, fileRevision: 4 })).toBe('conflict-older');
  });
  it('stejná revize: bez změn načíst, se změnami je soubor starší', () => {
    expect(decideOnOpen(base)).toBe('load');
    expect(decideOnOpen({ ...base, dirty: true })).toBe('conflict-older');
  });
  it('jiné docId varuje, prázdnou čistou pracovní kopii nahradí', () => {
    expect(decideOnOpen({ ...base, fileDocId: 'B' })).toBe('other-doc');
    expect(decideOnOpen({ ...base, fileDocId: 'B', localIsEmpty: true })).toBe('load');
    expect(decideOnOpen({ ...base, fileDocId: 'B', localIsEmpty: true, dirty: true })).toBe('other-doc');
  });
  it('další revize je vždy vyšší než obě známé', () => {
    expect(nextRevision(3, 5)).toBe(6);
    expect(nextRevision(7, 5)).toBe(8);
  });
});
