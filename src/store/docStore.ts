/**
 * Stav dokumentu + historie Zpět/Znovu.
 * Historie pokrývá jen data (uzly a vazby), ne metadata, výběr ani viewport.
 */
import { create } from 'zustand';
import { nowIso } from '../model/factory';
import type { DocData, MapDocument, OpResult } from '../model/types';

const HISTORY_LIMIT = 200;
/** Úpravy se stejným klíčem během této doby se sloučí do jednoho kroku historie. */
const COALESCE_MS = 1500;

type Op = (data: DocData) => OpResult | DocData;

export interface ApplyOptions {
  /** Např. `title:<id>` – psaní do pole netvoří krok za každé písmeno. */
  coalesceKey?: string;
}

interface DocState {
  doc: MapDocument | null;
  past: DocData[];
  future: DocData[];
  lastCommit: { key?: string; at: number };
  /** Změny neuložené do souboru. */
  dirty: boolean;
  /** Revize souboru, ze které pracovní kopie vychází. */
  baseRevision: number;
  deviceName: string;

  load(doc: MapDocument, opts: { dirty: boolean; baseRevision: number; resetHistory: boolean }): void;
  unload(): void;
  apply(op: Op, opts?: ApplyOptions): OpResult;
  undo(): void;
  redo(): void;
  setDeviceName(name: string): void;
  /** Po úspěšném uložení do souboru. */
  markSaved(revision: number, saved: DocData): void;
  /** Ponechání pracovní kopie při konfliktu – navázat na revizi souboru. */
  rebase(revision: number): void;
}

const isResult = (r: OpResult | DocData): r is OpResult => 'ok' in r;

function touch(doc: MapDocument, data: DocData, deviceName: string): MapDocument {
  return {
    meta: { ...doc.meta, updatedAt: nowIso(), deviceName: deviceName || doc.meta.deviceName },
    nodes: data.nodes,
    edges: data.edges,
  };
}

export const useDocStore = create<DocState>()((set, get) => ({
  doc: null,
  past: [],
  future: [],
  lastCommit: { at: 0 },
  dirty: false,
  baseRevision: 0,
  deviceName: '',

  load(doc, { dirty, baseRevision, resetHistory }) {
    set((s) => ({
      doc,
      dirty,
      baseRevision,
      past: resetHistory ? [] : s.past,
      future: resetHistory ? [] : s.future,
      lastCommit: { at: 0 },
    }));
  },

  unload() {
    set({ doc: null, past: [], future: [], lastCommit: { at: 0 }, dirty: false });
  },

  apply(op, opts) {
    const { doc, past, lastCommit, deviceName } = get();
    if (!doc) return { ok: false, reason: 'Dokument není načtený.' };
    const prev: DocData = { nodes: doc.nodes, edges: doc.edges };
    const r = op(prev);
    const res: OpResult = isResult(r) ? r : { ok: true, data: r };
    if (!res.ok) return res;
    if (res.data.nodes === prev.nodes && res.data.edges === prev.edges) return res;
    const now = Date.now();
    const coalesce =
      !!opts?.coalesceKey && lastCommit.key === opts.coalesceKey && now - lastCommit.at < COALESCE_MS;
    const nextPast = coalesce ? past : [...past, prev].slice(-HISTORY_LIMIT);
    set({
      doc: touch(doc, res.data, deviceName),
      past: nextPast,
      future: [],
      dirty: true,
      lastCommit: { key: opts?.coalesceKey, at: now },
    });
    return res;
  },

  undo() {
    const { doc, past, future, deviceName } = get();
    if (!doc || !past.length) return;
    const prev = past[past.length - 1]!;
    set({
      doc: touch(doc, prev, deviceName),
      past: past.slice(0, -1),
      future: [...future, { nodes: doc.nodes, edges: doc.edges }],
      dirty: true,
      lastCommit: { at: 0 },
    });
  },

  redo() {
    const { doc, past, future, deviceName } = get();
    if (!doc || !future.length) return;
    const next = future[future.length - 1]!;
    set({
      doc: touch(doc, next, deviceName),
      past: [...past, { nodes: doc.nodes, edges: doc.edges }],
      future: future.slice(0, -1),
      dirty: true,
      lastCommit: { at: 0 },
    });
  },

  setDeviceName(name) {
    set({ deviceName: name });
  },

  markSaved(revision, saved) {
    const { doc } = get();
    if (!doc) return;
    // Pokud se během ukládání data změnila, zůstávají neuložená.
    const unchanged = doc.nodes === saved.nodes && doc.edges === saved.edges;
    set({
      doc: { ...doc, meta: { ...doc.meta, revision } },
      baseRevision: revision,
      dirty: !unchanged,
    });
  },

  rebase(revision) {
    const { doc } = get();
    if (!doc) return;
    set({ doc: { ...doc, meta: { ...doc.meta, revision } }, baseRevision: revision, dirty: true });
  },
}));
