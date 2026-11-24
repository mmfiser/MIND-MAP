/**
 * Zámek a pojistky pro ukládání a otevírání souborů (v1.0.1).
 *
 * Proč: na některých počítačích (spravovaný Chrome se zásadami, bezpečnostní
 * software zachytávající výběr souboru nebo zápis) se volání File System Access
 * API nikdy nevrátí. Dřív zůstal modulový příznak `saving` navždy nastavený
 * a tlačítko Uložit potichu přestalo reagovat.
 *
 *  - Zámek je v uiStore (`fileOp`); klik během běžící operace ukáže oznámení.
 *  - Pojistka: operace, která nedoběhne do 60 s (mimo dobu otevřeného dialogu),
 *    uvolní zámek a nabídne náhradní cestu.
 *  - Nativní dialog prohlížeče (výběr souboru, žádost o oprávnění) se hlídá:
 *    když se neotevře, nebo se zavře a jeho promise přesto nedoběhne, bere se
 *    jako zaseknutý (PickerStuckError) – aplikace pak přejde na stahování.
 */
import { debugLog } from '../lib/async';
import { toast, useUiStore } from '../store/uiStore';

export const FILE_OP_TIMEOUT_MS = 60_000;
/** Po návratu fokusu z nativního dialogu: kolik čekat, než se promise prohlásí za zaseknutou. */
export const PICKER_STUCK_GRACE_MS = 4_000;
/** Výběr souboru se musí otevřít (okno ztratí fokus) do této doby. */
export const PICKER_OPEN_WAIT_MS = 3_000;
/** Zápis do souboru / IndexedDB. */
export const WRITE_TIMEOUT_MS = 30_000;
export const STORE_TIMEOUT_MS = 10_000;

export class PickerStuckError extends Error {
  constructor(step: string) {
    super(`Dialog „${step}“ se zasekl (prohlížeč nevrátil výsledek).`);
    this.name = 'PickerStuckError';
  }
}

export type FileOpKind = 'save' | 'open';

// ---------- nativní dialogy prohlížeče ----------

/** Prostředí pro hlídání nativních dialogů (v testech se nahrazuje). */
export interface DialogEnv {
  onFocus(cb: () => void): () => void;
  onBlur(cb: () => void): () => void;
  hasFocus(): boolean;
}

const browserEnv = (): DialogEnv | null =>
  typeof window === 'undefined'
    ? null
    : {
        onFocus: (cb) => {
          window.addEventListener('focus', cb);
          return () => window.removeEventListener('focus', cb);
        },
        onBlur: (cb) => {
          window.addEventListener('blur', cb);
          return () => window.removeEventListener('blur', cb);
        },
        hasFocus: () => document.hasFocus(),
      };

let dialogEnv: () => DialogEnv | null = browserEnv;
/** Jen pro testy. */
export function setDialogEnv(env: DialogEnv | null): void {
  dialogEnv = env ? () => env : browserEnv;
}

let nativeOpen = 0;
/** Je právě otevřený nativní dialog (výběr souboru, oprávnění)? Jeho čas se nepočítá do limitu. */
export const isNativeDialogOpen = (): boolean => nativeOpen > 0;

export interface NativeDialogOptions {
  /** Musí se okno do této doby přepnout na dialog (ztratit fokus)? null = nehlídat. */
  openWithinMs?: number | null;
  /** Kolik čekat po návratu fokusu na výsledek. */
  graceMs?: number;
  /** Co znamená zaseknutí: chyba (výchozí), nebo zrušení (např. <input type=file> bez události „cancel“). */
  onStuck?: 'error' | 'cancel';
  /** Chyba, kterou vrátit při onStuck = 'cancel'. */
  cancelError?: () => Error;
}

/**
 * Spustí nativní dialog a pohlídá ho. Čas otevřeného dialogu se nezapočítává
 * do 60s limitu operace.
 */
export function nativeDialog<T>(start: () => Promise<T>, step: string, opts: NativeDialogOptions = {}): Promise<T> {
  const { openWithinMs = PICKER_OPEN_WAIT_MS, graceMs = PICKER_STUCK_GRACE_MS, onStuck = 'error' } = opts;
  const env = dialogEnv();
  debugLog(`${step}: otevírám`);
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let opened = false;
    // Do limitu se nepočítá jen doba, kdy je dialog opravdu otevřený (okno ztratilo fokus).
    // Bez prostředí (nelze hlídat fokus) se počítá celá doba, aby pojistka vždy zabrala.
    let counted = false;
    const count = (on: boolean) => {
      if (on === counted) return;
      counted = on;
      nativeOpen = Math.max(0, nativeOpen + (on ? 1 : -1));
    };
    const timers: ReturnType<typeof setTimeout>[] = [];
    const offs: (() => void)[] = [];
    const finish = () => {
      settled = true;
      count(false);
      timers.forEach(clearTimeout);
      offs.forEach((off) => off());
    };
    const stuck = (why: string) => {
      if (settled) return;
      debugLog(`${step}: zaseknuto (${why})`);
      finish();
      if (onStuck === 'cancel') reject(opts.cancelError?.() ?? new PickerStuckError(step));
      else reject(new PickerStuckError(step));
    };
    if (env) {
      offs.push(
        env.onBlur(() => {
          if (settled) return;
          opened = true;
          count(true);
        }),
      );
      offs.push(
        env.onFocus(() => {
          count(false);
          if (!opened || settled) return;
          timers.push(setTimeout(() => stuck('po zavření dialogu nepřišel výsledek'), graceMs));
        }),
      );
      if (openWithinMs != null) {
        timers.push(
          setTimeout(() => {
            if (!opened && env.hasFocus()) stuck('dialog se neotevřel');
          }, openWithinMs),
        );
      }
    }
    let p: Promise<T>;
    try {
      p = start();
    } catch (e) {
      finish();
      reject(e);
      return;
    }
    p.then(
      (v) => {
        if (settled) return;
        finish();
        debugLog(`${step}: hotovo`);
        resolve(v);
      },
      (e: unknown) => {
        if (settled) return;
        finish();
        debugLog(`${step}: chyba`, e instanceof Error ? e.name : typeof e);
        reject(e);
      },
    );
  });
}

// ---------- zámek ukládání / otevírání ----------

let seq = 0;

function release(token: number): void {
  const ui = useUiStore.getState();
  if (ui.fileOp?.token === token) ui.set({ fileOp: null, busy: null });
}

const BUSY_TEXT: Record<FileOpKind, string> = {
  save: 'Ukládání ještě probíhá…',
  open: 'Otevírání souboru ještě probíhá…',
};

/**
 * Spustí ukládání / otevírání pod zámkem v uiStore. Každá cesta (dokončení,
 * zrušení, chyba, časový limit) zámek i „busy“ uvolní.
 */
export async function runFileOp(kind: FileOpKind, fn: () => Promise<void>, onTimeout: () => void): Promise<void> {
  const ui = useUiStore.getState();
  if (ui.fileOp) {
    debugLog(`${kind}: odmítnuto – běží ${ui.fileOp.kind}`);
    toast(BUSY_TEXT[ui.fileOp.kind], 'info');
    return;
  }
  const token = ++seq;
  ui.set({ fileOp: { kind, token } });
  debugLog(`${kind}: začátek`);
  let active = 0;
  const watchdog = setInterval(() => {
    const s = useUiStore.getState();
    if (s.fileOp?.token !== token) return;
    // Čas otevřených dialogů (aplikace i prohlížeče) se nepočítá.
    if (s.choice || s.password || isNativeDialogOpen()) return;
    active += 1000;
    if (active >= FILE_OP_TIMEOUT_MS) {
      debugLog(`${kind}: vypršel čas ${FILE_OP_TIMEOUT_MS / 1000} s – uvolňuji zámek`);
      release(token);
      clearInterval(watchdog);
      onTimeout();
    }
  }, 1000);
  try {
    await fn();
    debugLog(`${kind}: konec`);
  } catch (e) {
    debugLog(`${kind}: neošetřená chyba`, e instanceof Error ? e.name : typeof e);
    throw e;
  } finally {
    clearInterval(watchdog);
    release(token);
  }
}
