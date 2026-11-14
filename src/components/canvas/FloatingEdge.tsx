import { BaseEdge, useInternalNode, type Edge, type EdgeProps } from '@xyflow/react';
import { memo, useMemo } from 'react';
import { floatingEdgeGeometry } from '../../model/edgeGeometry';
import type { EdgeKind } from '../../model/types';

export interface FloatingEdgeData extends Record<string, unknown> {
  kind: EdgeKind;
}

export type FloatingEdgeType = Edge<FloatingEdgeData, 'floating'>;

/**
 * Plovoucí vazba: místo uchycení se počítá z aktuální pozice a rozměrů obou
 * uzlů (useInternalNode). Při posunu/zoomu plochy se interní uzly nemění, takže
 * se nic nepřepočítává; při tažení uzlu se přepočítají jen jeho vazby.
 * Vykreslují se jen viditelné vazby (onlyRenderVisibleElements na plátně).
 */
function FloatingEdgeImpl({ id, source, target, style, markerEnd, markerStart }: EdgeProps<FloatingEdgeType>) {
  const s = useInternalNode(source);
  const t = useInternalNode(target);

  const sx = s?.internals.positionAbsolute.x;
  const sy = s?.internals.positionAbsolute.y;
  const sw = s?.measured.width;
  const sh = s?.measured.height;
  const tx = t?.internals.positionAbsolute.x;
  const ty = t?.internals.positionAbsolute.y;
  const tw = t?.measured.width;
  const th = t?.measured.height;

  const path = useMemo(() => {
    if (sx === undefined || sy === undefined || !sw || !sh || tx === undefined || ty === undefined || !tw || !th) {
      return null;
    }
    return floatingEdgeGeometry({ x: sx, y: sy, width: sw, height: sh }, { x: tx, y: ty, width: tw, height: th }).path;
  }, [sx, sy, sw, sh, tx, ty, tw, th]);

  if (!path) return null;
  return <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} markerStart={markerStart} />;
}

export const FloatingEdge = memo(FloatingEdgeImpl);
