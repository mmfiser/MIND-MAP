import { Ban, CircleCheck, CircleDashed, CirclePlay, Hourglass, OctagonAlert, type LucideIcon } from 'lucide-react';
import { PRIORITY_LABELS, STATUS_LABELS } from '../../model/labels';
import type { Priority, Status } from '../../model/types';

export const STATUS_ORDER: Status[] = ['new', 'in_progress', 'waiting', 'blocked', 'done', 'cancelled'];
export const PRIORITY_ORDER: Priority[] = ['low', 'medium', 'high', 'critical'];

export const STATUS_META: Record<Status, { label: string; Icon: LucideIcon; tone: string }> = {
  new: { label: STATUS_LABELS.new, Icon: CircleDashed, tone: 'neutral' },
  in_progress: { label: STATUS_LABELS.in_progress, Icon: CirclePlay, tone: 'info' },
  waiting: { label: STATUS_LABELS.waiting, Icon: Hourglass, tone: 'warn' },
  blocked: { label: STATUS_LABELS.blocked, Icon: OctagonAlert, tone: 'danger' },
  done: { label: STATUS_LABELS.done, Icon: CircleCheck, tone: 'success' },
  cancelled: { label: STATUS_LABELS.cancelled, Icon: Ban, tone: 'muted' },
};

export const PRIORITY_META: Record<Priority, { label: string; color: string }> = {
  low: { label: PRIORITY_LABELS.low, color: 'var(--prio-low)' },
  medium: { label: PRIORITY_LABELS.medium, color: 'var(--prio-medium)' },
  high: { label: PRIORITY_LABELS.high, color: 'var(--prio-high)' },
  critical: { label: PRIORITY_LABELS.critical, color: 'var(--prio-critical)' },
};
