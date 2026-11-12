import { useEffect } from 'react';
import { useDocStore } from '../store/docStore';

/** Upozornění prohlížeče při zavírání stránky s neuloženými změnami (na Androidu často nefunguje). */
export function useBeforeUnload(): void {
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (useDocStore.getState().dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);
}
