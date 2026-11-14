import { ReactFlowProvider } from '@xyflow/react';
import { FolderPlus, RefreshCw } from 'lucide-react';
import { useEffect } from 'react';
import { createProject } from './app/actions';
import { boot } from './app/session';
import { reloadToUpdate } from './app/updates';
import { Canvas } from './components/canvas/Canvas';
import { NodeContextMenu } from './components/canvas/NodeContextMenu';
import { DetailPanel } from './components/detail/DetailPanel';
import { Busy, Dialogs, Toasts } from './components/dialogs/Dialogs';
import { Gate } from './components/Gate';
import { Sidebar } from './components/sidebar/Sidebar';
import { TopBar } from './components/toolbar/TopBar';
import { useBeforeUnload } from './hooks/useBeforeUnload';
import { useShortcuts } from './hooks/useShortcuts';
import { useDocStore } from './store/docStore';
import { useUiStore } from './store/uiStore';

function EmptyHint() {
  const empty = useDocStore((s) => !!s.doc && Object.keys(s.doc.nodes).length === 0);
  if (!empty) return null;
  return (
    <div className="empty-hint">
      <div className="card">
        <h2>Prázdná mapa</h2>
        <p>Začněte prvním projektem. Na notebooku stačí dvojklik na plochu.</p>
        <button className="btn primary" onClick={() => createProject()} style={{ marginTop: 12 }}>
          <FolderPlus size={18} /> Nový projekt
        </button>
      </div>
    </div>
  );
}

function UpdateBanner() {
  const ready = useUiStore((s) => s.updateReady);
  if (!ready) return null;
  return (
    <div className="update-banner" role="status">
      <span>Je k dispozici nová verze aplikace.</span>
      <button className="btn small primary" onClick={() => void reloadToUpdate()}>
        <RefreshCw size={15} /> Obnovit
      </button>
    </div>
  );
}

function Workspace() {
  return (
    <ReactFlowProvider>
      <div className="app">
        <TopBar />
        <main className="workspace">
          <Sidebar />
          <Canvas />
          <EmptyHint />
          <DetailPanel />
        </main>
      </div>
      <NodeContextMenu />
    </ReactFlowProvider>
  );
}

export function App() {
  const phase = useUiStore((s) => s.phase);
  const theme = useUiStore((s) => s.theme);
  useShortcuts();
  useBeforeUnload();

  useEffect(() => {
    void boot();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#1c1f26' : '#ffffff');
  }, [theme]);

  return (
    <>
      {phase === 'ready' ? <Workspace /> : <Gate />}
      <Dialogs />
      <UpdateBanner />
      <Toasts />
      <Busy />
    </>
  );
}
