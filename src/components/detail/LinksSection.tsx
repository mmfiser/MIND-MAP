import { CircleDot, Folder, Link2, Lock, Milestone, TriangleAlert, Unlink, X } from 'lucide-react';
import { useMemo } from 'react';
import { detachFrom } from '../../app/actions';
import { blockedText, goToNode, removeLinkById, startLinkPick } from '../../app/linkActions';
import { activeBlockers } from '../../model/blocking';
import { describeConflict, findDateConflicts } from '../../model/conflicts';
import { formatShort } from '../../model/dates';
import { owningProject } from '../../model/graph';
import { colorHex } from '../../model/labels';
import { nodeLinks, otherEnd } from '../../model/links';
import type { MapDocument, MapEdge, MapNode } from '../../model/types';
import { useDocStore } from '../../store/docStore';
import { useUiStore } from '../../store/uiStore';
import { projectIcon } from '../common/projectIcons';
import { STATUS_META } from '../common/statusMeta';

function NodeIcon({ n }: { n: MapNode }) {
  const pi = projectIcon(n.icon);
  const color = n.type === 'project' ? colorHex(n.color) : 'var(--text-2)';
  if (pi) return <pi.Icon size={16} style={{ color, flex: 'none' }} aria-label={pi.label} />;
  if (n.type === 'project') return <Folder size={16} style={{ color, flex: 'none' }} aria-label="Projekt" />;
  if (n.type === 'milestone') return <Milestone size={16} style={{ color, flex: 'none' }} aria-label="Milník" />;
  return <CircleDot size={16} style={{ color, flex: 'none' }} aria-label="Úkol" />;
}

interface Group {
  key: string;
  label: string;
  edges: MapEdge[];
  removeLabel: string;
}

function LinkItem({ doc, edge, nodeId, removeLabel }: { doc: MapDocument; edge: MapEdge; nodeId: string; removeLabel: string }) {
  const today = useUiStore((s) => s.today);
  const otherId = otherEnd(edge, nodeId);
  const other = doc.nodes[otherId];
  if (!other) return null;
  const project = other.type === 'project' ? undefined : owningProject(doc, otherId);
  const state =
    other.type === 'milestone'
      ? other.dueDate
        ? formatShort(other.dueDate, today)
        : 'bez data'
      : STATUS_META[other.status].label;
  const remove = () => {
    if (edge.kind === 'hierarchy') detachFrom(edge.target, edge.source);
    else removeLinkById(edge.id);
  };
  return (
    <div className="link-item">
      <button className="link-main" title="Přejít na uzel" onClick={() => goToNode(otherId)}>
        <NodeIcon n={other} />
        <span className="link-text">
          <span className={`name${other.title.trim() ? '' : ' empty'}`}>{other.title.trim() || 'Bez názvu'}</span>
          <span className="sub">
            {project ? `${project.title.trim() || 'Bez názvu'} · ` : ''}
            {state}
          </span>
        </span>
      </button>
      <button className="icon-btn" title={removeLabel} aria-label={`${removeLabel}: ${other.title.trim() || 'bez názvu'}`} onClick={remove}>
        {edge.kind === 'hierarchy' ? <Unlink size={16} /> : <X size={16} />}
      </button>
    </div>
  );
}

/** Sekce Vazby v detailu uzlu. */
export function LinksSection({ node }: { node: MapNode }) {
  const doc = useDocStore((s) => s.doc)!;
  const links = useMemo(() => nodeLinks(doc, node.id), [doc, node.id]);
  const groups: Group[] = [
    { key: 'parents', label: 'Nadřazené', edges: links.parents, removeLabel: 'Odpojit od rodiče' },
    { key: 'children', label: 'Podřízené', edges: links.children, removeLabel: 'Odpojit poduzel' },
    { key: 'blocks', label: 'Blokuje', edges: links.blocks, removeLabel: 'Odstranit závislost' },
    { key: 'blockedBy', label: 'Je blokován', edges: links.blockedBy, removeLabel: 'Odstranit závislost' },
    { key: 'related', label: 'Souvisí', edges: links.related, removeLabel: 'Odstranit souvislost' },
  ];
  const total = groups.reduce((a, g) => a + g.edges.length, 0);
  return (
    <div className="field">
      <span>Vazby{total ? ` (${total})` : ''}</span>
      <div className="links">
        {total === 0 && <div className="muted">Žádné vazby – uzel je volně na ploše.</div>}
        {groups
          .filter((g) => g.edges.length)
          .map((g) => (
            <div className="link-group" key={g.key}>
              <div className="link-group-title">
                {g.label} ({g.edges.length})
              </div>
              {g.edges.map((e) => (
                <LinkItem key={e.id} doc={doc} edge={e} nodeId={node.id} removeLabel={g.removeLabel} />
              ))}
            </div>
          ))}
      </div>
      <div className="detail-actions">
        <button className="btn small" onClick={() => startLinkPick(node.id)}>
          <Link2 size={16} /> Propojit s…
        </button>
      </div>
    </div>
  );
}

/** Oranžové upozornění: kolize termínů a termín před začátkem. */
export function ConflictHints({ node }: { node: MapNode }) {
  const doc = useDocStore((s) => s.doc)!;
  const today = useUiStore((s) => s.today);
  const texts = useMemo(() => {
    const r = findDateConflicts(doc);
    return (r.byNode.get(node.id) ?? []).map((c) => describeConflict(doc, c, node.id, today));
  }, [doc, node.id, today]);
  if (!texts.length) return null;
  return (
    <div className="date-warning" role="status">
      <TriangleAlert size={16} />
      <span>
        {texts.length === 1
          ? texts[0]
          : texts.map((t, i) => (
              <span key={i} style={{ display: 'block' }}>
                {t}
              </span>
            ))}
      </span>
    </div>
  );
}

/** Informace o blokujících závislostech (jen informativní). */
export function BlockedHint({ node }: { node: MapNode }) {
  const doc = useDocStore((s) => s.doc)!;
  const today = useUiStore((s) => s.today);
  const blockers = useMemo(() => (node.type === 'project' ? [] : activeBlockers(doc, node.id, today)), [doc, node.id, node.type, today]);
  if (!blockers.length) return null;
  return (
    <div className="blocked-hint" role="status">
      <Lock size={16} />
      <span>{blockedText(blockers)}</span>
    </div>
  );
}
