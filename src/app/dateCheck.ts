/** Kontrola dat po načtení dokumentu (odemknutí, otevření souboru). */
import { findDateConflicts } from '../model/conflicts';
import type { MapDocument } from '../model/types';
import { toast } from '../store/uiStore';

export function notifyDateConflicts(doc: MapDocument): void {
  const report = findDateConflicts(doc);
  const n = report.byNode.size;
  if (!n) return;
  const onlyStart = report.list.every((c) => c.kind === 'dueBeforeStart');
  const what = n === 1 ? '1 uzlu je' : `${n} uzlů je`;
  toast(
    onlyStart
      ? `U ${what} termín dříve než začátek (označeno ⚠ na mapě).`
      : `U ${what} kolize termínů (označeno ⚠ na mapě, podrobnosti v detailu uzlu).`,
    'info',
  );
}
