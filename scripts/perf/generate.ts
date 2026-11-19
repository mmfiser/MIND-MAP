/**
 * Vývojový nástroj: vygeneruje testovací dokument s 1 000 uzly a uloží ho jako
 * ZAŠIFROVANÝ soubor `.mapa.txt` (stejný formát jako aplikace) do scripts/perf/out/.
 * Není součástí aplikace ani nasazení (složka out je v .gitignore, nic se nedává do public/).
 *
 *   npx vite-node scripts/perf/generate.ts
 *
 * Obsah: 15 projektů, hloubka až 5, sdílené uzly, závislosti, souvislosti, milníky,
 * termíny (po termínu, dnes, blíží se, později) a kolize termínů. Pozice uspořádá
 * stejná funkce jako „Uspořádat větev“.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILE_FORMAT, KDF_ITERATIONS, deriveAesKey, encryptJson, importPassword, randomBytes, serializeEnvelope } from '../../src/crypto/envelope';
import { addDays, todayYmd } from '../../src/model/dates';
import { createEdge, createEmptyDocument, createNode } from '../../src/model/factory';
import { layoutBranch } from '../../src/model/layout';
import { toLastWorkingDayOnOrBefore } from '../../src/model/holidays';
import { PROJECT_PALETTE } from '../../src/model/labels';
import type { DocData, MapNode, Priority, Status } from '../../src/model/types';

export const PERF_PASSWORD = 'perf-test-heslo-1000';
const TARGET = 1000;
const PROJECTS = 15;

// Deterministický generátor (stejný dokument při každém spuštění).
let seed = 20261119;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;

const today = todayYmd();
const STATUSES: Status[] = ['new', 'new', 'in_progress', 'in_progress', 'waiting', 'done', 'done', 'cancelled'];
const PRIOS: Priority[] = ['low', 'medium', 'medium', 'high', 'critical'];
const TAGS = ['HW', 'SW', 'nákup', 'revize', 'dokumentace', 'školení', 'IZS', 'kolej'];
const WORDS = ['Objednat', 'Ověřit', 'Připravit', 'Zkontrolovat', 'Nainstalovat', 'Schválit', 'Doplnit', 'Otestovat', 'Předat', 'Revidovat'];
const THINGS = ['kabeláž', 'router', 'rozpočet', 'smlouvu', 'dokumentaci', 'přejezd', 'server', 'školení', 'harmonogram', 'zabezpečení'];

function due(): string | undefined {
  const r = rnd();
  if (r < 0.45) return undefined;
  const offset = r < 0.55 ? -Math.ceil(rnd() * 20) : r < 0.6 ? 0 : r < 0.7 ? Math.ceil(rnd() * 3) : Math.ceil(rnd() * 90);
  return toLastWorkingDayOnOrBefore(addDays(today, offset));
}

const doc = createEmptyDocument('Generátor výkonu');
let data: DocData = { nodes: {}, edges: {} };
let order = 0;
const add = (n: MapNode) => (data.nodes[n.id] = n);
const link = (kind: 'hierarchy' | 'dependency' | 'related', s: string, t: string) => {
  const e = createEdge(kind, s, t, order++);
  data.edges[e.id] = e;
};

const tasksByProject: string[][] = [];
let count = 0;
const perProject = Math.floor((TARGET - PROJECTS) / PROJECTS);
for (let p = 0; p < PROJECTS; p++) {
  const pid = `perf-p${p}`;
  add({
    ...createNode({ id: pid, type: 'project', title: `Projekt ${p + 1} – ${pick(THINGS)}`, color: PROJECT_PALETTE[p % PROJECT_PALETTE.length]!.key }),
    position: { x: (p % 5) * 3200, y: Math.floor(p / 5) * 4200 },
    dueDate: toLastWorkingDayOnOrBefore(addDays(today, 10 + Math.floor(rnd() * 80))),
  });
  count++;
  const ids: string[] = [];
  // strom do hloubky 5: úroveň 1 = 6 úkolů, další úrovně náhodně pod předchozími
  const levels: string[][] = [[pid]];
  let made = 0;
  for (let depth = 1; depth <= 5 && made < perProject; depth++) {
    const level: string[] = [];
    const want = depth === 1 ? 6 : Math.min(perProject - made, Math.round(perProject * [0, 0, 0.3, 0.3, 0.2, 0.2][depth]!));
    for (let i = 0; i < want && made < perProject; i++) {
      const parent = pick(levels[depth - 1]!);
      const id = `${pid}-d${depth}-${i}`;
      const isMs = depth > 1 && rnd() < 0.04;
      add({
        ...createNode({ id, type: isMs ? 'milestone' : 'task', title: `${pick(WORDS)} ${pick(THINGS)} ${p + 1}.${depth}.${i + 1}` }),
        status: isMs ? 'new' : pick(STATUSES),
        priority: isMs ? 'medium' : pick(PRIOS),
        dueDate: due(),
        tags: rnd() < 0.3 ? [pick(TAGS)] : [],
        notes: rnd() < 0.2 ? `Poznámka k úkolu ${p + 1}.${depth}.${i + 1}: ${pick(WORDS).toLowerCase()} ${pick(THINGS)} a ověřit cenu.` : '',
        checklist: rnd() < 0.15 ? [{ id: `${id}-c`, text: `Položka ${pick(THINGS)}`, done: rnd() < 0.5 }] : [],
      });
      link('hierarchy', parent, id);
      level.push(...(isMs ? [] : [id]));
      ids.push(id);
      made++;
      count++;
    }
    levels.push(level.length ? level : levels[depth - 1]!);
  }
  tasksByProject.push(ids);
}
// doplnit do přesně 1 000 uzlů
while (count < TARGET) {
  const p = count % PROJECTS;
  const id = `perf-extra-${count}`;
  add({ ...createNode({ id, type: 'task', title: `Doplňkový úkol ${count}` }), dueDate: due() });
  link('hierarchy', `perf-p${p}`, id);
  tasksByProject[p]!.push(id);
  count++;
}
// sdílené uzly (druhý rodič v jiném projektu), závislosti, souvislosti
for (let i = 0; i < 25; i++) {
  const a = pick(tasksByProject);
  const b = pick(tasksByProject);
  if (a === b) continue;
  const child = pick(a);
  const parent = pick(b);
  if (data.nodes[parent]!.type === 'milestone') continue;
  link('hierarchy', parent, child);
}
for (const ids of tasksByProject) {
  for (let i = 0; i < 6; i++) link('dependency', pick(ids), pick(ids)); // náhodné; cykly odstraní normalizace při načtení
  for (let i = 0; i < 3; i++) link('related', pick(ids), pick(pick(tasksByProject)));
}
// odstranit vazby na sebe (normalizace by je stejně zahodila)
for (const [id, e] of Object.entries(data.edges)) if (e.source === e.target) delete data.edges[id];

// rozmístění: projekty dolů po větvích
for (let p = 0; p < PROJECTS; p++) {
  const r = layoutBranch(data, `perf-p${p}`, 'right');
  const nodes = { ...data.nodes };
  for (const [id, pos] of Object.entries(r.positions)) nodes[id] = { ...nodes[id]!, position: pos };
  data = { nodes, edges: data.edges };
}

const full = { ...doc, nodes: data.nodes, edges: data.edges, meta: { ...doc.meta, revision: 1 } };
const salt = randomBytes(16);
const key = await deriveAesKey(await importPassword(PERF_PASSWORD), salt, KDF_ITERATIONS);
const env = await encryptJson(key, { format: FILE_FORMAT, salt, iterations: KDF_ITERATIONS }, full);
const out = join(dirname(fileURLToPath(import.meta.url)), 'out');
mkdirSync(out, { recursive: true });
const file = join(out, 'perf-1000.mapa.txt');
writeFileSync(file, serializeEnvelope(env));
const nodes = Object.values(full.nodes);
console.log(
  `Hotovo: ${file}\n  uzlů: ${nodes.length} (projektů ${nodes.filter((n) => n.type === 'project').length}, milníků ${nodes.filter((n) => n.type === 'milestone').length})\n  vazeb: ${Object.keys(full.edges).length}\n  heslo: ${PERF_PASSWORD}`,
);
