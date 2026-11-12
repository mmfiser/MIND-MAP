# Mapa projektů

Myšlenková mapa a správa projektů a úkolů pro jednoho uživatele. Jde o statickou webovou aplikaci bez serveru a bez databáze: data zůstávají v zařízení, vždy zašifrovaná. Mezi zařízeními se přenášejí šifrovaným souborem (např. přes OneDrive).

Aktuální stav: **fáze 1** (plocha, uzly, hierarchie včetně sdílených uzlů, rejstřík, detail, Zpět/Znovu, šifrované ukládání, offline).

## Spuštění

Je potřeba Node.js 20 nebo novější.

```bash
npm install
npm run dev        # vývojový server na http://localhost:5173
npm test           # testy logiky (Vitest)
npm run build      # produkční build do dist/
npm run preview    # náhled buildu na http://localhost:4173 (včetně CSP a service workeru)
```

Ve vývojovém režimu (`npm run dev`) je CSP i service worker vypnutý. Offline režim a CSP ověřujte na `npm run preview` nebo na nasazené verzi.

## Nasazení na GitHub Pages

1. Nahrajte repozitář na GitHub (větev `main`).
2. V **Settings → Pages** zvolte **Source: GitHub Actions**.
3. Každý push do `main` spustí `.github/workflows/deploy.yml`: testy, build a nasazení.

Cesta `base` se nastaví automaticky:

| Situace | base |
| --- | --- |
| repozitář `uzivatel.github.io` | `/` |
| jiný repozitář, např. `mapa` | `/mapa/` |
| vlastní doména | nastavte proměnnou repozitáře `VITE_BASE` = `/` (Settings → Secrets and variables → Actions → Variables) |

### Aplikace musí běžet na vlastním originu

IndexedDB, service worker i oprávnění prohlížeče patří **originu** (schéma + doména + port), ne cestě. Všechny stránky na `uzivatel.github.io/*` sdílejí jeden origin. Jiná aplikace na `uzivatel.github.io/jina-aplikace/` by tak mohla číst a přepisovat IndexedDB této aplikace (i když jen šifrovaná data) a také registrovat service worker.

Nasaďte proto aplikaci na origin, kde nic jiného neběží:

- **samostatný GitHub účet nebo organizace** jen pro tuto aplikaci (např. repozitář `mapa-xyz.github.io`), nebo
- **vlastní doménu / subdoménu** (např. `mapa.example.cz`) nastavenou v GitHub Pages.

Pokud už na originu běží jiné stránky, berte to jako bezpečnostní riziko.

## Formát souboru `.mapa`

Soubor je JSON obálka s nešifrovanou hlavičkou a šifrovaným obsahem:

```json
{
 "format": "mapa-encrypted",
 "version": 1,
 "kdf": { "name": "PBKDF2", "hash": "SHA-256", "iterations": 600000 },
 "cipher": { "name": "AES-GCM", "keyLength": 256, "tagLength": 128 },
 "salt": "<base64, 16 B>",
 "iv": "<base64, 12 B>",
 "ciphertext": "<base64>"
}
```

- **Šifrovaný obsah** je celý `MapDocument` (`meta`, `nodes`, `edges`, typy jsou v `src/model/types.ts`). V `meta` je `schemaVersion`, `docId`, `revision`, `updatedAt` a `deviceName`. Nic z toho není v hlavičce.
- **Hlavička slouží jako AAD** (additional authenticated data) pro AES-GCM. Jakákoli změna hlavičky nebo obsahu způsobí selhání dešifrování.
- **Klíč** se odvozuje z hesla přes PBKDF2-SHA-256 se 600 000 iteracemi. Sůl souboru se pamatuje, takže při dalších uloženích se mění jen IV (nový náhodný při každém zápisu) a klíč se neodvozuje znovu.
- **Na Androidu** se soubor ukládá jako `<název>.mapa.txt` s MIME `text/plain`, aby ho OneDrive a výběr souborů bez potíží přijaly. Obsah je stejný a aplikace otevře obě přípony.
- **Lokální kopie v IndexedDB** používá stejný formát obálky s `"format": "mapa-vault"`. Je to jeden záznam s celým dokumentem a s vlastní solí.

### Verze a konflikty

`meta.revision` se zvyšuje s každým uložením do souboru. Prohlížeč si v nastavení pamatuje `baseRevision`, tj. revizi souboru, ze které pracovní kopie vychází, a příznak neuložených změn.

| Při otevření souboru | Výsledek |
| --- | --- |
| soubor je novější, lokálně nic neuloženého | načte se bez dotazu |
| soubor je novější a zároveň jsou lokální změny | dialog konfliktu (datum, čas, zařízení obou verzí) |
| soubor je starší než pracovní kopie | dialog konfliktu |
| soubor patří k jiné mapě (`docId`) | varování „jiná mapa“ |

Na notebooku se před přepsáním souboru (Uložit) zkontroluje, zda ho mezitím neuložilo jiné zařízení. Po otevření souboru se maže historie Zpět/Znovu.

## Bezpečnostní poznámky

- **Žádná síť.** Aplikace nedělá žádné síťové požadavky kromě načtení vlastních souborů. CSP (jen v produkčním buildu) má `connect-src 'self'` a `script-src 'self'` bez inline skriptů. Service worker se registruje externím `registerSW.js`.
- **Výjimka `style-src 'unsafe-inline'`** je nutná kvůli inline stylům, kterými React Flow pozicuje uzly. Skripty inline nejsou povolené.
- **`frame-ancestors` nejde nastavit** přes `<meta>` a GitHub Pages neumožňuje vlastní HTTP hlavičky. Ochrana proti vložení do iframe tedy chybí. Data jsou ale vždy za heslem.
- **Heslo se nikam neukládá.** Po zadání se importuje jako nevyexportovatelný `CryptoKey` (PBKDF2) a odvozené AES klíče se drží jen v paměti. „Zamknout“ nebo zavření stránky je zahodí. Zapomenuté heslo znamená ztracená data.
- **Uživatelská data se ukládají jen šifrovaně** (IndexedDB i soubor). Nešifrovaná jsou jen nastavení: název zařízení, téma, mřížka, viewport, název souboru, revize a sůl souboru.
- **Trvalé úložiště:** aplikace žádá `navigator.storage.persist()`. Výsledek je vidět v Nastavení. Bez něj může prohlížeč při nedostatku místa data smazat, proto pravidelně ukládejte do souboru.
- **Upozornění na neuložené změny:** hlavním signálem je oranžová tečka u tlačítka Uložit. `beforeunload` je jen doplněk, protože na Androidu často nefunguje.
- **Žádná instalace:** aplikace nemá manifest (`manifest-src 'none'`) a nenabízí instalaci. Service worker slouží jen jako offline mezipaměť souborů aplikace. Nová verze se použije při dalším načtení stránky.

## Struktura

```
src/model/       čisté funkce: typy, hierarchie (cykly, rodiče, přesuny, mazání), migrace, verze
src/crypto/      obálka AES-GCM + PBKDF2, klíče sezení
src/storage/     IndexedDB (Dexie), šifrovaný trezor, autosave, soubory (FSA / share / download)
src/store/       Zustand – dokument + Zpět/Znovu, stav UI
src/app/         akce nad uzly, životní cyklus (heslo, zámek), ukládání a otevírání souborů
src/components/  plocha (React Flow), lišta, rejstřík, detail, dialogy
tests/           Vitest – hierarchie, šifrování, migrace, rozhodování o verzích
```

## Klávesové zkratky

| Klávesa | Akce |
| --- | --- |
| Tab | nový podúkol |
| Enter | nový sourozenec |
| Delete | smazat (s potvrzením) |
| F | vystředit vybraný |
| Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z | zpět / znovu |
| Ctrl+S / Ctrl+Shift+S | uložit / uložit jako |
| Esc | zrušit výběr, zavřít nabídku či dialog |
