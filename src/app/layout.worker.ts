/// <reference lib="webworker" />
/**
 * Web Worker pro uspořádání velkých větví (nad 300 uzlů), aby se nezastavilo rozhraní.
 * Dostane jen data dokumentu (v paměti, nic se neposílá ven) a vrátí nové pozice.
 */
import { layoutMany, type LayoutRequest } from './layoutCore';

self.onmessage = (e: MessageEvent<LayoutRequest>) => {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(layoutMany(e.data));
};
