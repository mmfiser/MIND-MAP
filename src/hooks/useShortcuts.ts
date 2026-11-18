import { useEffect } from 'react';
import { addChildTo, addSiblingTo, deleteWithConfirm } from '../app/actions';
import { saveToFile } from '../app/fileSync';
import { cancelLinkPick, toggleCollapse } from '../app/linkActions';
import { focusSearch } from '../components/toolbar/Search';
import { useDocStore } from '../store/docStore';
import { useUiStore } from '../store/uiStore';

function isEditable(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
}

/**
 * Klávesové zkratky: Tab = podúkol, Enter = sourozenec, Delete = smazat,
 * F = vystředit vybraný, mezerník = sbalit / rozbalit větev, Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z, Ctrl+S.
 */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUiStore.getState();
      if (ui.phase !== 'ready') return;
      const modalOpen = !!(ui.choice || ui.password || ui.picker || ui.notesFor || ui.settingsOpen || ui.trashOpen || ui.subMenu || ui.filterOpen || ui.bellOpen);
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (ctrl && key === 'f' && !modalOpen) {
        e.preventDefault();
        focusSearch();
        return;
      }
      if (ctrl && key === 's') {
        e.preventDefault();
        if (!modalOpen) void saveToFile(e.shiftKey);
        return;
      }
      if (modalOpen || isEditable(e.target)) return;

      if (ctrl && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useDocStore.getState().undo();
        return;
      }
      if (ctrl && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault();
        useDocStore.getState().redo();
        return;
      }
      if (ctrl || e.altKey) return;
      if (e.key === '/') {
        e.preventDefault();
        focusSearch();
        return;
      }

      const sel = ui.selectedId;
      if (e.key === 'Escape') {
        if (ui.contextMenu) ui.set({ contextMenu: null });
        else if (ui.linkPick) cancelLinkPick();
        else if (ui.selectedEdge) ui.set({ selectedEdge: null, edgeMenu: null });
        else ui.select(null);
        return;
      }
      if (!sel) return;
      if (e.key === 'Tab') {
        e.preventDefault();
        addChildTo(sel);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        addSiblingTo(sel);
      } else if (e.key === 'Delete') {
        e.preventDefault();
        void deleteWithConfirm(sel);
      } else if (key === 'f') {
        e.preventDefault();
        ui.focusNode(sel);
      } else if (e.key === ' ' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        toggleCollapse(sel);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
