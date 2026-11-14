/**
 * „Dnes“ pro zvýraznění termínů. Jeden společný časovač na příští půlnoc
 * a kontrola při návratu do karty (visibilitychange) – žádný časovač na uzel.
 */
import { msUntilNextMidnight, todayYmd } from '../model/dates';
import { useUiStore } from '../store/uiStore';

let timer: ReturnType<typeof setTimeout> | null = null;

function refresh(): void {
  const t = todayYmd();
  if (useUiStore.getState().today !== t) useUiStore.getState().set({ today: t });
}

function schedule(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    refresh();
    schedule();
  }, msUntilNextMidnight());
}

export function startTodayClock(): void {
  refresh();
  schedule();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refresh();
      schedule(); // časovače v pozadí mohou být uspané
    }
  });
}
