import { describe, expect, it } from 'vitest';
import {
  DecryptError,
  EnvelopeFormatError,
  FILE_FORMAT,
  KDF_ITERATIONS,
  decryptJson,
  deriveAesKey,
  encryptJson,
  fromBase64,
  importPassword,
  parseEnvelope,
  randomBytes,
  serializeEnvelope,
  toBase64,
} from '../src/crypto/envelope';
import {
  deriveWithPassword,
  keyForSalt,
  lockSession,
  rememberKey,
  startSession,
} from '../src/crypto/keySession';
import { createEmptyDocument } from '../src/model/factory';

// Pro rychlost většiny testů nižší počet iterací; jeden test ověří plných 600 000.
const FAST = 1000;

async function keyFor(password: string, salt: Uint8Array<ArrayBuffer>, iterations = FAST) {
  return deriveAesKey(await importPassword(password), salt, iterations);
}

describe('šifrování obálky', () => {
  it('round-trip se správným heslem (plný počet iterací)', async () => {
    const salt = randomBytes(16);
    const key = await keyFor('tajné heslo ěščř', salt, KDF_ITERATIONS);
    const doc = createEmptyDocument('Notebook');
    const env = await encryptJson(key, { format: FILE_FORMAT, salt, iterations: KDF_ITERATIONS }, doc);
    expect(env.kdf.iterations).toBe(600_000);
    const text = serializeEnvelope(env);
    expect(text).not.toContain('Notebook'); // deviceName je jen uvnitř šifrovaného obsahu
    const parsed = parseEnvelope(text, FILE_FORMAT);
    const key2 = await keyFor('tajné heslo ěščř', fromBase64(parsed.salt), parsed.kdf.iterations);
    expect(await decryptJson(key2, parsed)).toEqual(doc);
  });

  it('špatné heslo vyhodí DecryptError', async () => {
    const salt = randomBytes(16);
    const env = await encryptJson(await keyFor('správné', salt), { format: FILE_FORMAT, salt, iterations: FAST }, { a: 1 });
    await expect(decryptJson(await keyFor('špatné', salt), env)).rejects.toBeInstanceOf(DecryptError);
  });

  it('každé šifrování má nový IV', async () => {
    const salt = randomBytes(16);
    const key = await keyFor('x', salt);
    const a = await encryptJson(key, { format: FILE_FORMAT, salt, iterations: FAST }, { a: 1 });
    const b = await encryptJson(key, { format: FILE_FORMAT, salt, iterations: FAST }, { a: 1 });
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('změna hlavičky (AAD) nebo obsahu způsobí selhání', async () => {
    const salt = randomBytes(16);
    const key = await keyFor('x', salt);
    const env = await encryptJson(key, { format: FILE_FORMAT, salt, iterations: FAST }, { a: 1 });
    await expect(decryptJson(key, { ...env, kdf: { ...env.kdf, iterations: FAST + 1 } })).rejects.toBeInstanceOf(DecryptError);
    const ct = fromBase64(env.ciphertext);
    ct[0] = ct[0]! ^ 1;
    await expect(decryptJson(key, { ...env, ciphertext: toBase64(ct) })).rejects.toBeInstanceOf(DecryptError);
  });

  it('neplatný soubor vyhodí EnvelopeFormatError', () => {
    expect(() => parseEnvelope('nejsem json', FILE_FORMAT)).toThrow(EnvelopeFormatError);
    expect(() => parseEnvelope('{"format":"jiny"}', FILE_FORMAT)).toThrow(EnvelopeFormatError);
    expect(() =>
      parseEnvelope(
        JSON.stringify({ format: FILE_FORMAT, version: 1, kdf: {}, cipher: {}, salt: 'a', iv: 'b', ciphertext: 'c' }),
        FILE_FORMAT,
      ),
    ).toThrow(EnvelopeFormatError);
  });
});

describe('klíče sezení', () => {
  it('odvodí klíč jednou pro sůl a po zamčení odmítne', async () => {
    const salt = toBase64(randomBytes(16));
    await startSession('heslo');
    const k1 = await keyForSalt(salt, FAST);
    const k2 = await keyForSalt(salt, FAST);
    expect(k1).toBe(k2);
    lockSession();
    await expect(keyForSalt(salt, FAST)).rejects.toThrow();
  });

  it('soubor s jiným heslem: klíč z jiného hesla se uloží pro jeho sůl', async () => {
    const saltBytes = randomBytes(16);
    const salt = toBase64(saltBytes);
    const env = await encryptJson(await keyFor('jine', saltBytes), { format: FILE_FORMAT, salt: saltBytes, iterations: FAST }, { ok: true });
    await startSession('hlavni');
    await expect(decryptJson(await keyForSalt(salt, FAST), env)).rejects.toBeInstanceOf(DecryptError);
    const other = await deriveWithPassword(salt, FAST, 'jine');
    expect(await decryptJson(other, env)).toEqual({ ok: true });
    rememberKey(salt, FAST, other);
    expect(await decryptJson(await keyForSalt(salt, FAST), env)).toEqual({ ok: true });
    lockSession();
  });
});
