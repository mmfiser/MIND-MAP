import {
  CornerDownRight,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  FoldVertical,
  Grid3x3,
  Highlighter,
  Link2,
  ListPlus,
  ListTree,
  Lock,
  Milestone,
  Moon,
  MoreHorizontal,
  Redo2,
  Save,
  Settings,
  Sun,
  Trash,
  Trash2,
  Undo2,
  UnfoldVertical,
  ZoomIn,
  Scaling,
  Search as SearchIcon,
  Filter as FilterIcon,
} from 'lucide-react';
import { BellButton } from './Bell';
import { filterCount, openFilter } from './Filter';
import { SearchBox, focusSearch } from './Search';
import { useMemo } from 'react';
import { listTrash } from '../../model/trash';
import { Fragment, useCallback, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { addChildTo, addSiblingTo, createProject, deleteWithConfirm } from '../../app/actions';
import { openFromFile, saveToFile } from '../../app/fileSync';
import { addMilestone, collapseAll, expandEverything, startLinkPick } from '../../app/linkActions';
import { lock, updateSettings } from '../../app/session';
import { useIsMobile } from '../../hooks/useIsMobile';
import { hasFileSystemAccess } from '../../storage/fileIO';
import { useDocStore } from '../../store/docStore';
import { useUiStore, writeFlag } from '../../store/uiStore';
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
  const highlightLinks = useUiStore((s) => s.highlightLinks);
  const autoDetail = useUiStore((s) => s.autoDetail);
  const scaleNodes = useUiStore((s) => s.scaleNodes);
  const picking = useUiStore((s) => !!s.linkPick);
  const fileName = useUiStore((s) => s.fileName);
  const searchOpen = useUiStore((s) => s.searchOpen);
  const nFilter = filterCount(useUiStore((s) => s.filter));
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
  const toggleHighlight = () => {
    const v = !ui().highlightLinks;
    ui().set({ highlightLinks: v });
    writeFlag('mapa-highlight-links', v);
  };
  const toggleAutoDetail = () => {
    const v = !ui().autoDetail;
    ui().set({ autoDetail: v });
    writeFlag('mapa-auto-detail', v);
  };
  const toggleScaleNodes = () => {
    const v = !ui().scaleNodes;
    ui().set({ scaleNodes: v });
    writeFlag('mapa-scale-nodes', v);
  };
  const viewEntries: MenuEntry[] = [
    { key: 'zoom80', label: 'Zoom 80 % (celá mapa uprostřed)', icon: <ZoomIn size={18} />, onSelect: () => ui().zoomPreset() },
    {
      key: 'autoDetail',
      label: autoDetail ? 'Automatický detail podle zoomu ✓' : 'Automatický detail podle zoomu',
      icon: <ZoomIn size={18} />,
      onSelect: toggleAutoDetail,
    },
    {
      key: 'scaleNodes',
      label: scaleNodes ? 'Zvětšovat uzly při oddálení ✓' : 'Zvětšovat uzly při oddálení',
      icon: <Scaling size={18} />,
      onSelect: toggleScaleNodes,
    },
    { key: 'collapseAll', label: 'Sbalit vše na projekty', icon: <FoldVertical size={18} />, onSelect: collapseAll },
    { key: 'expandAll', label: 'Rozbalit vše', icon: <UnfoldVertical size={18} />, onSelect: expandEverything },
    {
      key: 'highlight',
      label: highlightLinks ? 'Zvýrazňovat vazby vybraného uzlu ✓' : 'Zvýrazňovat vazby vybraného uzlu',
      icon: <Highlighter size={18} />,
      onSelect: toggleHighlight,
    },
  ];
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
        { key: 'link', label: 'Propojit…', icon: <Link2 size={18} />, disabled: !selectedId, onSelect: () => startLinkPick(selectedId) },
        { key: 'filter', label: nFilter ? `Filtr (${nFilter})` : 'Filtr…', icon: <FilterIcon size={18} />, onSelect: openFilter },
        'sep',
        { key: 'sib', label: 'Sourozenec', icon: <ListPlus size={18} />, disabled: !selectedId, onSelect: () => addSiblingTo(selectedId) },
        { key: 'ms', label: 'Milník', icon: <Milestone size={18} />, onSelect: () => addMilestone(selectedId) },
        { key: 'del', label: 'Smazat…', icon: <Trash2 size={18} />, danger: true, disabled: !selectedId, onSelect: () => void deleteWithConfirm(selectedId) },
        { key: 'redo', label: 'Znovu', icon: <Redo2 size={18} />, disabled: !canRedo, onSelect: redo },
        'sep',
        ...viewEntries,
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
        ...viewEntries,
        'sep',
        // Na užších obrazovkách (pod 1100 px) jsou tato tlačítka jen tady.
        { key: 'open', label: 'Otevřít soubor', icon: <FolderOpen size={18} />, onSelect: () => void openFromFile() },
        ...(fsa ? [{ key: 'saveAs', label: 'Uložit jako…', icon: <FilePlus2 size={18} />, onSelect: () => void saveToFile(true) }] : []),
        { key: 'grid', label: gridVisible ? 'Skrýt mřížku' : 'Zobrazit mřížku', icon: <Grid3x3 size={18} />, onSelect: toggleGrid },
        { key: 'theme', label: themeLabel, icon: themeIcon, onSelect: toggleTheme },
        'sep',
        { key: 'settings', label: 'Nastavení', icon: <Settings size={18} />, onSelect: () => ui().set({ settingsOpen: true }) },
        { key: 'lock', label: 'Zamknout', icon: <Lock size={18} />, onSelect: () => void lock() },
      ];

  const openMore = (e: ReactMouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMore({ x: r.right, y: r.bottom + 6 });
  };

  if (mobile) {
    // Hledání na telefonu: pole přes celou šířku lišty.
    if (searchOpen) {
      return (
        <header className="topbar searching">
          <SearchBox mobile />
        </header>
      );
    }
    // Pořadí tlačítek na telefonu – seznam, aby šel snadno upravit (fáze 5: zámek pozic).
    const items: { key: string; el: ReactNode }[] = [
      { key: 'sidebar', el: <Tb icon={<ListTree size={I} />} label="Rejstřík" onClick={toggleSidebar} active={sidebarOpen} /> },
      { key: 'project', el: <Tb icon={<FolderPlus size={I} />} label="Nový projekt" onClick={() => createProject()} /> },
      { key: 'child', el: <Tb icon={<CornerDownRight size={I} />} label="Podúkol" onClick={() => addChildTo(selectedId)} disabled={!selectedId} /> },
      { key: 'undo', el: <Tb icon={<Undo2 size={I} />} label="Zpět" onClick={undo} disabled={!canUndo} /> },
      { key: 'spacer', el: <div className="spacer" /> },
      { key: 'search', el: <Tb icon={<SearchIcon size={I} />} label="Hledat" onClick={focusSearch} /> },
      { key: 'bell', el: <BellButton /> },
      { key: 'save', el: saveBtn },
      {
        key: 'more',
        el: (
          <Tb icon={<MoreHorizontal size={I} />} label="Další" onClick={openMore} active={picking || nFilter > 0}>
            {nFilter > 0 && <span className="filter-dot" aria-label="Filtr je zapnutý" />}
          </Tb>
        ),
      },
    ];
    return (
      <header className="topbar">
        {items.map((i) => (
          <Fragment key={i.key}>{i.el}</Fragment>
        ))}
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
      <Tb icon={<Milestone size={I} />} label="Milník" title="Nový milník (pod vybraný uzel, jinak uprostřed plochy)" onClick={() => addMilestone(selectedId)} />
      <Tb icon={<Link2 size={I} />} label="Propojit" title="Propojit vybraný uzel s jiným (nebo táhněte z konektoru na okraji uzlu)" onClick={() => startLinkPick(selectedId)} disabled={!selectedId} active={picking} />
      <Tb icon={<Trash2 size={I} />} label="Smazat" title="Smazat (Delete)" onClick={() => void deleteWithConfirm(selectedId)} disabled={!selectedId} />
      <div className="sep" />
      <Tb icon={<Undo2 size={I} />} label="Zpět" title="Zpět (Ctrl+Z)" onClick={undo} disabled={!canUndo} />
      <Tb icon={<Redo2 size={I} />} label="Znovu" title="Znovu (Ctrl+Y)" onClick={redo} disabled={!canRedo} />
      <div className="spacer" />
      <SearchBox mobile={false} />
      <Tb icon={<FilterIcon size={I} />} label="Filtr" title={nFilter ? `Filtr (${nFilter} kritérií)` : 'Filtr'} onClick={openFilter} active={nFilter > 0}>
        {nFilter > 0 && <span className="count-badge accent">{nFilter}</span>}
      </Tb>
      <BellButton />
      <div className="sep" />
      {dirty && <span className="unsaved-text">Neuloženo do souboru</span>}
      {saveBtn}
      {fsa && <Tb icon={<FilePlus2 size={I} />} label="Uložit jako" title="Uložit jako… (Ctrl+Shift+S)" onClick={() => void saveToFile(true)} className="tb-optional" />}
      <Tb icon={<FolderOpen size={I} />} label="Otevřít" title="Otevřít soubor" onClick={() => void openFromFile()} className="tb-optional" />
      <div className="sep" />
      <Tb icon={<Trash size={I} />} label="Koš" title={trashCount ? `Koš (${trashCount})` : 'Koš'} onClick={openTrash}>
        {trashCount > 0 && <span className="count-badge">{trashCount}</span>}
      </Tb>
      <Tb icon={<Grid3x3 size={I} />} label="Mřížka" onClick={toggleGrid} active={gridVisible} className="tb-optional" />
      <Tb icon={themeIcon} label={theme === 'dark' ? 'Světlý' : 'Tmavý'} title={themeLabel} onClick={toggleTheme} className="tb-optional" />
      <Tb icon={<MoreHorizontal size={I} />} label="Další" onClick={openMore} />
      {more && <Menu x={more.x} y={more.y} entries={moreEntries} onClose={closeMore} alignRight />}
    </header>
  );
}
