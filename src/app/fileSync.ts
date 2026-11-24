/**
 * Uložení do šifrovaného souboru a otevření souboru (včetně kontroly verzí).
 * Soubor používá stejné heslo jako lokální data; sůl souboru se pamatuje,
 * takže se při dalších uloženích mění jen IV a klíč se neodvozuje znovu.
 */
import {
  DecryptError,
  EnvelopeFormatError,
  FILE_FORMAT,
  KDF_ITERATIONS,
  decryptJson,
  encryptJson,
  fromBase64,
  parseEnvelope,
  randomBytes,
  serializeEnvelope,
  toBase64,
  type Envelope,
} from '../crypto/envelope';
import { deriveWithPassword, keyForSalt, rememberKey } from '../crypto/keySession';
import { MigrationError, migrateDocument } from '../model/migrations';
import { checkForUpdateNow } from './updates';
import { decideOnOpen, nextRevision } from '../model/sync';
import type { MapDocument } from '../model/types';
import {
  UserCancelled,
  baseName,
  blockFileSystemAccess,
  ensureWritePermission,
  hasFileSystemAccess,
  isFileSystemAccessBlocked,
  isPolicyBlock,
  openFileFsa,
  openFileInput,
  pickSaveHandle,
  readHandle,
  shareOrDownload,
  download,
  writeHandle,
  type OpenedFile,
} from '../storage/fileIO';
import { StepTimeoutError, debugLog, withTimeout } from '../lib/async';
import {
  FILE_OP_TIMEOUT_MS,
  PICKER_STUCK_GRACE_MS,
  PickerStuckError,
  STORE_TIMEOUT_MS,
  WRITE_TIMEOUT_MS,
  nativeDialog,
  runFileOp,
} from './fileOps';
import { flushAutosave } from '../storage/persist';
import { useDocStore } from '../store/docStore';
import { askPassword, choose, toast, useUiStore } from '../store/uiStore';
import { notifyDateConflicts, notifyMigrationReport } from './dateCheck';
import { getSettings, updateSettings } from './session';

const fmt = new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'medium', timeStyle: 'medium' });
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : fmt.format(d);
};

function versionRows(doc: MapDocument, extra?: [string, string][]): [string, string][] {
  return [
    ['Poslední změna', fmtDate(doc.meta.updatedAt)],
    ['Zařízení', doc.meta.deviceName || '—'],
    ['Revize', String(doc.meta.revision)],
    ['Počet uzlů', String(Object.values(doc.nodes).filter((n) => !n.deletedAt).length)],
    ...(extra ?? []),
  ];
}

async function showError(title: string, message: string): Promise<void> {
  await choose({ title, message, options: [{ value: 'ok', label: 'Rozumím', variant: 'primary' }] });
}

/**
 * Dešifruje obálku souboru. Nejdřív zkusí heslo sezení; když nesedí,
 * nabídne zadání hesla k tomuto souboru. Vrací null při zrušení.
 */
async function decryptFileEnvelope(env: Envelope): Promise<unknown | null> {
  try {
    return await decryptJson(await keyForSalt(env.salt, env.kdf.iterations), env);
  } catch (e) {
    if (!(e instanceof DecryptError)) throw e;
  }
  let error: string | undefined;
  for (;;) {
    const pw = await askPassword({
      title: 'Heslo k souboru',
      message:
        'Soubor nejde odemknout heslem této aplikace. Buď je zašifrovaný jiným heslem, nebo je poškozený. Zadejte heslo k souboru.',
      confirmLabel: 'Odemknout soubor',
      error,
    });
    if (pw === null) return null;
    useUiStore.getState().set({ busy: 'Odemykám soubor…' });
    try {
      const key = await deriveWithPassword(env.salt, env.kdf.iterations, pw);
      const raw = await decryptJson(key, env);
      rememberKey(env.salt, env.kdf.iterations, key);
      return raw;
    } catch (e) {
      if (!(e instanceof DecryptError)) throw e;
      error = e.message;
    } finally {
      useUiStore.getState().set({ busy: null });
    }
  }
}

async function adoptFile(name: string, handle: FileSystemFileHandle | null, env: Envelope): Promise<void> {
  const fileName = baseName(name);
  useUiStore.getState().set({ fileName });
  try {
    await withTimeout(
      updateSettings({ fileName, fileHandle: handle, fileSalt: env.salt, fileIterations: env.kdf.iterations }),
      STORE_TIMEOUT_MS,
      'uložení nastavení',
    );
  } catch (e) {
    // Bez zapamatovaného odkazu na soubor – při ukládání se soubor vybere znovu.
    debugLog('otevřít: nastavení se nepodařilo uložit', e instanceof Error ? e.name : typeof e);
  }
}

function loadFromFile(fileDoc: MapDocument): void {
  useDocStore.getState().load(fileDoc, {
    dirty: false,
    baseRevision: fileDoc.meta.revision,
    resetHistory: true, // po otevření souboru se historie Zpět/Znovu maže
  });
  useUiStore.getState().set({ selectedId: null, detailOpen: false });
  useUiStore.getState().fitAll();
  notifyMigrationReport(fileDoc);
  notifyDateConflicts(fileDoc);
}

const POLICY_SAVE_MSG = 'Prohlížeč na tomto počítači nepovoluje přímé ukládání do souborů – soubor se stáhne do Stažených souborů.';
const POLICY_OPEN_MSG =
  'Prohlížeč na tomto počítači nepovoluje přímý výběr souboru (zásady nebo bezpečnostní software). Soubor vyberte obyčejným výběrem souboru.';

/** Má aplikace kvůli této chybě přejít na stahování / <input> pro zbytek sezení? */
function isFsaBroken(e: unknown): boolean {
  return isPolicyBlock(e) || e instanceof PickerStuckError || e instanceof StepTimeoutError;
}

function disableFsa(reason: unknown): void {
  if (!isFileSystemAccessBlocked()) {
    debugLog('File System Access vypnuto pro toto sezení:', reason instanceof Error ? reason.name : typeof reason);
    blockFileSystemAccess();
  }
}

const isTouch = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

/** Výběr souboru k otevření s hlídáním zaseknutí a náhradní cestou přes <input>. */
async function pickFileToOpen(): Promise<OpenedFile | null> {
  if (hasFileSystemAccess()) {
    try {
      return await nativeDialog(() => openFileFsa(), 'otevřít: výběr souboru');
    } catch (e) {
      if (e instanceof UserCancelled) return null;
      if (!isFsaBroken(e)) throw e;
      disableFsa(e);
      // Nová uživatelská akce (klik v dialogu) – <input type=file> potřebuje kliknutí.
      const r = await choose({
        title: 'Výběr souboru',
        message: POLICY_OPEN_MSG,
        options: [
          { value: 'cancel', label: 'Zrušit' },
          { value: 'pick', label: 'Vybrat soubor', variant: 'primary' },
        ],
      });
      if (r !== 'pick') return null;
    }
  }
  try {
    // <input type=file>: starší prohlížeče při zrušení nevyšlou „cancel“ – návrat fokusu bez výběru = zrušení.
    return await nativeDialog(() => openFileInput(), 'otevřít: výběr souboru (input)', {
      openWithinMs: null,
      graceMs: isTouch() ? 20_000 : PICKER_STUCK_GRACE_MS,
      onStuck: 'cancel',
      cancelError: () => new UserCancelled(),
    });
  } catch (e) {
    if (e instanceof UserCancelled) return null;
    throw e;
  }
}

/** „Otevřít soubor“ – volat přímo z kliknutí (kvůli výběru souboru). */
export function openFromFile(): Promise<void> {
  debugLog('otevřít: klik');
  return runFileOp('open', openFromFileInner, () => {
    void showError(
      'Otevření se nedokončilo',
      'Otevírání souboru trvalo déle než minutu, nejspíš ho blokuje prohlížeč nebo bezpečnostní software. Zkuste to znovu.',
    );
  });
}

async function openFromFileInner(): Promise<void> {
  let opened: OpenedFile | null;
  try {
    opened = await pickFileToOpen();
  } catch (e) {
    console.error(e);
    return showError('Soubor nelze otevřít', 'Soubor se nepodařilo načíst.');
  }
  if (!opened) {
    debugLog('otevřít: zrušeno');
    return;
  }
  debugLog('otevřít: soubor vybrán');

  let env: Envelope;
  try {
    env = parseEnvelope(opened.text, FILE_FORMAT);
  } catch (e) {
    return showError('Soubor nelze otevřít', e instanceof EnvelopeFormatError ? e.message : 'Neplatný soubor.');
  }

  let fileDoc: MapDocument;
  useUiStore.getState().set({ busy: 'Dešifruji soubor…' });
  try {
    const raw = await decryptFileEnvelope(env);
    if (raw === null) return;
    fileDoc = migrateDocument(raw);
  } catch (e) {
    if (e instanceof MigrationError && e.code === 'newer') {
      const r = await choose({
        title: 'Soubor nelze otevřít',
        message: e.message,
        options: [
          { value: 'close', label: 'Zavřít' },
          { value: 'update', label: 'Zkontrolovat aktualizaci', variant: 'primary' },
        ],
      });
      if (r === 'update') void checkForUpdateNow();
      return;
    }
    if (e instanceof MigrationError || e instanceof DecryptError) {
      return showError('Soubor nelze otevřít', e.message);
    }
    console.error(e);
    return showError('Soubor nelze otevřít', 'Soubor je poškozený.');
  } finally {
    useUiStore.getState().set({ busy: null });
  }

  const { doc, dirty, baseRevision } = useDocStore.getState();
  if (!doc) return;
  const decision = decideOnOpen({
    localDocId: doc.meta.docId,
    localIsEmpty: Object.keys(doc.nodes).length === 0,
    dirty,
    baseRevision,
    fileDocId: fileDoc.meta.docId,
    fileRevision: fileDoc.meta.revision,
  });

  if (decision === 'load') {
    loadFromFile(fileDoc);
    await adoptFile(opened.name, opened.handle, env);
    toast(`Otevřeno: ${opened.name}`, 'success');
    return;
  }

  const localRows = versionRows(doc, [['Neuložené změny', dirty ? 'ano' : 'ne']]);
  const fileRows = versionRows(fileDoc);

  if (decision === 'other-doc') {
    const r = await choose({
      title: 'Soubor obsahuje jinou mapu',
      message:
        'Otevíraný soubor nepatří k mapě, kterou máte v prohlížeči. Pokud ho otevřete, pracovní kopie v prohlížeči bude nahrazena. Neuložené změny se ztratí.',
      details: [
        { label: 'Pracovní kopie v prohlížeči', rows: localRows },
        { label: `Soubor „${opened.name}“`, rows: fileRows },
      ],
      options: [
        { value: 'cancel', label: 'Zrušit' },
        { value: 'replace', label: 'Nahradit mapou ze souboru', variant: 'danger' },
      ],
    });
    if (r !== 'replace') return;
    loadFromFile(fileDoc);
    await adoptFile(opened.name, opened.handle, env);
    toast('Mapa ze souboru otevřena.', 'success');
    return;
  }

  const r = await choose({
    title: decision === 'conflict-both' ? 'Změny v souboru i v prohlížeči' : 'Soubor je starší než pracovní kopie',
    message:
      decision === 'conflict-both'
        ? 'Soubor byl mezitím uložen z jiného zařízení a zároveň máte v prohlížeči neuložené změny. Vyberte, kterou verzi ponechat. Druhá se zahodí.'
        : 'Pracovní kopie v prohlížeči je novější než otevíraný soubor. Vyberte, kterou verzi ponechat.',
    details: [
      { label: 'Pracovní kopie v prohlížeči', rows: localRows },
      { label: `Soubor „${opened.name}“`, rows: fileRows },
    ],
    options: [
      { value: 'cancel', label: 'Zrušit' },
      { value: 'local', label: 'Ponechat pracovní kopii' },
      { value: 'file', label: 'Ponechat verzi ze souboru', variant: 'primary' },
    ],
  });
  if (r === 'file') {
    loadFromFile(fileDoc);
    await adoptFile(opened.name, opened.handle, env);
    toast('Načtena verze ze souboru.', 'success');
  } else if (r === 'local') {
    // Pracovní kopie se naváže na revizi souboru – další uložení soubor přepíše.
    useDocStore.getState().rebase(Math.max(fileDoc.meta.revision, baseRevision));
    await adoptFile(opened.name, opened.handle, env);
    toast('Ponechána pracovní kopie. Uložte ji do souboru.', 'info');
  }
}

/**
 * Notebook: před přepsáním zkontroluje, jestli soubor mezitím neuložilo
 * jiné zařízení. Vrací false, pokud uživatel ukládání zrušil.
 */
async function checkRemoteBeforeOverwrite(handle: FileSystemFileHandle): Promise<boolean> {
  const { doc, baseRevision } = useDocStore.getState();
  if (!doc) return false;
  let remote: MapDocument;
  try {
    const text = await withTimeout(readHandle(handle), WRITE_TIMEOUT_MS, 'čtení souboru před přepsáním');
    if (!text.trim()) return true;
    const env = parseEnvelope(text, FILE_FORMAT);
    remote = migrateDocument(await decryptJson(await keyForSalt(env.salt, env.kdf.iterations), env));
  } catch {
    return true; // nečitelný/jiný obsah – přepsání potvrdil uživatel výběrem souboru
  }
  if (remote.meta.docId === doc.meta.docId && remote.meta.revision <= baseRevision) return true;
  const other = remote.meta.docId !== doc.meta.docId;
  const r = await choose({
    title: other ? 'Soubor obsahuje jinou mapu' : 'Soubor byl mezitím změněn',
    message: other
      ? 'V souboru je uložená jiná mapa. Uložením ji přepíšete.'
      : 'Soubor mezitím uložilo jiné zařízení. Uložením jeho změny přepíšete.',
    details: [
      { label: 'Pracovní kopie v prohlížeči', rows: versionRows(doc) },
      { label: 'Soubor', rows: versionRows(remote) },
    ],
    options: [
      { value: 'cancel', label: 'Zrušit' },
      { value: 'overwrite', label: 'Přepsat soubor', variant: 'danger' },
    ],
  });
  return r === 'overwrite';
}

/** Zašifruje aktuální dokument pro soubor (stejná sůl jako minule, nový IV). */
async function encryptCurrent() {
  const settings = getSettings();
  let salt = settings.fileSalt;
  let iterations = settings.fileIterations ?? KDF_ITERATIONS;
  if (!salt || iterations < KDF_ITERATIONS) {
    salt = toBase64(randomBytes(16));
    iterations = KDF_ITERATIONS;
  }
  const key = await keyForSalt(salt, iterations);
  const { doc, baseRevision, deviceName } = useDocStore.getState();
  if (!doc) return null;
  const revision = nextRevision(doc.meta.revision, baseRevision);
  const toSave: MapDocument = {
    meta: { ...doc.meta, revision, deviceName: deviceName || doc.meta.deviceName },
    nodes: doc.nodes,
    edges: doc.edges,
  };
  const env = await encryptJson(key, { format: FILE_FORMAT, salt: fromBase64(salt), iterations }, toSave);
  return { text: serializeEnvelope(env), revision, toSave, salt, iterations };
}

/** Uložení nastavení po zápisu – nesmí zaseknout ukládání (IndexedDB, FileSystemFileHandle). */
async function rememberSaved(fileName: string, handle: FileSystemFileHandle | null, salt: string, iterations: number): Promise<void> {
  try {
    await withTimeout(updateSettings({ fileName, fileHandle: handle, fileSalt: salt, fileIterations: iterations }), STORE_TIMEOUT_MS, 'uložení nastavení');
  } catch (e) {
    debugLog('uložit: nastavení se nepodařilo uložit', e instanceof Error ? e.name : typeof e);
    // Bez odkazu na soubor (nejde-li uložit do IndexedDB) – příště se soubor vybere znovu.
    try {
      await withTimeout(updateSettings({ fileName, fileHandle: null, fileSalt: salt, fileIterations: iterations }), STORE_TIMEOUT_MS, 'uložení nastavení');
    } catch {
      /* nevadí – soubor je uložený */
    }
  }
  try {
    await withTimeout(flushAutosave(), STORE_TIMEOUT_MS, 'zápis pracovní kopie');
  } catch (e) {
    debugLog('uložit: pracovní kopie se nezapsala včas', e instanceof Error ? e.name : typeof e);
  }
}

/** Náhradní cesta: stáhnout zašifrovaný soubor (Stažené soubory). */
async function downloadCurrent(reason?: string): Promise<boolean> {
  const enc = await encryptCurrent();
  if (!enc) return false;
  const fileName = getSettings().fileName || 'mapa';
  download(enc.text, `${fileName}.mapa.txt`);
  debugLog('uložit: staženo');
  useDocStore.getState().markSaved(enc.revision, { nodes: enc.toSave.nodes, edges: enc.toSave.edges });
  await rememberSaved(fileName, null, enc.salt, enc.iterations);
  toast(reason ?? `Soubor „${fileName}.mapa.txt“ je ve Stažených souborech – přesuňte ho na OneDrive.`, 'info');
  return true;
}

/** Ukládání trvalo přes minutu: zámek je uvolněný, nabídni stažení. */
async function offerDownloadAfterTimeout(): Promise<void> {
  const r = await choose({
    title: 'Ukládání se nedokončilo',
    message:
      'Ukládání trvá déle než minutu – nejspíš ho blokuje prohlížeč nebo bezpečnostní software. Data v prohlížeči jsou v pořádku. ' +
      'Soubor si můžete stáhnout do Stažených souborů a přesunout ho na OneDrive.',
    options: [
      { value: 'cancel', label: 'Zavřít' },
      { value: 'download', label: 'Stáhnout soubor', variant: 'primary' },
    ],
  });
  if (r === 'download') {
    disableFsa(new StepTimeoutError('ukládání', FILE_OP_TIMEOUT_MS));
    await downloadCurrent();
  }
}

/** „Uložit“ / „Uložit jako“. Volat přímo z kliknutí. */
export function saveToFile(saveAs = false): Promise<void> {
  debugLog('uložit: klik', saveAs ? '(uložit jako)' : '');
  return runFileOp('save', () => saveToFileInner(saveAs), () => void offerDownloadAfterTimeout());
}

async function saveToFileInner(saveAs: boolean): Promise<void> {
  if (!useDocStore.getState().doc) return;
  const ui = useUiStore.getState();
  const settings = getSettings();
  try {
    let fsa = hasFileSystemAccess();
    debugLog('uložit: přímý zápis do souboru', fsa ? 'ano' : 'ne');
    let handle: FileSystemFileHandle | null = null;
    let fileName = settings.fileName || 'mapa';

    if (fsa) {
      try {
        if (saveAs || !settings.fileHandle) {
          handle = await nativeDialog(() => pickSaveHandle(fileName), 'uložit: výběr souboru');
          fileName = baseName(handle.name);
        } else {
          handle = settings.fileHandle;
          // Žádost o oprávnění je malá bublina prohlížeče (bez ztráty fokusu) – hlídá ji jen časový limit.
          const ok = await withTimeout(
            nativeDialog(() => ensureWritePermission(handle!), 'uložit: oprávnění k zápisu', { openWithinMs: null }),
            WRITE_TIMEOUT_MS * 2,
            'oprávnění k zápisu',
          );
          if (!ok) {
            debugLog('uložit: oprávnění zamítnuto');
            toast('Bez oprávnění k zápisu do souboru. Zkuste „Uložit jako“.', 'error');
            return;
          }
          if (!(await checkRemoteBeforeOverwrite(handle))) {
            debugLog('uložit: zrušeno (soubor změněn jinde)');
            return;
          }
        }
      } catch (e) {
        if (e instanceof UserCancelled) {
          debugLog('uložit: zrušeno');
          return;
        }
        if (!isFsaBroken(e)) throw e;
        disableFsa(e);
        toast(POLICY_SAVE_MSG, 'info');
        fsa = false;
        handle = null;
      }
    }

    ui.set({ busy: 'Šifruji…' });
    debugLog('uložit: šifruji');
    const enc = await encryptCurrent();
    if (!enc) return;

    if (handle) {
      ui.set({ busy: 'Zapisuji…' });
      debugLog('uložit: zapisuji');
      const r = await writeWithFallback(handle, enc.text, fileName);
      if (!r) return;
      handle = r.handle;
      if (handle) fileName = baseName(handle.name);
    } else if (!isTouch()) {
      // Notebook bez přímého zápisu: stažení (sdílecí okno systému by tu jen mátlo).
      ui.set({ busy: null });
      download(enc.text, `${fileName}.mapa.txt`);
      debugLog('uložit: staženo');
      if (!fsa && !isFileSystemAccessBlocked()) {
        await choose({
          title: 'Soubor je ve Stažených souborech',
          message:
            `Tento prohlížeč neumí ukládat přímo do zvolené složky, proto se soubor „${fileName}.mapa.txt“ stáhl do složky Stažené soubory. ` +
            'Přesuňte ho do OneDrive. Pro přímé ukládání na OneDrive otevřete aplikaci v Google Chrome nebo Microsoft Edge.',
          options: [{ value: 'ok', label: 'Rozumím', variant: 'primary' }],
        });
      }
    } else {
      ui.set({ busy: null });
      const ok = await shareWithRetry(enc.text, fileName);
      if (!ok) return;
    }

    useDocStore.getState().markSaved(enc.revision, { nodes: enc.toSave.nodes, edges: enc.toSave.edges });
    ui.set({ fileName, busy: 'Dokončuji…' });
    await rememberSaved(fileName, handle, enc.salt, enc.iterations);
    debugLog('uložit: hotovo');
    toast(handle ? `Uloženo do „${handle.name}“.` : 'Soubor předán k uložení.', 'success');
  } catch (e) {
    if (e instanceof UserCancelled) return;
    console.error(e);
    ui.set({ busy: null });
    await showError('Uložení se nepodařilo', `Data v prohlížeči zůstávají v pořádku. Podrobnosti: ${describeError(e)}`);
  }
}

function describeError(e: unknown): string {
  if (e instanceof DOMException || e instanceof Error) return `${e.name}: ${e.message}`;
  return String(e);
}

/**
 * Notebook: zápis do souboru. Když zápis zablokuje antivirus (např. ochrana
 * složek proti ransomwaru), zásady prohlížeče nebo se zasekne, nabídne uložení
 * jinam nebo stažení. Vrací použitý handle (null = staženo), nebo null při zrušení.
 */
async function writeWithFallback(
  handle: FileSystemFileHandle,
  text: string,
  fileName: string,
): Promise<{ handle: FileSystemFileHandle | null } | null> {
  let current = handle;
  for (;;) {
    try {
      await withTimeout(writeHandle(current, text), WRITE_TIMEOUT_MS, 'zápis do souboru');
      return { handle: current };
    } catch (e) {
      console.error(e);
      useUiStore.getState().set({ busy: null });
      if (isPolicyBlock(e)) {
        // Zásady prohlížeče zápis zakazují – další pokusy nemají smysl.
        disableFsa(e);
        download(text, `${fileName}.mapa.txt`);
        toast(POLICY_SAVE_MSG, 'info');
        return { handle: null };
      }
      const r = await choose({
        title: 'Zápis do souboru byl zablokován',
        message:
          `Prohlížeč nemohl zapsat do „${current.name}“. Nejčastěji to blokuje antivirus (ochrana složek / ransomware štít) ` +
          `nebo synchronizace OneDrive. Data v prohlížeči jsou v pořádku. Podrobnosti: ${describeError(e)}`,
        options: [
          { value: 'cancel', label: 'Zrušit' },
          { value: 'download', label: 'Stáhnout soubor' },
          { value: 'other', label: 'Uložit jinam…', variant: 'primary' },
        ],
      });
      if (r === 'download') {
        download(text, `${fileName}.mapa.txt`);
        toast('Soubor je ve složce Stažené soubory – přesuňte ho na OneDrive.', 'info');
        return { handle: null };
      }
      if (r !== 'other') return null;
      try {
        current = await nativeDialog(() => pickSaveHandle(fileName), 'uložit: výběr jiného souboru');
      } catch (err) {
        if (err instanceof UserCancelled) return null;
        if (isFsaBroken(err)) {
          disableFsa(err);
          download(text, `${fileName}.mapa.txt`);
          toast(POLICY_SAVE_MSG, 'info');
          return { handle: null };
        }
        throw err;
      }
      useUiStore.getState().set({ busy: 'Zapisuji…' });
    }
  }
}

/**
 * Android: Sdílet → OneDrive. Když prohlížeč sdílení odmítne (např. vypršela
 * uživatelská akce během šifrování), nabídne nový pokus nebo stažení.
 */
async function shareWithRetry(text: string, fileName: string): Promise<boolean> {
  try {
    const method = await shareOrDownload(text, fileName);
    if (method === 'download' && !window.matchMedia('(pointer: coarse)').matches) {
      // Prohlížeč bez File System Access API (např. Firefox, vestavěné prohlížeče) – nejde vybrat složku.
      await choose({
        title: 'Soubor je ve Stažených souborech',
        message:
          `Tento prohlížeč neumí ukládat přímo do zvolené složky, proto se soubor „${fileName}.mapa.txt“ stáhl do složky Stažené soubory. ` +
          'Přesuňte ho do OneDrive. Pro přímé ukládání na OneDrive otevřete aplikaci v Google Chrome nebo Microsoft Edge.',
        options: [{ value: 'ok', label: 'Rozumím', variant: 'primary' }],
      });
    }
    return true;
  } catch (e) {
    if (e instanceof UserCancelled) return false;
    for (;;) {
      const r = await choose({
        title: 'Uložit soubor',
        message: 'Soubor je připravený. Klepněte na „Sdílet“ a vyberte OneDrive, nebo ho stáhněte.',
        options: [
          { value: 'cancel', label: 'Zrušit' },
          { value: 'download', label: 'Stáhnout' },
          { value: 'share', label: 'Sdílet', variant: 'primary' },
        ],
      });
      if (r === 'download') {
        download(text, `${fileName}.mapa.txt`);
        return true;
      }
      if (r !== 'share') return false;
      try {
        await shareOrDownload(text, fileName);
        return true;
      } catch (err) {
        if (err instanceof UserCancelled) return false;
      }
    }
  }
}
