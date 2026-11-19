import { describe, expect, it } from 'vitest';
import { createNode } from '../src/model/factory';
import { arrowStep, clampToRadius, joystickVelocity, JOYSTICK } from '../src/model/joystick';
import { fromMinimap, minimapFrame, toMinimap, viewportRect } from '../src/model/minimap';
import type { DocData, MapNode } from '../src/model/types';

const node = (id: string, type: MapNode['type'], x: number, y: number, extra: Partial<MapNode> = {}): MapNode => ({
  ...createNode({ id, type, title: id, position: { x, y } }),
  ...extra,
});
const doc = (nodes: MapNode[]): DocData => ({ nodes: Object.fromEntries(nodes.map((n) => [n.id, n])), edges: {} });

describe('minimapa', () => {
  const d = doc([node('P', 'project', 0, 0), node('T', 'task', 1000, 500), node('X', 'task', 9000, 9000, { deletedAt: '2026-11-19T00:00:00Z' })]);

  it('rámec obsahuje všechny uzly mimo koš a vejde se do minimapy', () => {
    const f = minimapFrame(d, 200, 140)!;
    const a = toMinimap(f, 0, 0);
    const b = toMinimap(f, 1000 + 190, 500 + 64);
    for (const p of [a, b]) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(200);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(140);
    }
    expect(f.bounds.x + f.bounds.width).toBeLessThan(2000); // koš se nepočítá
  });

  it('převod tam a zpět je přesný; výřez z transformace', () => {
    const f = minimapFrame(d, 200, 140)!;
    const m = toMinimap(f, 640, 210);
    const back = fromMinimap(f, m.x, m.y);
    expect(back.x).toBeCloseTo(640, 9);
    expect(back.y).toBeCloseTo(210, 9);
    expect(viewportRect(-100, -50, 0.5, 400, 300)).toEqual({ x: 200, y: 100, width: 800, height: 600 });
  });

  it('prázdná mapa nemá rámec', () => {
    expect(minimapFrame({ nodes: {}, edges: {} }, 200, 140)).toBeNull();
  });
});

describe('kruhový ovladač', () => {
  it('mrtvá zóna, plná rychlost na okraji, diagonála', () => {
    expect(joystickVelocity(3, 3)).toEqual({ vx: 0, vy: 0 });
    const edge = joystickVelocity(JOYSTICK.radius, 0);
    expect(edge.vx).toBeCloseTo(JOYSTICK.maxSpeed, 6);
    expect(edge.vy).toBe(0);
    const far = joystickVelocity(500, 0); // za okrajem = jako na okraji
    expect(far.vx).toBeCloseTo(JOYSTICK.maxSpeed, 6);
    const diag = joystickVelocity(30, 30);
    expect(diag.vx).toBeCloseTo(diag.vy, 9);
    expect(diag.vx).toBeGreaterThan(0);
    const half = joystickVelocity(20, 0).vx;
    expect(half).toBeLessThan(edge.vx / 2); // pozvolný náběh
  });

  it('omezení na kruh a krok šipky o třetinu obrazovky', () => {
    const c = clampToRadius(300, 400);
    expect(Math.hypot(c.x, c.y)).toBeCloseTo(JOYSTICK.radius, 9);
    expect(arrowStep('right', 375, 600)).toEqual({ dx: 125, dy: 0 });
    expect(arrowStep('up', 375, 600)).toEqual({ dx: 0, dy: -200 });
  });
});
