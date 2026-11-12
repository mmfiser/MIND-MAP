/**
 * Rozhodnutí při otevření souboru – porovnání revizí pracovní kopie a souboru.
 *
 *  - jiné docId → varování „jiná mapa“ (pokud je pracovní kopie prázdná a čistá, načte se rovnou)
 *  - soubor novější (revision > baseRevision) a lokálně nic neuloženého → načíst bez dotazu
 *  - soubor novější a lokálně neuložené změny → konflikt (změnilo se obojí)
 *  - soubor starší (revision < baseRevision) → konflikt (soubor je starší)
 *  - stejná revize: bez lokálních změn načíst, s lokálními změnami je soubor starší → konflikt
 */
export type OpenDecision = 'load' | 'conflict-both' | 'conflict-older' | 'other-doc';

export interface OpenDecisionInput {
  localDocId: string;
  localIsEmpty: boolean;
  dirty: boolean;
  baseRevision: number;
  fileDocId: string;
  fileRevision: number;
}

export function decideOnOpen(i: OpenDecisionInput): OpenDecision {
  if (i.fileDocId !== i.localDocId) {
    return i.localIsEmpty && !i.dirty ? 'load' : 'other-doc';
  }
  if (i.fileRevision > i.baseRevision) return i.dirty ? 'conflict-both' : 'load';
  if (i.fileRevision < i.baseRevision) return 'conflict-older';
  return i.dirty ? 'conflict-older' : 'load';
}

/** Revize, se kterou se uloží další verze souboru. */
export function nextRevision(docRevision: number, baseRevision: number): number {
  return Math.max(docRevision, baseRevision) + 1;
}
