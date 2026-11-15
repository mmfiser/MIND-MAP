import { describe, expect, it } from 'vitest';
import { countDueBeforeStart, dueBeforeStart } from '../src/model/deadline';
import { toLastWorkingDayOnOrBefore } from '../src/model/holidays';
import { ICON_GROUPS, filterIconGroups, foldText, projectIcon } from '../src/components/common/projectIcons';

describe('termín dříve než začátek', () => {
  it('termín před začátkem = konflikt', () => {
    expect(dueBeforeStart({ startDate: '2026-11-20', dueDate: '2026-11-19' })).toBe(true);
  });
  it('stejné datum i pozdější termín jsou v pořádku', () => {
    expect(dueBeforeStart({ startDate: '2026-11-20', dueDate: '2026-11-20' })).toBe(false);
    expect(dueBeforeStart({ startDate: '2026-11-20', dueDate: '2026-11-25' })).toBe(false);
  });
  it('chybí-li jedno z dat, konflikt není', () => {
    expect(dueBeforeStart({ dueDate: '2026-11-20' })).toBe(false);
    expect(dueBeforeStart({ startDate: '2026-11-20' })).toBe(false);
    expect(dueBeforeStart({})).toBe(false);
  });
  it('konflikt vzniklý automatickým posunem termínu z víkendu', () => {
    // začátek v sobotu 21. 11., termín v neděli 22. 11. → posun na pátek 20. 11.
    const due = toLastWorkingDayOnOrBefore('2026-11-22');
    expect(due).toBe('2026-11-20');
    expect(dueBeforeStart({ startDate: '2026-11-21', dueDate: '2026-11-22' })).toBe(false);
    expect(dueBeforeStart({ startDate: '2026-11-21', dueDate: due })).toBe(true);
  });
  it('počet konfliktů v dokumentu (bez uzlů v koši)', () => {
    expect(
      countDueBeforeStart({
        a: { startDate: '2026-11-20', dueDate: '2026-11-19' },
        b: { startDate: '2026-11-20', dueDate: '2026-11-20' },
        c: { startDate: '2026-11-20', dueDate: '2026-11-02', deletedAt: '2026-11-14T10:00:00Z' },
      }),
    ).toBe(1);
  });
});

describe('ikony', () => {
  const all = ICON_GROUPS.flatMap((g) => g.icons);
  it('žádné duplicitní klíče ani ikony', () => {
    expect(new Set(all.map((i) => i.key)).size).toBe(all.length);
    expect(new Set(all.map((i) => i.Icon)).size).toBe(all.length);
  });
  it('klíče z fáze 2 zůstaly (přesun IT → Hardware nemění uložená data)', () => {
    for (const k of ['laptop', 'cpu', 'harddrive', 'server', 'train', 'ambulance', 'calendar']) {
      expect(projectIcon(k)).toBeDefined();
    }
    const hw = ICON_GROUPS.find((g) => g.name === 'Hardware')!;
    expect(hw.icons).toHaveLength(20);
    expect(hw.icons.map((i) => i.key)).toEqual(expect.arrayContaining(['laptop', 'cpu', 'harddrive']));
    expect(ICON_GROUPS.find((g) => g.name === 'IT')!.icons.map((i) => i.key)).not.toContain('laptop');
  });
  it('vyhledávání bez ohledu na diakritiku a velikost písmen', () => {
    expect(foldText('Anténa / VYSÍLAČ')).toBe('antena / vysilac');
    const names = (q: string) => filterIconGroups(q).flatMap((g) => g.icons.map((i) => i.label));
    expect(names('vysilac')).toContain('Anténa / vysílač');
    expect(names('MYS')).toEqual(['Myš']);
    expect(names('hardware')).toHaveLength(20); // podle názvu skupiny
    expect(names('neexistuje')).toEqual([]);
    expect(filterIconGroups('')).toBe(ICON_GROUPS);
  });
});
