/**
 * Šifrovaná lokální kopie: celý MapDocument jako jeden záznam v IndexedDB.
 * Sůl trezoru je v hlavičce záznamu; klíč se odvodí jednou při odemčení.
 */
import {
  KDF_ITERATIONS,
  VAULT_FORMAT,
  decryptJson,
  encryptJson,
  fromBase64,
  parseEnvelope,
  randomBytes,
  toBase64,
} from '../crypto/envelope';
import { keyForSalt, startSession } from '../crypto/keySession';
import { migrateDocument } from '../model/migrations';
import type { MapDocument } from '../model/types';
import { db, readVault } from './db';

let vaultSalt: string | null = null;
let vaultIterations = KDF_ITERATIONS;

/** První spuštění: nastaví heslo a uloží prázdný (nebo zadaný) dokument. */
export async function createVault(password: string, doc: MapDocument): Promise<void> {
  await startSession(password);
  vaultSalt = toBase64(randomBytes(16));
  vaultIterations = KDF_ITERATIONS;
  await writeVault(doc);
}

/**
 * Odemknutí: odvodí klíč a dešifruje dokument.
 * Vyhodí DecryptError při špatném hesle.
 */
export async function unlockVault(password: string): Promise<MapDocument> {
  const rec = await readVault();
  if (!rec) throw new Error('Lokální data nenalezena.');
  const env = parseEnvelope(rec.envelope, VAULT_FORMAT);
  await startSession(password);
  const key = await keyForSalt(env.salt, env.kdf.iterations);
  const raw = await decryptJson(key, env);
  vaultSalt = env.salt;
  vaultIterations = env.kdf.iterations;
  return migrateDocument(raw);
}

/** Zašifruje a uloží dokument (nový IV při každém zápisu). */
export async function writeVault(doc: MapDocument): Promise<void> {
  if (!vaultSalt) throw new Error('Trezor není odemčený.');
  const key = await keyForSalt(vaultSalt, vaultIterations);
  const envelope = await encryptJson(
    key,
    { format: VAULT_FORMAT, salt: fromBase64(vaultSalt), iterations: vaultIterations },
    doc,
  );
  await db.vault.put({ id: 'main', envelope });
}

export function closeVault(): void {
  vaultSalt = null;
}
