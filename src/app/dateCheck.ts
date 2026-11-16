/** Kontrola dat po načtení dokumentu (odemknutí, otevření souboru). */
import { findDateConflicts } from '../model/conflicts';
import { migrationReport } from '../model/migrations';
import { choose } from '../store/uiStore';
import type { MapDocument } from '../model/types';
import { toast } from '../store/uiStore';

/** Oznámí opravy provedené při načtení (např. odebrané vazby, kde byl projekt podřízený). */
export function notifyMigrationReport(doc: MapDocument): void {
  const r = migrationReport(doc);
  if (!r?.removedProjectParents.length) return;
  const total = r.removedProjectParents.reduce((a, p) => a + p.count, 0);
  const list = r.removedProjectParents
    .map((p) => `„${p.projectTitle.trim() || 'bez názvu'}“${p.count > 1 ? ` (${p.count})` : ''}`)
    .join(', ');
  const vazby = total === 1 ? '1 hierarchická vazba' : total < 5 ? `${total} hierarchické vazby` : `${total} hierarchických vazeb`;
  const odebrano = total === 1 ? 'byla odebrána' : total < 5 ? 'byly odebrány' : 'bylo odebráno';
  void choose({
    title: 'Projekty přesunuty na nejvyšší úroveň',
    message: `Projekt nemůže být podřízený jinému uzlu, proto ${odebrano} ${vazby}, kde byl projekt poduzlem: ${list}. Projekty zůstaly na ploše na svém místě; propojit je můžete závislostí nebo souvislostí.`,
    options: [{ value: 'ok', label: 'Rozumím', variant: 'primary' }],
  });
}

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
