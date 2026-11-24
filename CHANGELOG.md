# Přehled změn

Verze se číslují `hlavní.vedlejší.oprava`. Každá verze má v gitu tag (`v1.0.0`, `v1.0.1`…), na který se dá vrátit – postup je v README v části „Návrat k předchozí verzi“. Číslo verze, datum sestavení a commit ukazuje aplikace v „⋯“ → O aplikaci.

## v1.0.1 – oprava ukládání (24. 11. 2026)

**Opraveno**
- Tlačítko **Uložit** mohlo po prvním použití přestat reagovat (po Stornu ve výběru souboru nebo po úspěšném uložení). Příčina: na některých počítačích (spravovaný Chrome se zásadami, bezpečnostní software zachytávající výběr souboru nebo zápis) se výběr souboru, žádost o oprávnění nebo zápis nikdy nedokončí a aplikace zůstala „uprostřed ukládání“ – další kliky potichu ignorovala.
- Ukládání a otevírání běží pod hlídaným zámkem: klik během běžícího ukládání ukáže „Ukládání ještě probíhá…“, žádný klik už není tichý.
- Pojistka: operace, která neskončí do 60 s (mimo dobu otevřeného dialogu), se uvolní a aplikace nabídne **Stáhnout soubor**.
- Zaseknutý nebo zásadami zakázaný přímý přístup k souborům aplikace pozná, oznámí („Prohlížeč na tomto počítači nepovoluje přímé ukládání do souborů – soubor se stáhne do Stažených souborů“) a do konce sezení ukládá stažením a otevírá obyčejným výběrem souboru.
- Zápis do souboru, čtení před přepsáním, uložení nastavení a automatické ukládání pracovní kopie mají časové limity; jeden zaseknutý zápis už nezablokuje další.
- Nový dialog aplikace už nepřepíše otevřený dialog bez odpovědi (dřív mohla akce čekající na odpověď zůstat viset).

**Přidáno**
- Diagnostické záznamy v konzoli prohlížeče s předponou `[mapa]` (jen názvy kroků ukládání a otevírání, žádná data) – při potížích pomohou zjistit, kde se operace zastavila.
- Číslo verze v „⋯“ → O aplikaci a v Nastavení.
- Ruční nasazení libovolné verze (tag / commit) přes GitHub Actions.

Formát dat ani `SCHEMA_VERSION` (4) se nemění – soubory uložené ve v1.0.1 otevře i v1.0.0.

## v1.0.0 – dokončená aplikace (19. 11. 2026)

Stav po fázi 5:
- myšlenková mapa s projekty, úkoly, milníky, hierarchií včetně sdílených uzlů, závislostmi a souvislostmi;
- stavy, priority, termíny se zvýrazněním, procenta projektů, checklist, štítky, ikony, koš;
- sbalování větví, automatický detail podle zoomu, zvětšování uzlů při oddálení, minimapa, kruhový ovladač;
- vyhledávání, filtry, zvoneček s kolizemi termínů, výběr více uzlů a hromadné akce;
- zamykání pozic, automatické uspořádání větví, nápověda, O aplikaci;
- šifrovaná pracovní kopie v prohlížeči a šifrované soubory (AES-GCM, PBKDF2), offline provoz;
- schéma dat verze 4.
