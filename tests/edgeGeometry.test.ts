import { describe, expect, it } from 'vitest';
import { closestSide, floatingEdgeGeometry, sideAnchor, type Rect } from '../src/model/edgeGeometry';

/** obdélník se středem v (cx, cy) */
const at = (cx: number, cy: number, width = 100, height = 40): Rect => ({
  x: cx - width / 2,
  y: cy - height / 2,
  width,
  height,
});

const parent = at(0, 0, 200, 60);

describe('výběr hrany', () => {
  it('poduzel vpravo / vlevo / nad / pod rodičem', () => {
    expect(floatingEdgeGeometry(parent, at(400, 0)).sourceSide).toBe('right');
    expect(floatingEdgeGeometry(parent, at(400, 0)).targetSide).toBe('left');
    expect(floatingEdgeGeometry(parent, at(-400, 0)).sourceSide).toBe('left');
    expect(floatingEdgeGeometry(parent, at(-400, 0)).targetSide).toBe('right');
    expect(floatingEdgeGeometry(parent, at(0, -300)).sourceSide).toBe('top');
    expect(floatingEdgeGeometry(parent, at(0, -300)).targetSide).toBe('bottom');
    expect(floatingEdgeGeometry(parent, at(0, 300)).sourceSide).toBe('bottom');
    expect(floatingEdgeGeometry(parent, at(0, 300)).targetSide).toBe('top');
  });

  it('diagonálně – rozhoduje poměr stran', () => {
    // široký rodič 200×60: bod (150, 100) → |dx|/w = 0,75, |dy|/h = 1,67 → dolní hrana
    expect(closestSide(parent, { x: 150, y: 100 })).toBe('bottom');
    // bod (300, 60) → 1,5 vs 1,0 → pravá hrana
    expect(closestSide(parent, { x: 300, y: 60 })).toBe('right');
    // vlevo nahoře, převažuje vodorovně
    expect(closestSide(parent, { x: -400, y: -100 })).toBe('left');
  });

  it('široký vs. vysoký uzel: stejný vektor, jiná strana', () => {
    const toward = { x: 100, y: 80 }; // dx = 100, dy = 80
    // široký 300×60: 100/300 = 0,33 < 80/60 = 1,33 → dole (prosté |dx|>|dy| by dalo „vpravo“)
    expect(closestSide(at(0, 0, 300, 60), toward)).toBe('bottom');
    // vysoký 60×300: 100/60 = 1,67 > 80/300 = 0,27 → vpravo
    expect(closestSide(at(0, 0, 60, 300), toward)).toBe('right');
    // čtverec: |dx| > |dy| → vpravo
    expect(closestSide(at(0, 0, 100, 100), toward)).toBe('right');
  });

  it('přesně na úhlopříčce i shodné středy vyhrává vodorovná strana', () => {
    expect(closestSide(at(0, 0, 200, 100), { x: 200, y: 100 })).toBe('right');
    expect(closestSide(at(0, 0, 200, 100), { x: 0, y: 0 })).toBe('right');
  });
});

describe('body a křivka', () => {
  it('kotví ve středech hran', () => {
    const r = at(0, 0, 200, 60);
    expect(sideAnchor(r, 'top')).toEqual({ x: 0, y: -30 });
    expect(sideAnchor(r, 'bottom')).toEqual({ x: 0, y: 30 });
    expect(sideAnchor(r, 'left')).toEqual({ x: -100, y: 0 });
    expect(sideAnchor(r, 'right')).toEqual({ x: 100, y: 0 });
  });

  it('kontrolní body jsou kolmé na hranu a míří ven z uzlu', () => {
    const g = floatingEdgeGeometry(parent, at(400, 120));
    expect(g.sourceSide).toBe('right');
    expect(g.c1.y).toBe(g.source.y); // vodorovně od pravé hrany
    expect(g.c1.x).toBeGreaterThan(g.source.x);
    expect(g.c2.y).toBe(g.target.y);
    expect(g.c2.x).toBeLessThan(g.target.x); // od levé hrany cíle ven doleva

    const down = floatingEdgeGeometry(parent, at(30, 400));
    expect(down.sourceSide).toBe('bottom');
    expect(down.c1.x).toBe(down.source.x);
    expect(down.c1.y).toBeGreaterThan(down.source.y);
    expect(down.c2.x).toBe(down.target.x);
    expect(down.c2.y).toBeLessThan(down.target.y);
  });

  it('path je kubický bezier z kotvy zdroje do kotvy cíle', () => {
    const g = floatingEdgeGeometry(parent, at(400, 0));
    expect(g.path).toMatch(/^M100,0 C[-\d.]+,[-\d.]+ [-\d.]+,[-\d.]+ 350,0$/);
    expect(g.mid.y).toBeCloseTo(0);
    expect(g.mid.x).toBeGreaterThan(100);
    expect(g.mid.x).toBeLessThan(350);
  });

  it('každá vazba sdíleného uzlu se počítá zvlášť', () => {
    const child = at(0, 0);
    const left = floatingEdgeGeometry(at(-400, 0, 200, 60), child);
    const above = floatingEdgeGeometry(at(0, -300, 200, 60), child);
    expect(left.targetSide).toBe('left');
    expect(above.targetSide).toBe('top');
  });
});
