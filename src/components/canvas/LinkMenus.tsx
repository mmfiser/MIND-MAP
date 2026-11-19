import { ArrowLeftRight, Eye, GitBranchPlus, Link2, Lock, MoveRight, Spline, Trash2, Unlink, X } from 'lucide-react';
import { useCallback } from 'react';
import {
  cancelLinkPick,
  changeLinkKind,
  clearEdgeSelection,
  createLink,
  describeEdge,
  goToNode,
  nodeName,
  removeLinkById,
  reverseLink,
  startReconnectPick,
} from '../../app/linkActions';
import { detachFrom } from '../../app/actions';
import { linksCount } from '../../model/messages';
import { parentEdges } from '../../model/graph';
import { useDocStore } from '../../store/docStore';
import { toast, useUiStore } from '../../store/uiStore';
import { Menu, type MenuEntry } from '../common/Menu';

const I = 17;

/** Nabídka vybrané vazby (klik / klepnutí na čáru). */
export function EdgeMenu() {
  const menu = useUiStore((s) => s.edgeMenu);
  const close = useCallback(() => useUiStore.getState().set({ edgeMenu: null }), []);
  if (!menu) return null;
  const doc = useDocStore.getState().doc;
  if (!doc) return null;
  const edges = menu.edgeIds.map((id) => doc.edges[id]).filter((e) => !!e);
  if (!edges.length) return null;
  const isVisible = (id: string) => !!document.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"]`);
  let entries: MenuEntry[];

  if (edges.length > 1) {
    entries = [
      { title: `${linksCount(edges.length)} do sbalené větve` },
      ...edges.map((e) => {
        const hidden = isVisible(e.target) ? e.source : e.target;
        return {
          key: e.id,
          label: describeEdge(doc, e),
          icon: <Eye size={I} />,
          onSelect: () => {
            clearEdgeSelection();
            goToNode(hidden);
          },
        };
      }),
    ];
  } else {
    const e = edges[0]!;
    const s = nodeName(doc, e.source);
    const t = nodeName(doc, e.target);
    const hiddenEnd = !isVisible(e.source) ? e.source : !isVisible(e.target) ? e.target : null;
    entries = [{ title: e.kind === 'hierarchy' ? `Hierarchie: ${s} → ${t}` : e.kind === 'dependency' ? `Závislost: ${s} blokuje ${t}` : `Souvislost: ${s} – ${t}` }];
    if (hiddenEnd) {
      entries.push({
        key: 'reveal',
        label: `Zobrazit ${nodeName(doc, hiddenEnd)} (ve sbalené větvi)`,
        icon: <Eye size={I} />,
        onSelect: () => {
          clearEdgeSelection();
          goToNode(hiddenEnd);
        },
      });
    }
    if (e.kind === 'dependency') {
      entries.push(
        { key: 'rev', label: 'Otočit směr', icon: <ArrowLeftRight size={I} />, onSelect: () => reverseLink(e.id) },
        { key: 'rel', label: 'Změnit na souvislost', icon: <Spline size={I} />, onSelect: () => changeLinkKind(e.id, 'related') },
      );
    } else if (e.kind === 'related') {
      entries.push(
        { key: 'dep1', label: `Změnit na závislost: ${s} blokuje ${t}`, icon: <Lock size={I} />, onSelect: () => changeLinkKind(e.id, 'dependency') },
        { key: 'dep2', label: `Změnit na závislost: ${t} blokuje ${s}`, icon: <Lock size={I} />, onSelect: () => changeLinkKind(e.id, 'dependency', true) },
      );
    } else {
      entries.push({
        key: 'detach',
        label: parentEdges(doc, e.target).length > 1 ? `Odpojit od rodiče ${s}` : 'Odpojit od rodiče',
        icon: <Unlink size={I} />,
        onSelect: () => {
          clearEdgeSelection();
          detachFrom(e.target, e.source);
        },
      });
    }
    entries.push(
      'sep',
      {
        key: 'src',
        label: e.kind === 'hierarchy' ? 'Přesunout pod jiného rodiče…' : `Změnit zdroj (místo ${s})…`,
        icon: <MoveRight size={I} />,
        onSelect: () => startReconnectPick(e.id, 'source'),
      },
      {
        key: 'tgt',
        label: e.kind === 'hierarchy' ? 'Změnit poduzel…' : `Změnit cíl (místo ${t})…`,
        icon: <MoveRight size={I} />,
        onSelect: () => startReconnectPick(e.id, 'target'),
      },
    );
    if (e.kind !== 'hierarchy') {
      entries.push('sep', { key: 'del', label: 'Odstranit vazbu', icon: <Trash2 size={I} />, danger: true, onSelect: () => removeLinkById(e.id) });
    }
  }
  return <Menu x={menu.x} y={menu.y} entries={entries} onClose={close} />;
}

/** Nabídka typu nové vazby po tažení z konektoru nebo po klepnutí na cíl. */
export function LinkTypeMenu() {
  const m = useUiStore((s) => s.linkTypeMenu);
  const close = useCallback(() => useUiStore.getState().set({ linkTypeMenu: null }), []);
  if (!m) return null;
  const doc = useDocStore.getState().doc;
  const s = nodeName(doc, m.source);
  const t = nodeName(doc, m.target);
  const sharedNote = doc && parentEdges(doc, m.target).length > 0;
  // Projekt nemůže být poduzlem, milník nemůže mít poduzly.
  const canBeChild = doc?.nodes[m.target]?.type !== 'project' && doc?.nodes[m.source]?.type !== 'milestone';
  const entries: MenuEntry[] = [
    { title: `Nová vazba: ${s} → ${t}` },
    {
      key: 'dep',
      label: `Závislost (${s} blokuje ${t})`,
      icon: <Lock size={I} />,
      onSelect: () => {
        if (createLink('dependency', m.source, m.target)) toast('Závislost vytvořena.', 'success');
      },
    },
    {
      key: 'rel',
      label: 'Souvislost',
      icon: <Link2 size={I} />,
      onSelect: () => {
        if (createLink('related', m.source, m.target)) toast('Souvislost vytvořena.', 'success');
      },
    },
  ];
  if (canBeChild) {
    entries.push({
      key: 'child',
      label: `Přidat ${t} jako poduzel`,
      icon: <GitBranchPlus size={I} />,
      onSelect: () => {
        if (createLink('hierarchy', m.source, m.target)) toast(sharedNote ? 'Přidáno jako poduzel – uzel je teď sdílený.' : 'Přidáno jako poduzel.', 'success');
      },
    });
  }
  return <Menu x={m.x} y={m.y} entries={entries} onClose={close} />;
}

/** Lišta „Klepněte na cílový uzel“ (tlačítko Propojit, Změnit cíl / zdroj). */
export function LinkPickBar() {
  const pick = useUiStore((s) => s.linkPick);
  const doc = useDocStore((s) => s.doc);
  if (!pick) return null;
  let text: string;
  if (pick.mode === 'create') text = `Klepněte na cílový uzel pro vazbu z ${nodeName(doc, pick.sourceId)}`;
  else {
    const e = doc?.edges[pick.edgeId];
    text =
      e?.kind === 'hierarchy'
        ? pick.end === 'source'
          ? 'Klepněte na nový nadřazený uzel'
          : 'Klepněte na nový poduzel'
        : pick.end === 'source'
          ? 'Klepněte na nový zdroj vazby'
          : 'Klepněte na nový cíl vazby';
  }
  return (
    <div className="link-pick-bar" role="status">
      <span>{text}</span>
      <button className="btn small" onClick={cancelLinkPick}>
        <X size={16} /> Zrušit
      </button>
    </div>
  );
}
