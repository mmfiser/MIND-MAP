import { useEffect, useMemo, useState } from 'react';
import { addParentTo, moveUnder, parentCandidates, updateNodeFields } from '../../app/actions';
import { checkPersistence, getSettings, setDeviceName, wipeLocalData } from '../../app/session';
import { parentEdges } from '../../model/graph';
import { colorHex } from '../../model/labels';
import { hasFileSystemAccess, canShareFiles } from '../../storage/fileIO';
import { useDocStore } from '../../store/docStore';
import { confirmDialog, toast, useUiStore } from '../../store/uiStore';
import { Dialog } from './Dialog';

/** Obecný dialog s volbou (potvrzení, konflikty verzí, chyby). */
function ChoiceDialogView() {
  const choice = useUiStore((s) => s.choice);
  if (!choice) return null;
  const done = (v: string | null) => {
    useUiStore.getState().set({ choice: null });
    choice.resolve(v);
  };
  const hasCancel = choice.options.some((o) => o.value === 'cancel');
  return (
    <Dialog
      title={choice.title}
      onClose={() => done(hasCancel ? 'cancel' : choice.options[0]?.value ?? null)}
      wide={!!choice.details}
      footer={choice.options.map((o) => (
        <button
          key={o.value}
          className={`btn${o.variant === 'primary' ? ' primary' : o.variant === 'danger' ? ' danger' : ''}`}
          onClick={() => done(o.value)}
          data-autofocus={o.variant === 'primary' ? true : undefined}
        >
          {o.label}
        </button>
      ))}
    >
      {choice.message && <p>{choice.message}</p>}
      {choice.details && (
        <div className="compare">
          {choice.details.map((d) => (
            <div className="col" key={d.label}>
              <h3>{d.label}</h3>
              <dl>
                {d.rows.map(([k, v]) => (
                  <div key={k} style={{ display: 'contents' }}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}

function PasswordDialogView() {
  const pd = useUiStore((s) => s.password);
  const [value, setValue] = useState('');
  useEffect(() => setValue(''), [pd]);
  if (!pd) return null;
  const done = (v: string | null) => {
    useUiStore.getState().set({ password: null });
    pd.resolve(v);
  };
  return (
    <Dialog
      title={pd.title}
      onClose={() => done(null)}
      footer={
        <>
          <button className="btn" onClick={() => done(null)}>
            Zrušit
          </button>
          <button className="btn primary" disabled={!value} onClick={() => done(value)}>
            {pd.confirmLabel}
          </button>
        </>
      }
    >
      {pd.message && <p>{pd.message}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value) done(value);
        }}
      >
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Heslo"
          data-autofocus
        />
      </form>
      {pd.error && <div className="error-text">{pd.error}</div>}
    </Dialog>
  );
}

function NotesDialog() {
  const id = useUiStore((s) => s.notesFor);
  const node = useDocStore((s) => (id ? s.doc?.nodes[id] : undefined));
  const [value, setValue] = useState('');
  useEffect(() => {
    if (id) setValue(useDocStore.getState().doc?.nodes[id]?.notes ?? '');
  }, [id]);
  if (!id || !node) return null;
  const close = () => useUiStore.getState().set({ notesFor: null });
  return (
    <Dialog
      title={`Poznámky – ${node.title.trim() || 'bez názvu'}`}
      onClose={close}
      wide
      className="notes-dialog"
      dismissable={false}
      footer={
        <button className="btn primary" onClick={close}>
          Hotovo
        </button>
      }
    >
      <textarea
        className="textarea"
        value={value}
        placeholder="Poznámky, popis…"
        onChange={(e) => {
          setValue(e.target.value);
          updateNodeFields(id, { notes: e.target.value }, `notes:${id}`);
        }}
        data-autofocus
      />
    </Dialog>
  );
}

/** Výběr cílového rodiče pro „Přesunout pod…“ a „Přidat rodiče“. */
function PickerDialog() {
  const picker = useUiStore((s) => s.picker);
  const doc = useDocStore((s) => s.doc);
  const [filter, setFilter] = useState('');
  const [from, setFrom] = useState<string | null>(null);
  useEffect(() => {
    setFilter('');
    setFrom(picker?.fromParentId ?? null);
  }, [picker]);
  const candidates = useMemo(
    () => (picker ? parentCandidates(picker.nodeId, picker.mode, picker.mode === 'move' ? from : null) : []),
    [picker, from, doc], // eslint-disable-line react-hooks/exhaustive-deps
  );
  if (!picker || !doc?.nodes[picker.nodeId]) return null;
  const node = doc.nodes[picker.nodeId]!;
  const parents = parentEdges(doc, picker.nodeId);
  const close = () => useUiStore.getState().set({ picker: null });
  const q = filter.trim().toLocaleLowerCase('cs');
  const shown = candidates.filter((c) => !q || c.node.title.toLocaleLowerCase('cs').includes(q));
  const title = picker.mode === 'move' ? 'Přesunout pod…' : 'Přidat dalšího rodiče';

  const pick = (targetId: string, reason?: string) => {
    if (reason) {
      const t = doc.nodes[targetId]?.title.trim() || 'bez názvu';
      if (reason === 'vznikl by cyklus') {
        toast(`Nelze: „${t}“ leží ve větvi uzlu „${node.title.trim() || 'bez názvu'}“, vznikl by cyklus.`, 'error');
      } else toast(`Nelze: „${t}“ ${reason}.`, 'error');
      return;
    }
    const ok = picker.mode === 'move' ? moveUnder(picker.nodeId, from, targetId) : addParentTo(picker.nodeId, targetId);
    if (ok) close();
  };

  return (
    <Dialog title={title} onClose={close}>
      <p>
        Uzel <strong>„{node.title.trim() || 'bez názvu'}“</strong>
        {picker.mode === 'move' ? ' se i s celou větví přesune pod vybraný uzel.' : ' bude sdílený – zůstane i pod stávajícími rodiči.'}
      </p>
      {picker.mode === 'move' && parents.length > 1 && (
        <label className="field">
          <span>Odpojit od rodiče</span>
          <select className="select" value={from ?? ''} onChange={(e) => setFrom(e.target.value || null)}>
            {parents.map((p) => (
              <option key={p.id} value={p.source}>
                {doc.nodes[p.source]?.title.trim() || 'bez názvu'}
              </option>
            ))}
          </select>
        </label>
      )}
      <input className="input" placeholder="Hledat uzel…" value={filter} onChange={(e) => setFilter(e.target.value)} data-autofocus />
      <div className="picker-list">
        {shown.length === 0 && <div className="muted">Žádný vhodný uzel.</div>}
        {shown.map(({ node: n, disabledReason }) => (
          <button
            key={n.id}
            className={`picker-item${disabledReason ? ' disabled' : ''}`}
            onClick={() => pick(n.id, disabledReason)}
            aria-disabled={!!disabledReason}
          >
            <span
              className={`tree-dot${n.type === 'project' ? '' : ' task'}`}
              style={{ background: n.type === 'project' ? colorHex(n.color) : 'var(--text-3)' }}
            />
            <span className={`tree-title${n.type === 'project' ? ' project' : ''}${n.title.trim() ? '' : ' empty'}`}>
              {n.title.trim() || 'Bez názvu'}
            </span>
            {disabledReason && <span className="why">{disabledReason}</span>}
          </button>
        ))}
      </div>
    </Dialog>
  );
}

const PERSIST_TEXT: Record<string, string> = {
  granted: 'Povoleno – prohlížeč data sám nesmaže.',
  denied: 'Nepovoleno – při nedostatku místa může prohlížeč data smazat. Pravidelně ukládejte do souboru.',
  unsupported: 'Prohlížeč trvalé úložiště nepodporuje.',
  unknown: 'Zjišťuji…',
};

function SettingsDialog() {
  const open = useUiStore((s) => s.settingsOpen);
  const persist = useUiStore((s) => s.persistStatus);
  const [name, setName] = useState('');
  useEffect(() => {
    if (open) setName(getSettings().deviceName);
  }, [open]);
  if (!open) return null;
  const close = () => useUiStore.getState().set({ settingsOpen: false });
  const save = async () => {
    const n = name.trim();
    if (!n) return;
    await setDeviceName(n);
    toast('Nastavení uloženo.', 'success');
    close();
  };
  return (
    <Dialog
      title="Nastavení"
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>
            Zavřít
          </button>
          <button className="btn primary" disabled={!name.trim()} onClick={() => void save()}>
            Uložit
          </button>
        </>
      }
    >
      <label className="field">
        <span>Název zařízení</span>
        <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="např. Notebook" />
      </label>
      <div className="field">
        <span>Trvalé úložiště prohlížeče</span>
        <div>{PERSIST_TEXT[persist]}</div>
        {persist === 'denied' && (
          <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => void checkPersistence(true)}>
            Požádat znovu
          </button>
        )}
      </div>
      <div className="field">
        <span>Ukládání do souboru</span>
        <div>
          {hasFileSystemAccess()
            ? 'Přímý zápis do souboru (File System Access API).'
            : canShareFiles()
              ? 'Sdílení souboru (Sdílet → OneDrive), jinak stažení.'
              : 'Stažení souboru.'}
        </div>
      </div>
      <div className="field">
        <span>Verze aplikace</span>
        <div>{__APP_VERSION__}</div>
      </div>
      <div className="field">
        <span>Lokální data</span>
        <button
          className="btn small danger"
          style={{ alignSelf: 'flex-start' }}
          onClick={async () => {
            const ok = await confirmDialog(
              'Smazat data v prohlížeči?',
              'Smaže se šifrovaná pracovní kopie i nastavení v tomto prohlížeči. Soubory na OneDrive zůstanou. Neuložené změny se ztratí.',
              'Smazat data',
              true,
            );
            if (ok) await wipeLocalData();
          }}
        >
          Smazat data v prohlížeči…
        </button>
      </div>
    </Dialog>
  );
}

export function Toasts() {
  const toasts = useUiStore((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={() => useUiStore.getState().dismissToast(t.id)}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Busy() {
  const busy = useUiStore((s) => s.busy);
  if (!busy) return null;
  return (
    <div className="busy" role="status">
      <div className="card">
        <div className="spinner" />
        {busy}
      </div>
    </div>
  );
}

export function Dialogs() {
  return (
    <>
      <NotesDialog />
      <PickerDialog />
      <SettingsDialog />
      <PasswordDialogView />
      <ChoiceDialogView />
    </>
  );
}
