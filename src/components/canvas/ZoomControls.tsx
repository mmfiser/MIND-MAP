import { useReactFlow, useStore } from '@xyflow/react';
import { Crosshair, Minus, Plus, ZoomIn } from 'lucide-react';
import { useUiStore } from '../../store/uiStore';
import { LOD_LABEL } from '../../model/lod';
import { MOTION, motion } from '../common/motion';

const MIN = 0.1;
const MAX = 2.5;
// Posuvník je logaritmický – jemnější ovládání v okolí 100 %.
const toSlider = (z: number) => Math.round(((Math.log(z) - Math.log(MIN)) / (Math.log(MAX) - Math.log(MIN))) * 1000);
const fromSlider = (v: number) => Math.exp(Math.log(MIN) + (v / 1000) * (Math.log(MAX) - Math.log(MIN)));

export function ZoomControls() {
  const rf = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  const selectedId = useUiStore((s) => s.selectedId);
  const autoDetail = useUiStore((s) => s.autoDetail);
  const level = useUiStore((s) => s.lodLevel);
  const ui = useUiStore.getState;

  return (
    <div className="zoom-ctrl" onDoubleClick={(e) => e.stopPropagation()}>
      <button className="icon-btn" title="Oddálit" aria-label="Oddálit" onClick={() => void rf.zoomOut({ duration: motion(MOTION.base) })}>
        <Minus size={18} />
      </button>
      <input
        type="range"
        min={0}
        max={1000}
        value={toSlider(zoom)}
        aria-label="Přiblížení"
        onChange={(e) => void rf.zoomTo(fromSlider(Number(e.target.value)))}
      />
      <button className="icon-btn" title="Přiblížit" aria-label="Přiblížit" onClick={() => void rf.zoomIn({ duration: motion(MOTION.base) })}>
        <Plus size={18} />
      </button>
      <span className="pct">{Math.round(zoom * 100)} %</span>
      {autoDetail && (
        <span className={`lod-label ${level}`} title="Úroveň detailu podle přiblížení (vypnete v menu „⋯“)" aria-live="polite">
          {LOD_LABEL[level]}
        </span>
      )}
      <button
        className="icon-btn focus-selected"
        title="Vystředit vybraný (F)"
        aria-label="Vystředit vybraný"
        disabled={!selectedId}
        onClick={() => selectedId && ui().focusNode(selectedId)}
      >
        <Crosshair size={18} />
      </button>
      <button
        className="icon-btn zoom-preset"
        title="Zoom 80 % – vystředit na celou mapu"
        aria-label="Zoom 80 %, vystředit na celou mapu"
        onClick={() => ui().zoomPreset()}
      >
        <ZoomIn size={17} />
        <span>80 %</span>
      </button>
    </div>
  );
}
