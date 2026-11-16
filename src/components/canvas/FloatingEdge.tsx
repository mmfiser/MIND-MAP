import { BaseEdge, EdgeLabelRenderer, useInternalNode, useReactFlow, type Edge, type EdgeProps } from '@xyflow/react';
import { memo, useMemo, type PointerEvent as ReactPointerEvent } from 'react';
import { floatingEdgeGeometry } from '../../model/edgeGeometry';
import type { EdgeKind } from '../../model/types';
import { useUiStore } from '../../store/uiStore';
import { startLinkDrag } from './LinkDrag';

export interface FloatingEdgeData extends Record<string, unknown> {
  kind: EdgeKind;
  /** barva čáry (projekt rodiče / blokujícího uzlu, u souvislosti neutrální) */
  color: string;
  /** kolmé odsazení souběžných čar */
  bend: number;
  /** skutečné vazby, které čára představuje (sloučené > 1) */
  edgeIds: string[];
  /** vede do sbalené větve */
  redirected: boolean;
  /** kolize termínů – oranžově */
  conflict: boolean;
  /** ztlumená (zvýraznění vazeb vybraného uzlu) */
  dim: boolean;
  /** zvýrazněná (vazba vybraného uzlu) */
  focus: boolean;
}

export type FloatingEdgeType = Edge<FloatingEdgeData, 'floating'>;

const DASH: Record<EdgeKind, string | undefined> = {
  hierarchy: undefined,
  dependency: '7 5',
  related: '1.5 5',
};

/**
 * Plovoucí vazba: místo uchycení se počítá z aktuální pozice a rozměrů obou
 * uzlů (useInternalNode). Při posunu/zoomu plochy se interní uzly nemění, takže
 * se nic nepřepočítává; při tažení uzlu se přepočítají jen jeho vazby.
 * Vykreslují se jen viditelné vazby (onlyRenderVisibleElements na plátně).
 */
function FloatingEdgeImpl({ id, source, target, markerEnd, data, interactionWidth }: EdgeProps<FloatingEdgeType>) {
  const s = useInternalNode(source);
  const t = useInternalNode(target);
  const selected = useUiStore((st) => st.selectedEdge === id);
  const rf = useReactFlow();

  const sx = s?.internals.positionAbsolute.x;
  const sy = s?.internals.positionAbsolute.y;
  const sw = s?.measured.width;
  const sh = s?.measured.height;
  const tx = t?.internals.positionAbsolute.x;
  const ty = t?.internals.positionAbsolute.y;
  const tw = t?.measured.width;
  const th = t?.measured.height;
  const bend = data?.bend ?? 0;

  const geo = useMemo(() => {
    if (sx === undefined || sy === undefined || !sw || !sh || tx === undefined || ty === undefined || !tw || !th) {
      return null;
    }
    return floatingEdgeGeometry({ x: sx, y: sy, width: sw, height: sh }, { x: tx, y: ty, width: tw, height: th }, 0.25, bend);
  }, [sx, sy, sw, sh, tx, ty, tw, th, bend]);

  if (!geo || !data) return null;
  const count = data.edgeIds.length;
  const stroke = data.conflict ? 'var(--warn)' : data.color;
  const width = selected ? 3.6 : data.focus ? 2.8 : data.kind === 'related' ? 2 : 2.25;
  const opacity = data.dim ? 0.15 : data.redirected ? 0.5 : 1;
  const style = {
    stroke,
    strokeWidth: width,
    strokeDasharray: DASH[data.kind],
    strokeLinecap: data.kind === 'related' ? ('round' as const) : undefined,
    opacity,
    transition: 'opacity 150ms',
  };

  const grab = (end: 'source' | 'target') => (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const fixed = end === 'source' ? geo.target : geo.source;
    startLinkDrag({ mode: 'reconnect', edgeId: data.edgeIds[0]!, end }, e.nativeEvent, rf.flowToScreenPosition(fixed));
  };

  return (
    <>
      {selected && <path d={geo.path} className="edge-selected-glow" style={{ stroke }} />}
      {!selected && data.conflict && <path d={geo.path} className="edge-conflict-glow" style={{ opacity: data.dim ? 0.08 : undefined }} />}
      <BaseEdge id={id} path={geo.path} style={style} markerEnd={markerEnd} interactionWidth={interactionWidth} />
      {selected && count === 1 && (
        <>
          {(['source', 'target'] as const).map((end) => {
            const p = end === 'source' ? geo.source : geo.target;
            return (
              <g key={end} className="edge-end nodrag nopan" onPointerDown={grab(end)}>
                <title>{end === 'source' ? 'Táhněte na jiný uzel – změnit zdroj' : 'Táhněte na jiný uzel – změnit cíl'}</title>
                <circle cx={p.x} cy={p.y} r={14} className="edge-end-hit" />
                <circle cx={p.x} cy={p.y} r={6} className="edge-end-dot" style={{ stroke }} />
              </g>
            );
          })}
        </>
      )}
      {count > 1 && (
        <EdgeLabelRenderer>
          <button
            className="edge-count nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${geo.mid.x}px, ${geo.mid.y}px)`, borderColor: stroke, opacity: data.dim ? 0.3 : 1 }}
            title={`${count} vazby do sbalené větve – klepnutím zobrazíte seznam`}
            aria-label={`${count} sloučených vazeb`}
            onClick={(e) => {
              e.stopPropagation();
              useUiStore.getState().set({
                selectedEdge: id,
                edgeMenu: { x: e.clientX, y: e.clientY, routedId: id, edgeIds: data.edgeIds },
              });
            }}
          >
            {count}
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const FloatingEdge = memo(FloatingEdgeImpl);
