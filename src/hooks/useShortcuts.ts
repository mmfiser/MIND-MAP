import { useEffect } from 'react';
import { addChildTo, addSiblingTo, deleteWithConfirm } from '../app/actions';
import { saveToFile } from '../app/fileSync';
import { cancelLinkPick, toggleCollapse } from '../app/linkActions';
import {
  ARROW_STEP,
  ARROW_STEP_LARGE,
  clearSelection,
  deleteSelectionWithConfirm,
  moveSelection,
  selectAllVisible,
} from '../app/bulkActions';
import { focusSearch } from '../components/toolbar/Search';
import { toggleGlobalLock, toggleNodeLock } from '../app/lockActions';
import { arrangeSelection } from '../app/layoutActions';
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
      const modalOpen = !!(
        ui.choice ||
        ui.password ||
        ui.picker ||
        ui.notesFor ||
        ui.settingsOpen ||
        ui.trashOpen ||
        ui.subMenu ||
        ui.filterOpen ||
        ui.bellOpen ||
        ui.helpOpen ||
        ui.aboutOpen
      );
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

      if (ctrl && key === 'a') {
        e.preventDefault();
        selectAllVisible();
        return;
      }
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
      if (e.key === '?') {
        e.preventDefault();
        ui.set({ helpOpen: true });
        return;
      }
      if (e.key === 'P' && e.shiftKey) {
        // Shift+P: globální zámek pozic
        e.preventDefault();
        toggleGlobalLock();
        return;
      }

      const sel = ui.selectedId;
      if (e.key === 'Escape') {
        if (ui.contextMenu) ui.set({ contextMenu: null });
        else if (ui.linkPick) cancelLinkPick();
        else if (ui.selectedEdge) ui.set({ selectedEdge: null, edgeMenu: null });
        else {
          clearSelection();
          if (ui.multiMode) ui.set({ multiMode: false });
        }
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
        void (ui.selection.length > 1 ? deleteSelectionWithConfirm() : deleteWithConfirm(sel));
      } else if (e.key.startsWith('Arrow')) {
        // Šipky: posun vybraných uzlů o krok mřížky (Shift = větší krok).
        e.preventDefault();
        const step = e.shiftKey ? ARROW_STEP_LARGE : ARROW_STEP;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        moveSelection(dx, dy);
      } else if (key === 'p' && !e.shiftKey) {
        e.preventDefault();
        toggleNodeLock();
      } else if (key === 'l') {
        e.preventDefault();
        void arrangeSelection();
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
