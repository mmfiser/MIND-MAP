/**
 * Pomocné funkce pro operace, které se nesmí zaseknout navždy
 * (výběr souboru, zápis, IndexedDB). Bez závislostí na UI.
 */

/** Diagnostický zápis do konzole – jen názvy kroků, nikdy uživatelská data. */
export function debugLog(...args: unknown[]): void {
  console.debug('[mapa]', ...args);
}

export class StepTimeoutError extends Error {
  readonly step: string;
  constructor(step: string, ms: number) {
    super(`Krok „${step}“ neskončil do ${Math.round(ms / 1000)} s.`);
    this.name = 'StepTimeoutError';
    this.step = step;
  }
}

/** Promise s časovým limitem: po `ms` se odmítne chybou StepTimeoutError. */
export function withTimeout<T>(p: Promise<T>, ms: number, step: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new StepTimeoutError(step, ms)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
