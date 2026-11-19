import { describe, expect, it } from 'vitest';
import { PROJECT_PALETTE, contrastText } from '../src/model/labels';

/** Relativní jas podle WCAG 2.1. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}
const ratio = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};
const hex = (c: string) => (c.startsWith('#') ? c : c === 'white' ? '#ffffff' : '#000000');

describe('čitelnost 20 barev projektů', () => {
  it('text na výplni projektu má kontrast aspoň 3 : 1 (velký tučný název)', () => {
    const report = PROJECT_PALETTE.map((c) => ({ name: c.name, r: ratio(c.hex, hex(contrastText(c.hex))) }));
    const weak = report.filter((x) => x.r < 3);
    expect(weak).toEqual([]);
  });

  it('projekt je na světlém i tmavém pozadí plochy odlišitelný (kontrast aspoň 1,5 : 1 vůči ploše)', () => {
    const light = '#f3f4f7';
    const dark = '#15171d';
    const weak = PROJECT_PALETTE.filter((c) => ratio(c.hex, light) < 1.5 || ratio(c.hex, dark) < 1.5).map((c) => c.name);
    expect(weak).toEqual([]);
  });
});
