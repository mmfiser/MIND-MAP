/**
 * Datový model pro celou aplikaci (všech 5 fází).
 * Ve fázi 1 UI používá jen část polí, ostatní mají výchozí hodnoty.
 */

export const SCHEMA_VERSION = 2;

export type NodeType = 'project' | 'task' | 'milestone';
export type Status = 'new' | 'in_progress' | 'waiting' | 'blocked' | 'done' | 'cancelled';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type EdgeKind = 'hierarchy' | 'dependency' | 'related';

export interface Position {
  x: number;
  y: number;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

/** Informace o smazání do koše (schéma 2). */
export interface TrashInfo {
  /** Jedno smazání = jedna položka v koši (celá větev). */
  batchId: string;
  /** Kořen smazané větve. */
  isRoot: boolean;
  /** Jen u kořene: rodiče v okamžiku smazání. */
  parentIds?: string[];
  /** Jen u kořene: název původního projektu (pro panel Koš). */
  projectTitle?: string;
}

export interface MapNode {
  id: string;
  type: NodeType;
  title: string;
  /** Jedno pole pro poznámky i popis. */
  notes: string;
  /** Barva projektu – klíč z palety (viz labels.ts). */
  color?: string;
  /** Ikona projektu (fáze 2). */
  icon?: string;
  /** Vlastní barva rámečku (sdílené uzly); bez ní se použije výchozí. */
  borderColor?: string;
  status: Status;
  priority: Priority;
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 – poslední změna uzlu (pro budoucí slučování). */
  updatedAt: string;
  /** ISO datum (YYYY-MM-DD) */
  startDate?: string;
  dueDate?: string;
  tags: string[];
  checklist: ChecklistItem[];
  position: Position;
  /** Sbalená větev (fáze 3). */
  collapsed: boolean;
  /** Zamčená pozice (fáze 5). */
  positionLocked?: boolean;
  /** Koš – ISO 8601, pokud je uzel v koši. */
  deletedAt?: string;
  /** Koš – ke které položce koše uzel patří. */
  trash?: TrashInfo;
}

export interface MapEdge {
  id: string;
  kind: EdgeKind;
  /** hierarchy: rodič, dependency: blokující uzel, related: libovolný */
  source: string;
  /** hierarchy: potomek, dependency: blokovaný uzel, related: libovolný */
  target: string;
  /** Pořadí mezi sourozenci pod stejným rodičem (jen hierarchy). */
  order: number;
  /** ISO 8601 – určuje mj. „nejstarší“ rodičovskou vazbu. */
  createdAt: string;
}

export interface DocMeta {
  schemaVersion: number;
  /** Stálé ID mapy – pozná, že soubor patří ke stejné mapě. */
  docId: string;
  /** Zvyšuje se při každém uložení do souboru. */
  revision: number;
  /** ISO 8601 – poslední změna dat. */
  updatedAt: string;
  /** Zařízení, které data naposledy změnilo. */
  deviceName: string;
}

/** Data, která pokrývá historie Zpět/Znovu. */
export interface DocData {
  nodes: Record<string, MapNode>;
  edges: Record<string, MapEdge>;
}

export interface MapDocument extends DocData {
  meta: DocMeta;
}

/** Výsledek operace nad daty – buď nová data, nebo česky popsaný důvod odmítnutí. */
export type OpResult<T = DocData> = { ok: true; data: T } | { ok: false; reason: string };
