/** v1.0.1 – jeden zaseknutý zápis pracovní kopie (IndexedDB) nesmí zablokovat další. */
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ writes: 0, hangFirst: true }));
vi.mock('../src/storage/vault', () => ({
  writeVault: () => {
    h.writes++;
    return h.hangFirst && h.writes === 1 ? new Promise(() => undefined) : Promise.resolve();
  },
}));
vi.mock('../src/storage/db', () => ({ saveSettings: () => Promise.resolve() }));

import { AUTOSAVE_TIMEOUT_MS, flushAutosave, startAutosave, stopAutosave } from '../src/storage/persist';
import { createEmptyDocument } from '../src/model/factory';
import { useDocStore } from '../src/store/docStore';
import { useUiStore } from '../src/store/uiStore';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('automatické ukládání do prohlížeče', () => {
  it('zaseknutý zápis po časovém limitu ohlásí chybu a další zápis proběhne', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('document', { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' });
    vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} });
    vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    useDocStore.getState().load(createEmptyDocument('A'), { dirty: false, baseRevision: 0, resetHistory: true });
    startAutosave();

    useDocStore.getState().load(createEmptyDocument('B'), { dirty: true, baseRevision: 0, resetHistory: false });
    const first = flushAutosave();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_TIMEOUT_MS + 100);
    await first; // řetěz se uvolnil
    expect(h.writes).toBe(1);
    expect(useUiStore.getState().toasts.at(-1)?.text).toMatch(/Nepodařilo se uložit data v prohlížeči/);

    useDocStore.getState().load(createEmptyDocument('C'), { dirty: true, baseRevision: 0, resetHistory: false });
    await flushAutosave();
    expect(h.writes).toBe(2);
    await stopAutosave();
  });
});
