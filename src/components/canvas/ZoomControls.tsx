import { useReactFlow, useStore } from '@xyflow/react';
import { Crosshair, Maximize, Minus, Plus } from 'lucide-react';
import { useUiStore } from '../../store/uiStore';

const MIN = 0.1;
const MAX = 2.5;
// Posuvník je logaritmický – jemnější ovládání v okolí 100 %.
const toSlider = (z: number) => Math.round(((Math.log(z) - Math.log(MIN)) / (Math.log(MAX) - Math.log(MIN))) * 1000);
const fromSlider = (v: number) => Math.exp(Math.log(MIN) + (v / 1000) * (Math.log(MAX) - Math.log(MIN)));

export function ZoomControls() {
  const rf = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  const selectedId = useUiStore((s) => s.selectedId);
  const ui = useUiStore.getState;

  return (
    <div className="zoom-ctrl" onDoubleClick={(e) => e.stopPropagation()}>
      <button className="icon-btn" title="Oddálit" aria-label="Oddálit" onClick={() => void rf.zoomOut({ duration: 150 })}>
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
      <button className="icon-btn" title="Přiblížit" aria-label="Přiblížit" onClick={() => void rf.zoomIn({ duration: 150 })}>
        <Plus size={18} />
      </button>
      <span className="pct">{Math.round(zoom * 100)} %</span>
      <button
        className="icon-btn"
        title="Vystředit vybraný (F)"
        aria-label="Vystředit vybraný"
        disabled={!selectedId}
        onClick={() => selectedId && ui().focusNode(selectedId)}
      >
        <Crosshair size={18} />
      </button>
      <button className="icon-btn" title="Zobrazit vše" aria-label="Zobrazit vše" onClick={() => ui().fitAll()}>
        <Maximize size={18} />
      </button>
    </div>
  );
}
