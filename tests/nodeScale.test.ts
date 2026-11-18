import { describe, expect, it } from 'vitest';
import { lodLevel } from '../src/model/lod';
import { floatingEdgeGeometry } from '../src/model/edgeGeometry';
import { BASE_PX, READABLE_PX, nodeScaleFactors, overlapCap, overlapCaps, quantize, scaleRect } from '../src/model/nodeScale';

describe('kompenzace zoomu – faktor zvětšení', () => {
  it('úroveň Vše: beze změny', () => {
    expect(nodeScaleFactors(0.8, 'full')).toEqual({ project: 1, node: 1 });
    expect(nodeScaleFactors(0.61, 'full')).toEqual({ project: 1, node: 1 });
  });

  it('Střední: projekty strop ×2, úkoly a milníky ×1,6', () => {
    expect(nodeScaleFactors(0.5, 'medium')).toEqual({ project: 1.7, node: 1.6 });
    expect(nodeScaleFactors(0.36, 'medium')).toEqual({ project: 2, node: 1.6 });
  });

  it('Přehled: projekty až ×3; se zvětšeným písmem Přehledu stačí menší faktor', () => {
    expect(nodeScaleFactors(0.1, 'overview', { overviewText: true }).project).toBe(3);
    expect(nodeScaleFactors(0.3, 'overview', { overviewText: true }).project).toBe(1.4);
    expect(nodeScaleFactors(0.2, 'overview').project).toBe(3); // bez zvětšeného písma (automatický detail vypnutý)
  });

  it('cílové velikosti na obrazovce jsou splněné, dokud to strop dovolí', () => {
    for (const zoom of [0.4, 0.45, 0.5, 0.55]) {
      const f = nodeScaleFactors(zoom, 'medium');
      if (f.project < 2) {
        expect(BASE_PX.project.title * zoom * f.project).toBeGreaterThanOrEqual(READABLE_PX.projectTitle - 1e-9);
        expect(BASE_PX.project.icon * zoom * f.project).toBeGreaterThanOrEqual(READABLE_PX.icon - 1e-9);
      }
    }
    // úkol: při zoomu 0,59 by ikona potřebovala ×1,8 → strop 1,6
    expect(nodeScaleFactors(0.59, 'medium').node).toBe(1.6);
  });

  it('strop proti překrývání a nikdy pod 1', () => {
    expect(nodeScaleFactors(0.1, 'overview', { overviewText: true, projectCap: 1.8 }).project).toBe(1.8);
    expect(nodeScaleFactors(0.1, 'overview', { overviewText: true, projectCap: 0.5 }).project).toBe(1);
  });

  it('kvantování po 0,1 nahoru: přepočet jen při změně kroku', () => {
    expect(quantize(1.01)).toBe(1.1);
    expect(quantize(1.1)).toBe(1.1);
    expect(quantize(2.349)).toBe(2.4);
    const steps = new Set<string>();
    let prev = 'medium' as ReturnType<typeof lodLevel>;
    for (let z = 0.4; z < 0.6; z += 0.001) {
      prev = lodLevel(z, prev);
      steps.add(JSON.stringify(nodeScaleFactors(z, prev)));
    }
    expect(steps.size).toBeLessThan(12); // stovky pozic kolečka → pár kroků
  });
});

describe('strop proti překrývání', () => {
  it('dva projekty nad sebou: zvětšení, dokud se nedotknou (s mezerou)', () => {
    // středy 420 px od sebe, výška 150 → f ≤ (420 − 12) / 150 = 2,72 → 2,7
    const cap = overlapCap([
      { cx: 0, cy: 0, w: 260, h: 150 },
      { cx: 0, cy: 420, w: 260, h: 150 },
    ]);
    expect(cap).toBe(2.7);
  });

  it('oddělené v jedné ose stačí; už se překrývající dvojice se ignorují', () => {
    expect(
      overlapCap([
        { cx: 0, cy: 0, w: 260, h: 150 },
        { cx: 2600, cy: 30, w: 260, h: 150 },
      ]),
    ).toBeGreaterThan(9);
    expect(
      overlapCap([
        { cx: 0, cy: 0, w: 260, h: 150 },
        { cx: 10, cy: 10, w: 260, h: 150 },
      ]),
    ).toBe(Infinity);
  });

  it('zvětšení obdélníku kolem středu', () => {
    expect(scaleRect({ x: 0, y: 0, width: 100, height: 40 }, 2)).toEqual({ x: -50, y: -20, width: 200, height: 80 });
    expect(scaleRect({ x: 5, y: 5, width: 10, height: 10 }, 1)).toEqual({ x: 5, y: 5, width: 10, height: 10 });
  });
});

describe('plovoucí vazba na zvětšený uzel', () => {
  it('uchytí se na obrys zvětšený kolem středu, ne na původní rozměry', () => {
    const a = { x: 0, y: 0, width: 260, height: 100 }; // projekt ×2
    const b = { x: 600, y: 30, width: 180, height: 40 }; // úkol ×1,6
    const g = floatingEdgeGeometry(scaleRect(a, 2), scaleRect(b, 1.6));
    // pravý okraj projektu: střed 130 + 260 = 390; levý okraj úkolu: střed 690 − 144 = 546
    expect(g.source).toEqual({ x: 390, y: 50 });
    expect(g.target).toEqual({ x: 546, y: 50 });
  });
});

describe('strop proti překrývání ve Střední úrovni (projekty a úkoly zvlášť)', () => {
  // výchozí rozložení aplikace: projekt 260×110, podúkol 70 px vpravo, sourozenci 16 px pod sebou
  const P = { cx: 130, cy: 55, w: 260, h: 110, kind: 'project' as const };
  const T1 = { cx: 330 + 95, cy: 55, w: 190, h: 64, kind: 'node' as const };
  const T2 = { cx: 330 + 95, cy: 55 + 80, w: 190, h: 64, kind: 'node' as const };

  it('sourozenci těsně pod sebou: úkoly se nezvětší (žádné překrytí)', () => {
    const caps = overlapCaps([P, T1, T2], 16);
    expect(caps.node).toBe(1);
    expect(nodeScaleFactors(0.45, 'medium', { nodeCap: caps.node }).node).toBe(1);
  });

  it('projekt se zvětší jen tak, aby nezakryl své úkoly', () => {
    const caps = overlapCaps([P, T1], 16);
    // úkol sám (bez sourozence) může růst, projekt pak méně
    expect(caps.node).toBeGreaterThan(1);
    const fp = caps.projectFor(1);
    // pravý okraj projektu ×fp nesmí přesáhnout levý okraj úkolu − mezera: 130 + 130·fp ≤ 330 − 16
    expect(130 + 130 * fp).toBeLessThanOrEqual(330 - 16 + 1e-9);
    expect(caps.projectFor(1.3)).toBeLessThan(fp);
  });

  it('volné uzly daleko od sebe: bez omezení', () => {
    const caps = overlapCaps([P, { ...T1, cx: 3000 }], 16);
    expect(caps.node).toBe(Infinity);
    expect(caps.projectFor(1.6)).toBe(Infinity);
  });
});
