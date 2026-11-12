import { AlertTriangle } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { setupNew, unlock, wipeLocalData } from '../app/session';
import { confirmDialog, useUiStore } from '../store/uiStore';

const MIN_PASSWORD = 8;

function Logo() {
  return (
    <svg className="gate-logo" viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="14" fill="#4f46e5" />
      <circle cx="20" cy="32" r="8" fill="#fff" />
      <circle cx="46" cy="18" r="6" fill="#c7d2fe" />
      <circle cx="46" cy="46" r="6" fill="#c7d2fe" />
      <path d="M27 29 40 20M27 35l13 9" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

function Setup() {
  const [device, setDevice] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!device.trim()) return setError('Pojmenujte zařízení.');
    if (pw.length < MIN_PASSWORD) return setError(`Heslo musí mít alespoň ${MIN_PASSWORD} znaků.`);
    if (pw !== pw2) return setError('Hesla se neshodují.');
    if (!ack) return setError('Potvrďte, že rozumíte upozornění.');
    setError(null);
    setBusy(true);
    try {
      await setupNew(device.trim(), pw);
    } catch (err) {
      console.error(err);
      setError('Nastavení se nepodařilo uložit. Je povolené úložiště prohlížeče?');
      setBusy(false);
    }
  };

  return (
    <form className="gate-card" onSubmit={(e) => void submit(e)}>
      <Logo />
      <h1>Vítejte</h1>
      <p>Mapa projektů ukládá data jen v tomto zařízení, vždy zašifrovaná. Nastavte název zařízení a heslo.</p>
      <label className="field">
        <span>Název zařízení</span>
        <input className="input" value={device} onChange={(e) => setDevice(e.target.value)} placeholder="např. Notebook nebo Telefon" maxLength={40} autoFocus />
      </label>
      <label className="field">
        <span>Heslo</span>
        <input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      </label>
      <label className="field">
        <span>Heslo znovu</span>
        <input className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
      </label>
      <div className="warning-box" role="alert">
        <AlertTriangle size={20} />
        <div>
          <strong>Zapomenuté heslo = ztracená data.</strong> Heslo se nikam neukládá a nejde obnovit. Stejným heslem se šifrují i soubory
          na OneDrive – na dalším zařízení použijte stejné heslo.
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
        <span>Rozumím, heslo si bezpečně poznamenám.</span>
      </label>
      {error && <div className="error-text">{error}</div>}
      <button className="btn primary" type="submit" disabled={busy}>
        {busy ? 'Vytvářím šifrovací klíč…' : 'Začít'}
      </button>
    </form>
  );
}

function Unlock() {
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pw) return;
    setBusy(true);
    setError(null);
    const err = await unlock(pw);
    if (err) {
      setError(err);
      setBusy(false);
    }
  };

  const forgot = async () => {
    const ok = await confirmDialog(
      'Smazat data v prohlížeči?',
      'Bez hesla nejde data dešifrovat. Můžete smazat šifrovanou pracovní kopii v tomto prohlížeči a začít znovu – pak otevřete soubor z OneDrive (pokud znáte jeho heslo). Neuložené změny se ztratí.',
      'Smazat a začít znovu',
      true,
    );
    if (ok) await wipeLocalData();
  };

  return (
    <form className="gate-card" onSubmit={(e) => void submit(e)}>
      <Logo />
      <h1>Odemknout mapu</h1>
      <p>Data v tomto prohlížeči jsou zašifrovaná. Zadejte heslo.</p>
      <label className="field">
        <span>Heslo</span>
        <input className="input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
      </label>
      {error && <div className="error-text">{error}</div>}
      <button className="btn primary" type="submit" disabled={busy || !pw}>
        {busy ? 'Odemykám…' : 'Odemknout'}
      </button>
      <button type="button" className="link-btn" onClick={() => void forgot()}>
        Zapomněli jste heslo?
      </button>
    </form>
  );
}

export function Gate() {
  const phase = useUiStore((s) => s.phase);
  return <div className="gate">{phase === 'setup' ? <Setup /> : phase === 'locked' ? <Unlock /> : <div className="spinner" />}</div>;
}
