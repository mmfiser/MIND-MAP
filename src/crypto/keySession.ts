/**
 * Klíče sezení – drží se jen v paměti (nikdy se neukládají).
 *
 * Heslo se po zadání importuje jako nevyexportovatelný PBKDF2 klíč;
 * AES klíče se z něj odvozují pro jednotlivé soli a ukládají do mezipaměti,
 * takže se PBKDF2 (600 000 iterací) spouští jen jednou na sůl za sezení.
 */
import { deriveAesKey, fromBase64, importPassword } from './envelope';

let baseKey: CryptoKey | null = null;
const cache = new Map<string, Promise<CryptoKey>>();

const cacheKey = (saltB64: string, iterations: number) => `${iterations}:${saltB64}`;

export async function startSession(password: string): Promise<void> {
  lockSession();
  baseKey = await importPassword(password);
}

export function hasSession(): boolean {
  return baseKey !== null;
}

export function lockSession(): void {
  baseKey = null;
  cache.clear();
}

/** AES klíč pro danou sůl odvozený z hesla sezení. */
export function keyForSalt(saltB64: string, iterations: number): Promise<CryptoKey> {
  if (!baseKey) return Promise.reject(new Error('Aplikace je zamčená.'));
  const k = cacheKey(saltB64, iterations);
  let p = cache.get(k);
  if (!p) {
    p = deriveAesKey(baseKey, fromBase64(saltB64), iterations);
    cache.set(k, p);
    p.catch(() => cache.delete(k));
  }
  return p;
}

/**
 * Soubor zašifrovaný jiným heslem: odvodí klíč z jiného hesla.
 * Do mezipaměti se uloží až po úspěšném dešifrování (rememberKey),
 * aby se špatným heslem nikdy nešifrovalo.
 */
export async function deriveWithPassword(
  saltB64: string,
  iterations: number,
  password: string,
): Promise<CryptoKey> {
  const pwKey = await importPassword(password);
  return deriveAesKey(pwKey, fromBase64(saltB64), iterations);
}

export function rememberKey(saltB64: string, iterations: number, key: CryptoKey): void {
  cache.set(cacheKey(saltB64, iterations), Promise.resolve(key));
}
