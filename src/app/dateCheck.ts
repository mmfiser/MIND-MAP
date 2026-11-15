/** Kontrola dat po načtení dokumentu (odemknutí, otevření souboru). */
import { countDueBeforeStart } from '../model/deadline';
import type { MapDocument } from '../model/types';
import { toast } from '../store/uiStore';

export function notifyDateConflicts(doc: MapDocument): void {
  const n = countDueBeforeStart(doc.nodes);
  if (!n) return;
  const what = n === 1 ? '1 uzlu je' : `${n} uzlů je`;
  toast(`U ${what} termín dříve než začátek (označeno ⚠ na mapě).`, 'info');
}
