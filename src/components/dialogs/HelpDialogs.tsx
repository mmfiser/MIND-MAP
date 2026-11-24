import { CalendarCheck, CalendarClock, Filter, Link2, Lock, Pin, Search, TriangleAlert } from 'lucide-react';
import { checkForUpdateNow } from '../../app/updates';
import { checkPersistence } from '../../app/session';
import { useUiStore } from '../../store/uiStore';
import { Dialog } from './Dialog';
import { PERSIST_TEXT } from './Dialogs';

const WELCOME_KEY = 'mapa-welcome-shown';

const SHORTCUTS: [string, string][] = [
  ['Tab', 'nový podúkol vybraného uzlu'],
  ['Enter', 'nový sourozenec'],
  ['Delete', 'smazat vybrané (do koše, s potvrzením)'],
  ['Mezerník', 'sbalit / rozbalit větev'],
  ['F', 'vystředit vybraný uzel'],
  ['L', 'uspořádat větev (poslední zvolený směr)'],
  ['P', 'zamknout / odemknout pozici vybraných uzlů'],
  ['Shift+P', 'zamknout / odemknout pozice všech uzlů'],
  ['Šipky', 'posunout vybrané uzly (Shift = větší krok)'],
  ['Ctrl+klik', 'přidat / odebrat uzel z výběru'],
  ['Shift+tažení', 'vybrat uzly obdélníkem'],
  ['Ctrl+A', 'vybrat všechny viditelné uzly'],
  ['Ctrl+F nebo /', 'hledat'],
  ['Ctrl+Z / Ctrl+Y', 'zpět / znovu'],
  ['Ctrl+S / Ctrl+Shift+S', 'uložit / uložit jako'],
  ['Esc', 'zrušit výběr, zavřít nabídku či dialog'],
  ['?', 'tato nápověda'],
];

const GESTURES: [string, string][] = [
  ['Klepnutí na uzel', 'vybrat a otevřít detail'],
  ['Dlouhé podržení', 'nabídka uzlu nebo plochy'],
  ['Dva prsty', 'přiblížit / oddálit'],
  ['Tažení po ploše', 'posun plochy'],
  ['Kruhový ovladač', 'klepnutí na šipku = posun o třetinu obrazovky, tažení palcem = plynulý posun, střed = vystředit'],
  ['„⋯“ → Vybrat více', 'klepnutím přidáváte uzly do výběru (hromadné akce)'],
  ['Zámek na liště', 'zamkne pozice – tažení pak jen posouvá plochu'],
];

/** Nápověda: zkratky, gesta, barvy termínů, ikony a styly čar vazeb. */
export function HelpDialog() {
  const open = useUiStore((s) => s.helpOpen);
  if (!open) return null;
  const close = () => useUiStore.getState().set({ helpOpen: false });
  return (
    <Dialog title="Nápověda" onClose={close} wide className="help-dialog" footer={<button className="btn primary" onClick={close} data-autofocus>Zavřít</button>}>
      <section>
        <h3>Klávesnice (notebook)</h3>
        <table className="help-table">
          <tbody>
            {SHORTCUTS.map(([k, v]) => (
              <tr key={k}>
                <td>
                  <kbd>{k}</kbd>
                </td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">Zkratky nefungují při psaní do textových polí.</p>
      </section>

      <section>
        <h3>Telefon</h3>
        <table className="help-table">
          <tbody>
            {GESTURES.map(([k, v]) => (
              <tr key={k}>
                <td>{k}</td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3>Termíny</h3>
        <ul className="help-list">
          <li>
            <span className="chip due soon">
              <CalendarClock size={12} /> 20. 11.
            </span>{' '}
            blíží se (1–3 pracovní dny)
          </li>
          <li>
            <span className="chip due today">
              <CalendarClock size={12} /> 19. 11.
            </span>{' '}
            dnes (pulzuje)
          </li>
          <li>
            <span className="chip due overdue">
              <CalendarClock size={12} /> 16. 11. · −3 d
            </span>{' '}
            po termínu
          </li>
          <li>
            <span className="chip due past">
              <CalendarCheck size={12} /> 10. 11.
            </span>{' '}
            uplynulý milník (neutrálně)
          </li>
          <li>Deadline = projekt, termín = úkol, datum = milník. Termín na víkend nebo svátek se posune na předchozí pracovní den.</li>
        </ul>
      </section>

      <section>
        <h3>Ikony na uzlech</h3>
        <ul className="help-list">
          <li>
            <span className="chip locked">
              <Lock size={12} />
            </span>{' '}
            čeká na nedokončený úkol (závislost)
          </li>
          <li>
            <span className="help-pin">
              <Pin size={11} strokeWidth={2.5} />
            </span>{' '}
            pozice uzlu je zamčená
          </li>
          <li>
            <span className="chip conflict">
              <TriangleAlert size={12} />
            </span>{' '}
            kolize termínů nebo termín před začátkem (klepnutím zobrazíte důvod)
          </li>
          <li>
            <span className="help-badge">+5</span> sbalená větev (počet skrytých uzlů); s čárkovaným okrajem skrývá uzly jen oddálení
          </li>
          <li>
            <span className="help-badge accent">
              <Search size={11} /> 2
            </span>{' '}
            <span className="help-badge warn">
              <Filter size={11} /> 3
            </span>{' '}
            shody hledání / filtru ve sbalené větvi (klepnutím rozbalíte)
          </li>
          <li>
            <span className="help-pin">
              <Link2 size={11} />
            </span>{' '}
            sdílený uzel (má víc rodičů)
          </li>
        </ul>
      </section>

      <section>
        <h3>Čáry vazeb</h3>
        <ul className="help-list">
          <li>
            <svg width="60" height="10" aria-hidden>
              <line x1="2" y1="5" x2="58" y2="5" stroke="currentColor" strokeWidth="2.25" />
            </svg>{' '}
            hierarchie (rodič → poduzel), v barvě projektu
          </li>
          <li>
            <svg width="60" height="10" aria-hidden>
              <line x1="2" y1="5" x2="50" y2="5" stroke="currentColor" strokeWidth="2.25" strokeDasharray="7 5" />
              <path d="M50 1 L58 5 L50 9 Z" fill="currentColor" />
            </svg>{' '}
            závislost (A blokuje B, šipka u B)
          </li>
          <li>
            <svg width="60" height="10" aria-hidden>
              <line x1="2" y1="5" x2="58" y2="5" stroke="currentColor" strokeWidth="2" strokeDasharray="1.5 5" strokeLinecap="round" />
            </svg>{' '}
            souvislost (bez logiky)
          </li>
          <li>Oranžová čára = kolize termínů, poloprůhledná = vede do sbalené větve, číslo na čáře = sloučené vazby.</li>
        </ul>
      </section>
    </Dialog>
  );
}

/** O aplikaci: verze, datum sestavení, trvalé úložiště, kontrola aktualizace. */
export function AboutDialog() {
  const open = useUiStore((s) => s.aboutOpen);
  const persist = useUiStore((s) => s.persistStatus);
  if (!open) return null;
  const close = () => useUiStore.getState().set({ aboutOpen: false });
  const m = /^(.+?) UTC \((\w+)\)$/.exec(__APP_VERSION__);
  const built = m ? new Date(`${m[1]!.replace(' ', 'T')}Z`) : null;
  return (
    <Dialog title="O aplikaci" onClose={close} footer={<button className="btn primary" onClick={close} data-autofocus>Zavřít</button>}>
      <div className="field">
        <span>Mapa projektů</span>
        <div>Myšlenková mapa a správa projektů. Data jsou jen v tomto zařízení a v souborech, které uložíte – vždy zašifrovaná.</div>
      </div>
      <div className="field">
        <span>Verze</span>
        <div>
          {__APP_SEMVER__}
          {m ? ` (commit ${m[2]})` : ''}
        </div>
      </div>
      <div className="field">
        <span>Sestaveno</span>
        <div>{built && !Number.isNaN(built.getTime()) ? new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'long', timeStyle: 'short' }).format(built) : '–'}</div>
      </div>
      <div className="field">
        <span>Trvalé úložiště prohlížeče</span>
        <div>{PERSIST_TEXT[persist]}</div>
        {persist === 'denied' && (
          <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => void checkPersistence(true)}>
            Požádat znovu
          </button>
        )}
      </div>
      <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => void checkForUpdateNow()}>
        Zkontrolovat aktualizaci
      </button>
    </Dialog>
  );
}

/** Po vytvoření hesla: krátké uvítání (jen jednou). */
export function maybeShowWelcome(): void {
  try {
    if (localStorage.getItem(WELCOME_KEY)) return;
  } catch {
    return;
  }
  useUiStore.getState().set({ welcomeOpen: true });
}

export function WelcomeDialog() {
  const open = useUiStore((s) => s.welcomeOpen);
  if (!open) return null;
  const close = () => {
    try {
      localStorage.setItem(WELCOME_KEY, '1');
    } catch {
      /* nevadí */
    }
    useUiStore.getState().set({ welcomeOpen: false });
  };
  return (
    <Dialog title="Vítejte v Mapě projektů" onClose={close} footer={<><button className="btn" onClick={close}>Přeskočit</button><button className="btn primary" onClick={close} data-autofocus>Rozumím</button></>}>
      <ol className="welcome-list">
        <li>
          <strong>Ukládejte do souboru na OneDrive.</strong> Data v prohlížeči jsou jen pracovní kopie – soubor je záloha a přenos mezi notebookem a telefonem.
        </li>
        <li>
          <strong>Heslo nejde obnovit.</strong> Bez něj se k datům ani k souborům nedostanete. Poznamenejte si ho na bezpečné místo.
        </li>
        <li>
          <strong>Nápověda je pod „?“</strong> (na telefonu v nabídce „⋯“): zkratky, gesta a význam barev a ikon.
        </li>
      </ol>
    </Dialog>
  );
}
