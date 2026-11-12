/**
 * Platformní vstup/výstup souborů.
 *  - Notebook (Chrome/Edge): File System Access API – zápis přímo do souboru.
 *  - Android / ostatní: <input type="file"> pro otevření, Web Share API
 *    (Sdílet → OneDrive) nebo stažení pro uložení.
 */

interface PermissionCapableHandle extends FileSystemFileHandle {
  queryPermission?(d: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(d: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

interface FsaWindow extends Window {
  showOpenFilePicker?(opts?: unknown): Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?(opts?: unknown): Promise<FileSystemFileHandle>;
}

const w = window as FsaWindow;

function isTouchPhone(): boolean {
  return window.matchMedia('(pointer: coarse)').matches && window.matchMedia('(max-width: 900px)').matches;
}

/** File System Access API je k dispozici (a nejsme na telefonu). */
export function hasFileSystemAccess(): boolean {
  return typeof w.showSaveFilePicker === 'function' && typeof w.showOpenFilePicker === 'function' && !isTouchPhone();
}

export class UserCancelled extends Error {
  constructor() {
    super('Zrušeno uživatelem.');
    this.name = 'UserCancelled';
  }
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/** Název souboru bez přípon .mapa / .txt. */
export function baseName(name: string): string {
  return name.replace(/\.txt$/i, '').replace(/\.mapa$/i, '').replace(/\.json$/i, '') || 'mapa';
}

export interface OpenedFile {
  text: string;
  name: string;
  handle: FileSystemFileHandle | null;
}

const FSA_TYPES = [
  {
    description: 'Šifrovaná mapa',
    accept: { 'application/octet-stream': ['.mapa'], 'text/plain': ['.txt'] },
  },
];

/** Otevře soubor. Musí se volat přímo z uživatelské akce (klik). */
export async function openFile(): Promise<OpenedFile> {
  if (hasFileSystemAccess()) {
    try {
      const [handle] = await w.showOpenFilePicker!({ types: FSA_TYPES, excludeAcceptAllOption: false, multiple: false });
      if (!handle) throw new UserCancelled();
      const file = await handle.getFile();
      return { text: await file.text(), name: file.name, handle };
    } catch (e) {
      if (isAbort(e)) throw new UserCancelled();
      throw e;
    }
  }
  const file = await pickWithInput();
  return { text: await file.text(), name: file.name, handle: null };
}

function pickWithInput(): Promise<File> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    // accept záměrně neomezujeme – Android by jinak nemusel nabídnout OneDrive/.txt.
    input.style.display = 'none';
    document.body.appendChild(input);
    const cleanup = () => input.remove();
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      cleanup();
      if (f) resolve(f);
      else reject(new UserCancelled());
    });
    input.addEventListener('cancel', () => {
      cleanup();
      reject(new UserCancelled());
    });
    input.click();
  });
}

/** Vybere cílový soubor pro „Uložit jako“ (notebook). Volat hned z kliknutí. */
export async function pickSaveHandle(suggestedBase: string): Promise<FileSystemFileHandle> {
  try {
    return await w.showSaveFilePicker!({ suggestedName: `${suggestedBase}.mapa`, types: FSA_TYPES });
  } catch (e) {
    if (isAbort(e)) throw new UserCancelled();
    throw e;
  }
}

/** Ověří (případně vyžádá) oprávnění k zápisu do souboru. */
export async function ensureWritePermission(handle: FileSystemFileHandle): Promise<boolean> {
  const h = handle as PermissionCapableHandle;
  if (!h.queryPermission) return true;
  if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  if (!h.requestPermission) return false;
  return (await h.requestPermission({ mode: 'readwrite' })) === 'granted';
}

export async function readHandle(handle: FileSystemFileHandle): Promise<string> {
  const h = handle as PermissionCapableHandle;
  if (h.queryPermission && (await h.queryPermission({ mode: 'read' })) !== 'granted') {
    if (!h.requestPermission || (await h.requestPermission({ mode: 'read' })) !== 'granted') {
      throw new Error('Bez oprávnění ke čtení souboru.');
    }
  }
  return (await handle.getFile()).text();
}

export async function writeHandle(handle: FileSystemFileHandle, text: string): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

/** Android: uloží přes Sdílet (OneDrive…), jinak stažením. Vrací použitou metodu. */
export async function shareOrDownload(text: string, base: string): Promise<'share' | 'download'> {
  const name = `${base}.mapa.txt`;
  const file = new File([text], name, { type: 'text/plain' });
  const nav = navigator as Navigator & { canShare?(d: ShareData): boolean };
  if (typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name });
      return 'share';
    } catch (e) {
      if (isAbort(e)) throw new UserCancelled();
      throw e; // NotAllowedError apod. – volající nabídne nový pokus nebo stažení
    }
  }
  download(text, name);
  return 'download';
}

export function canShareFiles(): boolean {
  const nav = navigator as Navigator & { canShare?(d: ShareData): boolean };
  if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
  try {
    return nav.canShare({ files: [new File(['x'], 'x.txt', { type: 'text/plain' })] });
  } catch {
    return false;
  }
}

export function download(text: string, name: string): void {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
