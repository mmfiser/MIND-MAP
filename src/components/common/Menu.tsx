import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface MenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  kbd?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}
export type MenuEntry = MenuItem | 'sep' | { title: string };

interface Props {
  x: number;
  y: number;
  entries: MenuEntry[];
  onClose: () => void;
  /** Zarovnat pravý okraj menu k x (menu z tlačítka vpravo). */
  alignRight?: boolean;
}

/** Plovoucí menu: zavírá se klikem mimo, Escape, změnou velikosti okna. */
export function Menu({ x, y, entries, onClose, alignRight }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const m = 8;
    let left = alignRight ? x - r.width : x;
    let top = y;
    if (left + r.width > window.innerWidth - m) left = window.innerWidth - m - r.width;
    if (top + r.height > window.innerHeight - m) top = Math.max(m, window.innerHeight - m - r.height);
    setPos({ left: Math.max(m, left), top: Math.max(m, top) });
    el.querySelector<HTMLButtonElement>('.menu-item:not(:disabled)')?.focus({ preventScroll: true });
  }, [x, y, alignRight]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('.menu-item:not(:disabled)') ?? [])];
        const i = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
        items[next]?.focus();
      }
    };
    const t = setTimeout(() => window.addEventListener('pointerdown', onDown, true), 0);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onClose);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  // Portál do <body> – menu nesmí skončit pod panely kvůli stacking contextům.
  return createPortal(
    <div className="menu" role="menu" ref={ref} style={pos} onContextMenu={(e) => e.preventDefault()}>
      {entries.map((e, i) => {
        if (e === 'sep') return <div className="menu-sep" key={`sep${i}`} />;
        if ('title' in e) return <div className="menu-title" key={`t${i}`}>{e.title}</div>;
        return (
          <button
            key={e.key}
            role="menuitem"
            className={`menu-item${e.danger ? ' danger' : ''}`}
            disabled={e.disabled}
            onClick={() => {
              onClose();
              e.onSelect();
            }}
          >
            {e.icon}
            <span>{e.label}</span>
            {e.kbd && <span className="kbd">{e.kbd}</span>}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
