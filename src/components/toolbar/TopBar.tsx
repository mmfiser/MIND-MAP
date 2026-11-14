import {
  CornerDownRight,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  Grid3x3,
  ListPlus,
  ListTree,
  Lock,
  Moon,
  MoreHorizontal,
  Redo2,
  Save,
  Settings,
  Sun,
  Trash,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useMemo } from 'react';
import { listTrash } from '../../model/trash';
import { useCallback, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { addChildTo, addSiblingTo, createProject, deleteWithConfirm } from '../../app/actions';
import { openFromFile, saveToFile } from '../../app/fileSync';
import { lock, updateSettings } from '../../app/session';
import { useIsMobile } from '../../hooks/useIsMobile';
import { hasFileSystemAccess } from '../../storage/fileIO';
import { useDocStore } from '../../store/docStore';
import { useUiStore } from '../../store/uiStore';
import { Menu, type MenuEntry } from '../common/Menu';

const I = 19;

interface TbProps {
  icon: ReactNode;
  label: string;
  title?: string;
  onClick: (e: ReactMouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
  children?: ReactNode;
}

function Tb({ icon, label, title, onClick, disabled, active, className, children }: TbProps) {
  return (
    <button
      className={`tb-btn${active ? ' active' : ''}${className ? ` ${className}` : ''}`}
      title={title ?? label}
      aria-label={title ?? label}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      <span className="tb-label">{label}</span>
      {children}
    </button>
  );
}

export function TopBar() {
  const mobile = useIsMobile();
  const selectedId = useUiStore((s) => s.selectedId);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const gridVisible = useUiStore((s) => s.gridVisible);
  const theme = useUiStore((s) => s.theme);
  const fileName = useUiStore((s) => s.fileName);
  const canUndo = useDocStore((s) => s.past.length > 0);
  const canRedo = useDocStore((s) => s.future.length > 0);
  const dirty = useDocStore((s) => s.dirty);
  const doc = useDocStore((s) => s.doc);
  const trashCount = useMemo(() => (doc ? listTrash(doc).length : 0), [doc]);
  const openTrash = () => ui().set({ trashOpen: true });
  const [more, setMore] = useState<{ x: number; y: number } | null>(null);
  const closeMore = useCallback(() => setMore(null), []);
  const fsa = hasFileSystemAccess();

  const ui = useUiStore.getState;
  const toggleSidebar = () => {
    const open = !ui().sidebarOpen;
    ui().set({ sidebarOpen: open });
    if (!mobile) void updateSettings({ sidebarOpen: open });
  };
  const toggleGrid = () => {
    const v = !ui().gridVisible;
    ui().set({ gridVisible: v });
    void updateSettings({ gridVisible: v });
  };
  const toggleTheme = () => {
    const t = ui().theme === 'dark' ? 'light' : 'dark';
    ui().set({ theme: t });
    try {
      localStorage.setItem('mapa-theme', t);
    } catch {
      /* nevadí */
    }
  };
  const undo = () => useDocStore.getState().undo();
  const redo = () => useDocStore.getState().redo();

  const saveTitle = dirty ? 'Uložit do souboru – máte neuložené změny (Ctrl+S)' : 'Uložit do souboru (Ctrl+S)';
  const saveBtn = (
    <Tb
      icon={<Save size={I} />}
      label="Uložit"
      title={saveTitle}
      onClick={() => void saveToFile(false)}
      className={`save${dirty ? ' unsaved' : ''}`}
    >
      {dirty && <span className="unsaved-dot" aria-hidden />}
    </Tb>
  );

  const themeIcon = theme === 'dark' ? <Sun size={I} /> : <Moon size={I} />;
  const themeLabel = theme === 'dark' ? 'Světlý režim' : 'Tmavý režim';

  const moreEntries: MenuEntry[] = mobile
    ? [
        { key: 'sib', label: 'Sourozenec', icon: <ListPlus size={18} />, disabled: !selectedId, onSelect: () => addSiblingTo(selectedId) },
        { key: 'del', label: 'Smazat…', icon: <Trash2 size={18} />, danger: true, disabled: !selectedId, onSelect: () => void deleteWithConfirm(selectedId) },
        { key: 'redo', label: 'Znovu', icon: <Redo2 size={18} />, disabled: !canRedo, onSelect: redo },
        'sep',
        { key: 'open', label: 'Otevřít soubor', icon: <FolderOpen size={18} />, onSelect: () => void openFromFile() },
        ...(fsa ? [{ key: 'saveAs', label: 'Uložit jako…', icon: <FilePlus2 size={18} />, onSelect: () => void saveToFile(true) }] : []),
        'sep',
        { key: 'grid', label: gridVisible ? 'Skrýt mřížku' : 'Zobrazit mřížku', icon: <Grid3x3 size={18} />, onSelect: toggleGrid },
        { key: 'theme', label: themeLabel, icon: themeIcon, onSelect: toggleTheme },
        { key: 'trash', label: trashCount ? `Koš (${trashCount})` : 'Koš', icon: <Trash size={18} />, onSelect: openTrash },
        { key: 'settings', label: 'Nastavení', icon: <Settings size={18} />, onSelect: () => ui().set({ settingsOpen: true }) },
        { key: 'lock', label: 'Zamknout', icon: <Lock size={18} />, onSelect: () => void lock() },
      ]
    : [
        { key: 'settings', label: 'Nastavení', icon: <Settings size={18} />, onSelect: () => ui().set({ settingsOpen: true }) },
        { key: 'lock', label: 'Zamknout', icon: <Lock size={18} />, onSelect: () => void lock() },
      ];

  const openMore = (e: ReactMouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMore({ x: r.right, y: r.bottom + 6 });
  };

  if (mobile) {
    return (
      <header className="topbar">
        <Tb icon={<ListTree size={I} />} label="Rejstřík" onClick={toggleSidebar} active={sidebarOpen} />
        <Tb icon={<FolderPlus size={I} />} label="Nový projekt" onClick={() => createProject()} />
        <Tb icon={<CornerDownRight size={I} />} label="Podúkol" onClick={() => addChildTo(selectedId)} disabled={!selectedId} />
        <Tb icon={<Undo2 size={I} />} label="Zpět" onClick={undo} disabled={!canUndo} />
        <div className="spacer" />
        {saveBtn}
        <Tb icon={<MoreHorizontal size={I} />} label="Další" onClick={openMore} />
        {more && <Menu x={more.x} y={more.y} entries={moreEntries} onClose={closeMore} alignRight />}
      </header>
    );
  }

  return (
    <header className="topbar">
      <Tb icon={<ListTree size={I} />} label="Rejstřík" onClick={toggleSidebar} active={sidebarOpen} />
      <div className="brand">
        <span className="file" title="Název souboru">
          {fileName}
        </span>
      </div>
      <div className="sep" />
      <Tb icon={<FolderPlus size={I} />} label="Nový projekt" onClick={() => createProject()} />
      <Tb icon={<CornerDownRight size={I} />} label="Podúkol" title="Podúkol (Tab)" onClick={() => addChildTo(selectedId)} disabled={!selectedId} />
      <Tb icon={<ListPlus size={I} />} label="Sourozenec" title="Sourozenec (Enter)" onClick={() => addSiblingTo(selectedId)} disabled={!selectedId} />
      <Tb icon={<Trash2 size={I} />} label="Smazat" title="Smazat (Delete)" onClick={() => void deleteWithConfirm(selectedId)} disabled={!selectedId} />
      <div className="sep" />
      <Tb icon={<Undo2 size={I} />} label="Zpět" title="Zpět (Ctrl+Z)" onClick={undo} disabled={!canUndo} />
      <Tb icon={<Redo2 size={I} />} label="Znovu" title="Znovu (Ctrl+Y)" onClick={redo} disabled={!canRedo} />
      <div className="spacer" />
      {dirty && <span className="unsaved-text">Neuloženo do souboru</span>}
      {saveBtn}
      {fsa && <Tb icon={<FilePlus2 size={I} />} label="Uložit jako" title="Uložit jako… (Ctrl+Shift+S)" onClick={() => void saveToFile(true)} />}
      <Tb icon={<FolderOpen size={I} />} label="Otevřít" title="Otevřít soubor" onClick={() => void openFromFile()} />
      <div className="sep" />
      <Tb icon={<Trash size={I} />} label="Koš" title={trashCount ? `Koš (${trashCount})` : 'Koš'} onClick={openTrash}>
        {trashCount > 0 && <span className="count-badge">{trashCount}</span>}
      </Tb>
      <Tb icon={<Grid3x3 size={I} />} label="Mřížka" onClick={toggleGrid} active={gridVisible} />
      <Tb icon={themeIcon} label={theme === 'dark' ? 'Světlý' : 'Tmavý'} title={themeLabel} onClick={toggleTheme} />
      <Tb icon={<MoreHorizontal size={I} />} label="Další" onClick={openMore} />
      {more && <Menu x={more.x} y={more.y} entries={moreEntries} onClose={closeMore} alignRight />}
    </header>
  );
}
