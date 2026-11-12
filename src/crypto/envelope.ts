/**
 * Šifrovaná obálka: JSON s nešifrovanou hlavičkou a šifrovaným obsahem.
 * AES-GCM 256, klíč z hesla přes PBKDF2-SHA-256.
 * Hlavička se používá jako AAD – její změna způsobí selhání dešifrování.
 */

export const KDF_ITERATIONS = 600_000;
export const FILE_FORMAT = 'mapa-encrypted';
export const VAULT_FORMAT = 'mapa-vault';
export const ENVELOPE_VERSION = 1;

export interface EnvelopeHeader {
  format: string;
  version: number;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number };
  cipher: { name: 'AES-GCM'; keyLength: 256; tagLength: 128 };
  /** base64, 16 B */
  salt: string;
  /** base64, 12 B */
  iv: string;
}

export interface Envelope extends EnvelopeHeader {
  /** base64 */
  ciphertext: string;
}

/** Soubor nemá formát šifrované mapy (není to JSON, chybí pole, neznámá verze). */
export class EnvelopeFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvelopeFormatError';
  }
}

/** Dešifrování selhalo – špatné heslo nebo poškozená data (nelze odlišit). */
export class DecryptError extends Error {
  constructor(message = 'Nesprávné heslo nebo poškozený soubor.') {
    super(message);
    this.name = 'DecryptError';
  }
}

// ---------- base64 ----------

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n));
}

// ---------- klíče ----------

/**
 * Importuje heslo jako nevyexportovatelný základní klíč PBKDF2.
 * Z něj lze odvodit AES klíč pro libovolnou sůl, aniž by se heslo
 * drželo v paměti jako text.
 */
export function importPassword(password: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
}

export function deriveAesKey(
  baseKey: CryptoKey,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number = KDF_ITERATIONS,
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ---------- obálka ----------

/** Kanonická serializace hlavičky pro AAD (pevné pořadí polí). */
function headerAad(h: EnvelopeHeader): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(
    JSON.stringify([
      h.format,
      h.version,
      h.kdf.name,
      h.kdf.hash,
      h.kdf.iterations,
      h.cipher.name,
      h.cipher.keyLength,
      h.cipher.tagLength,
      h.salt,
      h.iv,
    ]),
  );
}

/** Zašifruje JSON-serializovatelná data. Pro každé volání se generuje nový IV. */
export async function encryptJson(
  key: CryptoKey,
  params: { format: string; salt: Uint8Array; iterations: number },
  data: unknown,
): Promise<Envelope> {
  const iv = randomBytes(12);
  const header: EnvelopeHeader = {
    format: params.format,
    version: ENVELOPE_VERSION,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: params.iterations },
    cipher: { name: 'AES-GCM', keyLength: 256, tagLength: 128 },
    salt: toBase64(params.salt),
    iv: toBase64(iv),
  };
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: headerAad(header), tagLength: 128 },
    key,
    plaintext,
  );
  return { ...header, ciphertext: toBase64(new Uint8Array(ct)) };
}

/** Dešifruje obálku a vrátí naparsovaný JSON. */
export async function decryptJson(key: CryptoKey, env: Envelope): Promise<unknown> {
  let pt: ArrayBuffer;
  try {
    pt = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64(env.iv),
        additionalData: headerAad(env),
        tagLength: 128,
      },
      key,
      fromBase64(env.ciphertext),
    );
  } catch {
    throw new DecryptError();
  }
  try {
    return JSON.parse(new TextDecoder().decode(pt));
  } catch {
    throw new DecryptError('Soubor se podařilo dešifrovat, ale jeho obsah je poškozený.');
  }
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isB64 = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(v);

/** Ověří a vrátí obálku z textu nebo objektu. */
export function parseEnvelope(input: string | unknown, expectedFormat: string): Envelope {
  let obj: unknown = input;
  if (typeof input === 'string') {
    try {
      obj = JSON.parse(input.trim().replace(/^﻿/, ''));
    } catch {
      throw new EnvelopeFormatError('Soubor není šifrovaná mapa (neplatný formát).');
    }
  }
  if (!isObj(obj) || obj.format !== expectedFormat) {
    throw new EnvelopeFormatError('Soubor není šifrovaná mapa (neznámý formát).');
  }
  if (obj.version !== ENVELOPE_VERSION) {
    throw new EnvelopeFormatError(
      `Soubor používá nepodporovanou verzi formátu (${String(obj.version)}). Aktualizujte aplikaci.`,
    );
  }
  const kdf = obj.kdf;
  const cipher = obj.cipher;
  if (
    !isObj(kdf) ||
    kdf.name !== 'PBKDF2' ||
    kdf.hash !== 'SHA-256' ||
    typeof kdf.iterations !== 'number' ||
    !Number.isInteger(kdf.iterations) ||
    kdf.iterations < 1 ||
    kdf.iterations > 50_000_000 ||
    !isObj(cipher) ||
    cipher.name !== 'AES-GCM' ||
    cipher.keyLength !== 256 ||
    cipher.tagLength !== 128 ||
    !isB64(obj.salt) ||
    !isB64(obj.iv) ||
    !isB64(obj.ciphertext) ||
    fromBase64(obj.iv).length !== 12 ||
    fromBase64(obj.salt).length < 16
  ) {
    throw new EnvelopeFormatError('Soubor je poškozený (neplatná hlavička).');
  }
  return {
    format: obj.format,
    version: obj.version,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: kdf.iterations },
    cipher: { name: 'AES-GCM', keyLength: 256, tagLength: 128 },
    salt: obj.salt,
    iv: obj.iv,
    ciphertext: obj.ciphertext,
  };
}

export function serializeEnvelope(env: Envelope): string {
  return JSON.stringify(env, null, 1);
}
