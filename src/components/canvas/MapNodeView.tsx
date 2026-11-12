import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Link2, StickyNote } from 'lucide-react';
import { memo, type CSSProperties } from 'react';
import type { NodeType } from '../../model/types';

export interface FlowNodeData extends Record<string, unknown> {
  title: string;
  kind: NodeType;
  /** Barva výplně projektu (hex). */
  fill?: string;
  textColor?: string;
  shared: boolean;
  borderColor?: string;
  hasNotes: boolean;
}

export type FlowNode = Node<FlowNodeData, 'mm'>;

function MapNodeViewImpl({ data, selected }: NodeProps<FlowNode>) {
  const isProject = data.kind === 'project';
  const style: CSSProperties & Record<string, string | undefined> = {};
  if (isProject) {
    style.background = data.fill;
    style.color = data.textColor;
  }
  if (data.borderColor) style['--node-border'] = data.borderColor;
  const cls = [
    'mm-node',
    isProject ? 'project' : 'task',
    data.shared ? 'shared' : '',
    selected ? 'selected' : '',
  ].join(' ');
  return (
    <div className={cls} style={style}>
      <Handle type="target" position={Position.Left} id="l" className="mm-handle" isConnectable={false} />
      <span className={`title${data.title.trim() ? '' : ' empty'}`}>{data.title.trim() || 'Bez názvu'}</span>
      {data.hasNotes && <StickyNote size={13} className="notes-badge" aria-label="Má poznámky" />}
      {data.shared && (
        <span className="shared-badge" title="Sdílený uzel (více rodičů)">
          <Link2 size={12} />
        </span>
      )}
      <Handle type="source" position={Position.Right} id="r" className="mm-handle" isConnectable={false} />
    </div>
  );
}

export const MapNodeView = memo(MapNodeViewImpl);
