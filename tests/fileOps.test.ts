/**
 * v1.0.1 – tlačítko Uložit nesmí potichu přestat reagovat.
 * Platformní části (výběr souboru, zápis, nastavení v IndexedDB) jsou nahrazené atrapami.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  class UserCancelled extends Error {
    constructor() {
      super('Zrušeno uživatelem.');
      this.name = 'UserCancelled';
    }
  }
  return {
    UserCancelled,
    fsa: true,
    blocked: false,
    settings: {} as Record<string, unknown>,
    pick: null as unknown as ReturnType<typeof import('vitest').vi.fn>,
    perm: null as unknown as ReturnType<typeof import('vitest').vi.fn>,
    write: null as unknown as ReturnType<typeof import('vitest').vi.fn>,
    read: null as unknown as ReturnType<typeof import('vitest').vi.fn>,
    download: null as unknown as ReturnType<typeof import('vitest').vi.fn>,
    openFsa: null as unknown as ReturnType<typeof import('vitest').vi.fn>,
    openInput: null as unknown as ReturnType<typeof import('vitest').vi.fn>,
    key: null as unknown as ReturnType<typeof import('vitest').vi.fn>,
  };
});

vi.mock('../src/storage/fileIO', () => ({
  UserCancelled: h.UserCancelled,
  baseName: (n: string) => n.replace(/\.txt$/i, '').replace(/\.mapa$/i, '') || 'mapa',
  blockFileSystemAccess: () => {
    h.blocked = true;
  },
  isFileSystemAccessBlocked: () => h.blocked,
  isPolicyBlock: (e: unknown) => e instanceof DOMException && (e.name === 'SecurityError' || e.name === 'NotAllowedError'),
  hasFileSystemAccess: () => h.fsa && !h.blocked,
  ensureWritePermission: (...a: unknown[]) => h.perm(...a),
  openFileFsa: (...a: unknown[]) => h.openFsa(...a),
  openFileInput: (...a: unknown[]) => h.openInput(...a),
  pickSaveHandle: (...a: unknown[]) => h.pick(...a),
  readHandle: (...a: unknown[]) => h.read(...a),
  shareOrDownload: vi.fn(),
  download: (...a: unknown[]) => h.download(...a),
  writeHandle: (...a: unknown[]) => h.write(...a),
}));
vi.mock('../src/app/session', () => ({
  getSettings: () => h.settings,
  updateSettings: async (p: Record<string, unknown>) => {
    Object.assign(h.settings, p);
  },
}));
vi.mock('../src/storage/persist', () => ({ flushAutosave: () => Promise.resolve() }));
vi.mock('../src/crypto/keySession', () => ({
  keyForSalt: () => h.key(),
  deriveWithPassword: vi.fn(),
  rememberKey: vi.fn(),
}));

import { FILE_OP_TIMEOUT_MS, PICKER_OPEN_WAIT_MS, setDialogEnv } from '../src/app/fileOps';
import { openFromFile, saveToFile } from '../src/app/fileSync';
import { createEmptyDocument, createNode } from '../src/model/factory';
import { useDocStore } from '../src/store/docStore';
import { askPassword, choose, useUiStore } from '../src/store/uiStore';

const aesKey = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
const fakeHandle = (name = 'mapa.mapa') => ({ name }) as unknown as FileSystemFileHandle;

/** Odpoví na právě otevřený dialog aplikace (jako klik na tlačítko). */
function answer(value: string | null): string {
  const c = useUiStore.getState().choice;
  if (!c) throw new Error('Žádný dialog není otevřený.');
  useUiStore.getState().set({ choice: null });
  c.resolve(value);
  return c.title;
}
const lastToast = () => useUiStore.getState().toasts.at(-1)?.text ?? '';
const released = () => {
  const s = useUiStore.getState();
  return s.fileOp === null && s.busy === null;
};

beforeEach(() => {
  vi.useRealTimers();
  setDialogEnv(null);
  h.fsa = true;
  h.blocked = false;
  h.settings = { fileName: 'mapa', fileHandle: null };
  h.pick = vi.fn(async () => fakeHandle());
  h.perm = vi.fn(async () => true);
  h.write = vi.fn(async () => undefined);
  h.read = vi.fn(async () => '');
  h.download = vi.fn();
  h.openFsa = vi.fn();
  h.openInput = vi.fn();
  h.key = vi.fn(aesKey);
  const doc = createEmptyDocument('Test');
  const n = createNode({ id: 'P', type: 'project', title: 'Projekt' });
  useDocStore.getState().load({ ...doc, nodes: { P: n } }, { dirty: true, baseRevision: 0, resetHistory: true });
  useUiStore.getState().set({ fileOp: null, busy: null, choice: null, password: null, toasts: [] });
  vi.spyOn(console, 'debug').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ukládání – zámek se vždy uvolní', () => {
  it('případ A: Storno ve výběru souboru → zámek uvolněn, další klik znovu otevře výběr', async () => {
    h.pick.mockRejectedValueOnce(new h.UserCancelled());
    await saveToFile();
    expect(released()).toBe(true);
    await saveToFile();
    expect(h.pick).toHaveBeenCalledTimes(2);
    expect(h.write).toHaveBeenCalledTimes(1);
    expect(released()).toBe(true);
  });

  it('případ B: po úspěšném uložení funguje další uložení – 3× za sebou', async () => {
    await saveToFile();
    await saveToFile();
    await saveToFile();
    expect(h.pick).toHaveBeenCalledTimes(1); // poprvé výběr souboru
    expect(h.perm).toHaveBeenCalledTimes(2); // pak zápis do stejného souboru
    expect(h.write).toHaveBeenCalledTimes(3);
    expect(useDocStore.getState().dirty).toBe(false);
    expect(released()).toBe(true);
  });

  it('Uložit jako vždy otevře výběr souboru', async () => {
    await saveToFile();
    await saveToFile(true);
    expect(h.pick).toHaveBeenCalledTimes(2);
    expect(released()).toBe(true);
  });

  it('chyba zápisu → dialog s náhradní cestou; po zavření je zámek uvolněný', async () => {
    h.write.mockRejectedValueOnce(new Error('disk'));
    const p = saveToFile();
    await vi.waitFor(() => expect(useUiStore.getState().choice).not.toBeNull());
    expect(answer('cancel')).toBe('Zápis do souboru byl zablokován');
    await p;
    expect(released()).toBe(true);
  });

  it('chyba zápisu → „Stáhnout soubor“ stáhne a uloží', async () => {
    h.write.mockRejectedValueOnce(new Error('disk'));
    const p = saveToFile();
    await vi.waitFor(() => expect(useUiStore.getState().choice).not.toBeNull());
    answer('download');
    await p;
    expect(h.download).toHaveBeenCalledTimes(1);
    expect(useDocStore.getState().dirty).toBe(false);
    expect(released()).toBe(true);
  });

  it('zamítnuté oprávnění k zápisu → oznámení, zámek uvolněný', async () => {
    h.settings.fileHandle = fakeHandle();
    h.perm.mockResolvedValueOnce(false);
    await saveToFile();
    expect(lastToast()).toMatch(/Bez oprávnění k zápisu/);
    expect(released()).toBe(true);
  });

  it('klik během běžícího ukládání není tichý a nespustí druhé ukládání', async () => {
    let finishPick: (v: unknown) => void = () => undefined;
    h.pick.mockImplementationOnce(() => new Promise((res, rej) => (finishPick = (v) => (v instanceof Error ? rej(v) : res(v)))));
    const p = saveToFile();
    await saveToFile();
    expect(lastToast()).toBe('Ukládání ještě probíhá…');
    await openFromFile();
    expect(lastToast()).toBe('Ukládání ještě probíhá…');
    expect(h.pick).toHaveBeenCalledTimes(1);
    finishPick(new h.UserCancelled());
    await p;
    expect(released()).toBe(true);
  });
});

describe('pojistky proti zaseknutí', () => {
  it('operace delší než 60 s (mimo dialogy) uvolní zámek a nabídne stažení', async () => {
    vi.useFakeTimers();
    h.key.mockImplementationOnce(() => new Promise(() => undefined)); // šifrování se zasekne
    void saveToFile();
    await vi.advanceTimersByTimeAsync(59_000);
    expect(useUiStore.getState().fileOp).not.toBeNull();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(released()).toBe(true);
    expect(answer('download')).toBe('Ukládání se nedokončilo');
    await vi.waitFor(() => expect(h.download).toHaveBeenCalledTimes(1));
    // další uložení už jde (přímý zápis je pro sezení vypnutý → stažení)
    await saveToFile();
    expect(h.download).toHaveBeenCalledTimes(2);
    expect(released()).toBe(true);
  });

  it('čas otevřeného dialogu aplikace se do limitu nepočítá', async () => {
    vi.useFakeTimers();
    h.write.mockRejectedValueOnce(new Error('disk'));
    const p = saveToFile();
    await vi.waitFor(() => expect(useUiStore.getState().choice).not.toBeNull());
    await vi.advanceTimersByTimeAsync(120_000); // uživatel přemýšlí dvě minuty
    expect(useUiStore.getState().fileOp).not.toBeNull();
    answer('cancel');
    await p;
    expect(released()).toBe(true);
  });

  it('zaseknutý zápis (30 s) skončí chybou s náhradní cestou', async () => {
    vi.useFakeTimers();
    h.write.mockImplementationOnce(() => new Promise(() => undefined));
    const p = saveToFile();
    await vi.waitFor(() => expect(h.write).toHaveBeenCalled()); // šifrování doběhlo, zápis visí
    await vi.advanceTimersByTimeAsync(31_000);
    await vi.waitFor(() => expect(useUiStore.getState().choice).not.toBeNull());
    expect(answer('cancel')).toBe('Zápis do souboru byl zablokován');
    await p;
    expect(released()).toBe(true);
  });

  it('výběr souboru, který se neotevře ani nevrátí (zásady / bezpečnostní software) → stažení a vypnutí přímého zápisu', async () => {
    vi.useFakeTimers();
    setDialogEnv({ onFocus: () => () => undefined, onBlur: () => () => undefined, hasFocus: () => true });
    h.pick.mockImplementationOnce(() => new Promise(() => undefined));
    const p = saveToFile();
    await vi.advanceTimersByTimeAsync(PICKER_OPEN_WAIT_MS + 100);
    await p;
    expect(h.blocked).toBe(true);
    expect(h.download).toHaveBeenCalledTimes(1);
    expect(useUiStore.getState().toasts.map((t) => t.text).join(' ')).toMatch(/nepovoluje přímé ukládání do souborů/);
    expect(released()).toBe(true);
    // zbytek sezení: rovnou stažení, bez výběru souboru
    await saveToFile();
    expect(h.pick).toHaveBeenCalledTimes(1);
    expect(h.download).toHaveBeenCalledTimes(2);
  });

  it('výběr souboru se zavře, ale nevrátí výsledek → po krátké době zaseknutí', async () => {
    vi.useFakeTimers();
    let blur = () => undefined as void;
    let focus = () => undefined as void;
    setDialogEnv({
      onFocus: (cb) => ((focus = cb), () => undefined),
      onBlur: (cb) => ((blur = cb), () => undefined),
      hasFocus: () => false,
    });
    h.pick.mockImplementationOnce(() => new Promise(() => undefined));
    const p = saveToFile();
    await vi.advanceTimersByTimeAsync(10);
    blur(); // otevřel se dialog
    await vi.advanceTimersByTimeAsync(90_000); // uživatel vybírá dlouho – nevadí
    expect(useUiStore.getState().fileOp).not.toBeNull();
    focus(); // dialog zavřen (Storno), ale prohlížeč promise nevyřeší
    await vi.advanceTimersByTimeAsync(5_000);
    await p;
    expect(h.download).toHaveBeenCalledTimes(1);
    expect(released()).toBe(true);
  });

  it('okno bez fokusu a výběr souboru se nikdy neotevře → pojistka 60 s stejně zabere', async () => {
    vi.useFakeTimers();
    setDialogEnv({ onFocus: () => () => undefined, onBlur: () => () => undefined, hasFocus: () => false });
    h.pick.mockImplementationOnce(() => new Promise(() => undefined));
    void saveToFile();
    await vi.advanceTimersByTimeAsync(FILE_OP_TIMEOUT_MS + 2_000);
    expect(released()).toBe(true);
    expect(answer('download')).toBe('Ukládání se nedokončilo');
    await vi.waitFor(() => expect(h.download).toHaveBeenCalledTimes(1));
  });

  it('zásady prohlížeče (SecurityError) → srozumitelné oznámení a stažení', async () => {
    h.pick.mockRejectedValueOnce(new DOMException('Blocked by policy', 'SecurityError'));
    await saveToFile();
    expect(h.blocked).toBe(true);
    expect(h.download).toHaveBeenCalledTimes(1);
    expect(useUiStore.getState().toasts.map((t) => t.text).join(' ')).toMatch(/nepovoluje přímé ukládání/);
    expect(released()).toBe(true);
  });

  it('zápis zakázaný zásadami (NotAllowedError) → stažení bez dalších dotazů', async () => {
    h.write.mockRejectedValueOnce(new DOMException('no', 'NotAllowedError'));
    await saveToFile();
    expect(h.download).toHaveBeenCalledTimes(1);
    expect(useUiStore.getState().choice).toBeNull();
    expect(released()).toBe(true);
  });
});

describe('otevírání – zámek se vždy uvolní', () => {
  it('Storno při otevírání', async () => {
    h.openFsa.mockRejectedValue(new h.UserCancelled());
    await openFromFile();
    expect(released()).toBe(true);
    await openFromFile();
    expect(h.openFsa).toHaveBeenCalledTimes(2);
  });

  it('zakázaný přímý výběr → nabídka obyčejného výběru souboru (<input>)', async () => {
    h.openFsa.mockRejectedValueOnce(new DOMException('no', 'SecurityError'));
    h.openInput.mockRejectedValueOnce(new h.UserCancelled());
    const p = openFromFile();
    await vi.waitFor(() => expect(useUiStore.getState().choice).not.toBeNull());
    expect(answer('pick')).toBe('Výběr souboru');
    await p;
    expect(h.openInput).toHaveBeenCalledTimes(1);
    expect(h.blocked).toBe(true);
    expect(released()).toBe(true);
  });

  it('poškozený soubor → chybový dialog, po zavření zámek uvolněný', async () => {
    h.openFsa.mockResolvedValueOnce({ text: 'nesmysl', name: 'x.mapa', handle: null });
    const p = openFromFile();
    await vi.waitFor(() => expect(useUiStore.getState().choice).not.toBeNull());
    expect(answer('ok')).toBe('Soubor nelze otevřít');
    await p;
    expect(released()).toBe(true);
  });
});

describe('dialogy aplikace se nepřepisují bez odpovědi', () => {
  it('nový dialog vyřeší předchozí jako zrušený', async () => {
    const first = choose({ title: 'A', options: [{ value: 'ok', label: 'OK' }] });
    const second = choose({ title: 'B', options: [{ value: 'ok', label: 'OK' }] });
    await expect(first).resolves.toBeNull();
    expect(answer('ok')).toBe('B');
    await expect(second).resolves.toBe('ok');
  });
  it('totéž pro dialog s heslem', async () => {
    const first = askPassword({ title: 'A', confirmLabel: 'OK' });
    const second = askPassword({ title: 'B', confirmLabel: 'OK' });
    await expect(first).resolves.toBeNull();
    const pw = useUiStore.getState().password!;
    pw.resolve('x');
    await expect(second).resolves.toBe('x');
  });
});
