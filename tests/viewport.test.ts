import { describe, expect, it } from 'vitest';
import { createNode } from '../src/model/factory';
import { lodLevel } from '../src/model/lod';
import { nodeScaleFactors } from '../src/model/nodeScale';
import type { DocData, MapNode } from '../src/model/types';
import { computeVisibility } from '../src/model/visibility';
import { BASE_NODE_SIZE, fitViewport, nodeCenter, nodesBounds, zoomPresetViewport } from '../src/model/viewport';

const node = (id: string, type: MapNode['type'], x: number, y: number, extra: Partial<MapNode> = {}): MapNode => ({
  ...createNode({ id, type, title: id, position: { x, y } }),
  ...extra,
});

function sample(): DocData {
  const nodes = [
    node('P1', 'project', 0, 0),
    node('T1', 'task', 330, 20),
    node('M', 'milestone', 330, 120),
    node('P2', 'project', 0, 600),
    node('X', 'task', 5000, 5000, { deletedAt: '2026-11-18T00:00:00Z' }), // koš – nepočítá se
  ];
  return { nodes: Object.fromEntries(nodes.map((n) => [n.id, n])), edges: {} };
}

describe('ohraničení a vystředění se základními rozměry', () => {
  it('ohraničení všech uzlů mimo koš (×1, bez zvětšení)', () => {
    expect(nodesBounds(sample())).toEqual({ x: 0, y: 0, width: 330 + 200, height: 600 + 110 });
    expect(nodesBounds({ nodes: {}, edges: {} })).toBeNull();
  });

  it('Zoom 80 %: zoom přesně 0,8 a střed mapy uprostřed plochy', () => {
    const vp = zoomPresetViewport(sample(), 1000, 800);
    expect(vp.zoom).toBe(0.8);
    // střed ohraničení (265, 355) → (500, 400) na obrazovce
    expect(vp.x + 265 * 0.8).toBeCloseTo(500, 9);
    expect(vp.y + 355 * 0.8).toBeCloseTo(400, 9);
  });

  it('stejný výsledek vystředění z různých výchozích zoomů (i se zvětšením uzlů a skrytými úrovněmi)', () => {
    const d = sample();
    const results = new Set<string>();
    for (const zoom of [0.1, 0.2, 0.34, 0.5, 0.62, 1, 2.5]) {
      // v různých zoomech se liší viditelné uzly i faktory zvětšení – výsledek na nich nesmí záviset
      const level = lodLevel(zoom);
      void computeVisibility(d, undefined, { maxDepth: level === 'overview' ? 0 : level === 'medium' ? 1 : Infinity });
      void nodeScaleFactors(zoom, level);
      results.add(JSON.stringify(zoomPresetViewport(d, 1000, 800)));
      results.add(JSON.stringify(fitViewport(d, 1000, 800)));
    }
    expect(results.size).toBe(2); // jeden výsledek pro Zoom 80 %, jeden pro úvodní zobrazení
  });

  it('úvodní zobrazení: celá mapa s okrajem, zoom v mezích', () => {
    const vp = fitViewport(sample(), 1000, 800);
    expect(vp.zoom).toBeCloseTo(Math.min(1000 / (530 * 1.2), 800 / (710 * 1.2)), 9);
    expect(fitViewport(sample(), 100, 80).zoom).toBe(0.1);
    expect(fitViewport({ nodes: { a: node('a', 'task', 0, 0) }, edges: {} }, 2000, 2000).zoom).toBe(1.2);
  });

  it('střed uzlu podle základních rozměrů', () => {
    expect(nodeCenter({ type: 'project', position: { x: 10, y: 20 } })).toEqual({
      x: 10 + BASE_NODE_SIZE.project.w / 2,
      y: 20 + BASE_NODE_SIZE.project.h / 2,
    });
  });
});
