# Mapa projektů

Myšlenková mapa a správa projektů a úkolů pro jednoho uživatele. Jde o statickou webovou aplikaci bez serveru a bez databáze: data zůstávají v zařízení, vždy zašifrovaná. Mezi zařízeními se přenášejí šifrovaným souborem (např. přes OneDrive).

Aktuální stav: **fáze 2**.
- **Fáze 1:** plocha, uzly, hierarchie včetně sdílených uzlů, rejstřík, detail, Zpět/Znovu, šifrované ukládání, offline.
- **Fáze 2:** stavy a priority, datumy se zvýrazněním termínů, procenta projektů, checklist, štítky, ikony projektů, koš.

## Projektová logika (fáze 2)

### Stavy a priority
- **Stavy:** Nový, Probíhá, Čeká, Blokováno, Hotovo, Zrušeno. **Priority:** Nízká, Střední, Vysoká, Kritická.
- Nastavují se v detailu nebo v kontextové nabídce (Stav…, Priorita…).
- **Zaškrtávací políčko** na úkolu označí úkol jako Hotovo. Zrušení zaškrtnutí úkol znovu otevře (stav Probíhá).
- **Hotové a zrušené** uzly jsou šedé a přeškrtnuté; Zrušeno má jinou ikonu než Hotovo.
- **Úkol s podúkoly** ukazuje počet hotových přímých podúkolů (zrušené se nepočítají). Stav úkolu se tím nemění, nastavuje se vždy ručně.

### Datumy a termíny
- **Projekt:** zahájení a deadline. **Úkol:** začátek a termín dokončení.
- Ukládají se jako lokální datum `YYYY-MM-DD` bez času a časové zóny.
- **Termín na nepracovní den** (sobota, neděle, státní svátek) se automaticky posune na poslední pracovní den před ním a aplikace to oznámí. Totéž se stane při načtení starších dat. Datum zahájení a začátku se neposouvá.

| Kdy | Zvýraznění termínu na uzlu |
| --- | --- |
| do termínu zbývají 1–3 pracovní dny | oranžové podbarvení |
| dnes je den termínu | červené podbarvení + jemné pulzování (při omezení animací jen červené) |
| termín uplynul | červené podbarvení |
| uzel je Hotovo nebo Zrušeno | bez zvýraznění |

- **„Zbývající pracovní dny“** jsou pracovní dny v intervalu (dnes, termín], tedy bez dneška a včetně dne termínu. Pracovní den není sobota, neděle ani svátek.
- **Svátky ČR** se počítají offline pro libovolný rok:
  - pevné: 1. 1., 1. 5., 8. 5., 5. 7., 6. 7., 28. 9., 28. 10., 17. 11., 24.–26. 12.;
  - pohyblivé: Velký pátek a Velikonoční pondělí (Velikonoce se počítají algoritmem).
- **Termín dříve než začátek** je povolený, ale aplikace upozorní:
  - oznámením při nastavení data;
  - oranžovou hláškou v detailu;
  - ikonkou ⚠ na uzlu (vysvětlení v tooltipu nebo po klepnutí).
  Kontroluje se i po automatickém posunu termínu a při načtení dokumentu. Stejné datum je v pořádku.
- **Přechod přes půlnoc:** zvýraznění se přepočítá samo, i když je aplikace otevřená přes noc nebo se vrátí z pozadí.

### Procento dokončení projektu
- Počítají se jen **úkoly přímo pod projektem**, podúkoly ne.
- Procento = hotové / všechny; **zrušené úkoly a milníky se nezapočítávají**.
- **Sdílený úkol** se započítá do každého projektu, pod kterým je přímo.
- Projekt bez započítatelných úkolů ukazuje „–“.

### Checklist, štítky, ikony
- **Checklist** v detailu: Enter přidá další položku, Backspace v prázdné položce ji smaže, pořadí se mění tažením za úchyt (myš i prst). Na uzlu se ukazuje „2/5“. Checklist neovlivňuje stav ani procenta.
- **Štítky:** našeptávání z již použitých štítků, přidání Enterem, odebrání křížkem. Na uzlu se zobrazí 2 štítky a zbytek jako „+N“.
- **Ikony projektů a úkolů:** 58 ikon ve skupinách IT, Hardware, Železnice, IZS a Management s vyhledáváním podle českého popisku (bez ohledu na diakritiku). Ikona se zobrazí na uzlu i v rejstříku.

### Koš
- Smazání přesune uzel i s větví do koše. Vazby zůstanou v dokumentu jako neaktivní, takže obnovení vrátí rodiče, pořadí mezi sourozenci i pozici.
- **Sdílený uzel** s rodičem mimo mazanou větev zůstane na ploše; vazba do větve se vrátí po jejím obnovení.
- **Obnovení s komplikací:**
  - Když byl původní rodič mezitím trvale smazán, obnovený uzel zůstane volně na ploše a aplikace to oznámí.
  - Když by obnovená vazba vytvořila cyklus, zahodí se a aplikace oznámí, který uzel ztratil kterého rodiče.
- **Trvalé smazání** a **Vysypat koš** odstraní uzly i všechny jejich vazby, takže v souboru nezůstanou osiřelé vazby.
- Smazání i obnovení jde vrátit tlačítky Zpět/Znovu.

## Vazby, milníky a sbalování (fáze 3)

### Typy vazeb
| Typ | Význam | Vzhled |
| --- | --- | --- |
| Hierarchie | rodič → poduzel (víc rodičů = sdílený uzel), cykly zakázané | plná čára v barvě projektu rodiče |
| Závislost | A blokuje B, cykly zakázané | čárkovaná čára se šipkou u B, v barvě projektu blokujícího uzlu |
| Souvislost | volný odkaz bez logiky, cykly povolené | tečkovaná šedá čára |

- **Projekty jsou vždy na nejvyšší úrovni:** projekt nemůže být v hierarchii podřízený žádnému uzlu (ani jinému projektu). Platí to pro tažení, Propojit, přepojení vazby, Přesunout pod…, Přidat rodiče, rejstřík i obnovení z koše. Závislosti a souvislosti s projekty jsou povolené.
- Všechny typy používají plovoucí vazby (střed nejbližší hrany). Souběžné vazby mezi stejnou dvojicí uzlů se odsadí do oblouku.
- Vazba na sebe a duplicitní vazba stejného typu (u souvislosti v obou směrech) nejsou dovolené. Pokus o cyklus aplikace odmítne a vypíše uzly v cyklu.
- **Vytvoření myší:** po najetí na uzel se ukážou konektory na čtyřech hranách; tažení na jiný uzel otevře nabídku Závislost / Souvislost / Přidat jako poduzel.
- **Vytvoření na telefonu:** tlačítko **Propojit** (horní lišta, kontextová nabídka, detail) → klepnutí na cílový uzel → stejná nabídka.
- **Úprava:** klik na čáru vazbu zvýrazní a otevře nabídku (otočit směr, změnit typ, změnit zdroj/cíl, odstranit, u hierarchie odpojit od rodiče). Konec vybrané vazby jde myší přetáhnout na jiný uzel. Odstranění vazby nikdy nemaže uzly, vše jde vrátit tlačítkem Zpět.
- Po výběru uzlu se zvýrazní jeho vazby a propojené uzly, ostatní se ztlumí (vypínač v menu „⋯“). Detail uzlu má sekci **Vazby** (Nadřazené, Podřízené, Blokuje, Je blokován, Souvisí).

### Blokující závislosti
- Úkol nebo milník, který čeká na nedokončený uzel, má na mapě **zámek**; tooltip / klepnutí vypíše, na čem čeká. Stav se automaticky nemění.
- Označení blokovaného úkolu jako Hotovo projde, jen s upozorněním.
- Milník blokuje, dokud jeho datum nenastalo (v den milníku už ne, bez data neblokuje).

### Milníky
- Tlačítko **Milník** v horní liště (pod vybraný projekt/úkol, bez výběru doprostřed plochy) a v kontextové nabídce.
- Zubaté okraje v barvě projektu. Obsah: název, datum, ikona, štítky, poznámky, vazby. Nemá stav, prioritu, checklist ani poduzly.
- Nezapočítává se do procent ani počtu úkolů projektu.
- Datum se posouvá z víkendu/svátku stejně jako termíny; „blíží se“ a „dnes“ jako u termínů, po datu neutrálně šedě s ✓.

### Sbalování větví
- Tlačítko na uzlu (pravý dolní roh), **mezerník**, kontextová nabídka, v rejstříku nabídka položky („Sbalit na mapě“). Šipka v rejstříku dál rozbaluje jen strom rejstříku.
- Sbalený uzel ukazuje počet skrytých uzlů („+12“). Menu „⋯“: **Sbalit vše na projekty**, **Rozbalit vše**.
- Uzel je skrytý, jen když žádná jeho cesta ke kořeni nevede přes samé rozbalené předky (sdílený uzel s jedním rozbaleným rodičem zůstává vidět).
- Vazba do skryté větve se vykreslí poloprůhledně do nejbližšího viditelného předka; víc takových vazeb mezi stejnou dvojicí se sloučí do jedné čáry s číslem (klepnutí ukáže seznam a umí skrytý uzel zobrazit).
- Výběr skrytého uzlu (z rejstříku, z detailu, ze seznamu vazeb) jeho předky rozbalí.

### Kolize termínů
- **Závislost:** blokovaný uzel má termín dříve nebo ve stejný den jako blokující (u milníku jeho datum).
- **Hierarchie:** poduzel má termín později než nadřazený úkol / deadline projektu (sdílený uzel vůči každému rodiči).
- Termín dříve než začátek (z fáze 2) zůstává.
- Uzly s kolizí mají ⚠ s vypsanými důvody, dotčená vazba je oranžová. Nová kolize při změně termínu nebo vazby se oznámí. Hotové, zrušené a smazané uzly se nepočítají.

### Koš a vazby
Závislosti a souvislosti smazaného uzlu zůstanou neaktivní a obnovení je vrátí (s kontrolou cyklů). Trvalé smazání je odstraní.

### Verze dat
Schéma dokumentu je ve verzi **4**. Soubory a lokální data ze starších verzí se při načtení převedou automaticky. Verze 4 odebere hierarchické vazby, ve kterých byl projekt poduzlem, a po načtení oznámí, kolik vazeb a u kterých projektů odebrala. Soubor z novější verze aplikace se neotevře; aplikace nabídne kontrolu aktualizace.

## Přehled a orientace (fáze 4)

### Automatický detail podle zoomu
| Úroveň | Zoom | Co je vidět |
| --- | --- | --- |
| Přehled | pod 35 % | jen projekty a uzly bez rodiče (velký název, procento, deadline, ⚠ s počtem úkolů po termínu) |
| Projekty a úkoly | 35–60 % | navíc přímé úkoly a milníky (jen název, termín, zámek, ⚠) |
| Vše | od 60 % | všechny uzly |

- Mezi úrovněmi je hystereze ±3 procentní body (nahoru se přepne až při 38 % / 63 %, dolů při 32 % / 57 %), takže uzly na hranici neblikají.
- Je to jen zobrazení: nemění uložené sbalení ani pozice. Ručně sbalená větev zůstává sbalená i při plném detailu.
- Skryté uzly používají stejnou logiku jako ruční sbalení (přesměrované a sloučené vazby, „+N“). Klepnutí na „+N“ u uzlu omezeného zoomem přiblíží plochu.
- Výjimky: vybraný uzel, kliknutý výsledek hledání a shody filtru jsou vidět v každé úrovni (i s cestou k nim). Leží-li ve ručně sbalené větvi, sbalený uzel zůstane neztlumený a dostane odznak počtu shod („3 ⧉“).
- Vystředění uzlu (rejstřík, hledání, zvoneček) rozbalí ručně sbalené předky a přiblíží na plný detail.
- Úroveň je vidět u ovládání zoomu, vypíná se v menu „⋯“ (volba se pamatuje v prohlížeči).

### Vyhledávání
- Notebook: pole v horní liště, **Ctrl+F** nebo **/**. Telefon: lupa otevře pole přes celou lištu.
- Hledá v názvech, štítcích, poznámkách a checklistu bez ohledu na diakritiku a velikost písmen; uzly v koši ne.
- Výsledky (max. 50): shoda v názvu před ostatními, u každého projekt, stav, termín a kde se shoda našla. Šipky, Enter, Esc.

### Filtry
- **Zobrazit:** Všechny úkoly, Pouze aktivní, Po termínu, Dokončené, Čekající, Na dnešek, Na příštích 7 dní (dnes až dnes + 7 kalendářních dní).
- **Projekt, priorita, štítek:** více hodnot; všechny volby platí současně.
- Platí pro úkoly a podúkoly; milníky jen v časových volbách. Sdílený uzel patří do všech svých projektů.
- Mapa: ostatní uzly se výrazně ztlumí, cesta ke shodám zůstane vidět. Rejstřík: jen shody a jejich předci, s počtem nahoře.
- Lišta nad plochou ukazuje aktivní filtr a tlačítko **Zrušit filtr**. Filtr se neukládá, po obnovení stránky je vypnutý.

### Zvoneček
- Odznak s počtem položek: červený, je-li aspoň jedna červená položka, jinak oranžový.
- Skupiny: **Po termínu a dnes**, **Blíží se** (1–3 pracovní dny), **Kolize a upozornění**. Bez hotových, zrušených, smazaných uzlů a uplynulých milníků.
- Řazení podle termínu, při shodě podle priority. Klik vystředí uzel a otevře detail. Přepočítá se při změně dat a o půlnoci.
- Jen v otevřené aplikaci, žádné systémové notifikace.

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
src/model/       čisté funkce: typy, hierarchie, vazby, viditelnost (sbalení), kolize termínů, koš, migrace, verze
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
| Ctrl+F nebo / | hledat |
| Mezerník | sbalit / rozbalit větev vybraného uzlu |
| Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z | zpět / znovu |
| Ctrl+S / Ctrl+Shift+S | uložit / uložit jako |
| Esc | zrušit výběr, režim Propojit, zavřít nabídku či dialog |
