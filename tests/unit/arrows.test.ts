import { expect, it } from 'vitest';
import { arrowTipOffset, moveArrowPath } from '../../src/arrows';

it('draws centered, distinct routes for ordinary and knight moves in either orientation', () => {
  expect(moveArrowPath('b1', 'a3', true)).toBe('M132 722 L132 550 L70 550');
  expect(moveArrowPath('b1', 'c3', true)).toBe('M168 722 L168 550 L230 550');

  const paths = ['c6', 'e6', 'b5', 'f5', 'b3', 'f3', 'c2', 'e2'].map(to => moveArrowPath('d4', to, true));
  expect(new Set(paths.map(path => path.split(' L')[0])).size).toBe(8);
  for (const path of paths) {
    const [sx, sy, cx, cy, tx, ty] = path.match(/\d+/g)!.map(Number);
    expect((sx === cx && cy === ty) || (sy === cy && cx === tx)).toBe(true);
  }
  expect(moveArrowPath('e2', 'e4', false)).toBe('M450 650 L450 470');

  for (const flipped of [false, true]) {
    const routes: [string, string, boolean][] = [
      ...['c6', 'e6', 'b5', 'f5', 'b3', 'f3', 'c2', 'e2'].map(to => ['d4', to, true] as [string, string, boolean]),
      ...['d8', 'd1', 'a4', 'h4', 'a7', 'g7', 'a1', 'g1'].map(to => ['d4', to, false] as [string, string, boolean]),
    ];
    for (const [from, to, knight] of routes) {
      const points = moveArrowPath(from, to, knight, flipped).match(/-?\d+(?:\.\d+)?/g)!.map(Number);
      const [x, y, ex, ey] = points.slice(-4);
      const length = Math.hypot(ex - x, ey - y);
      const cx = (to.charCodeAt(0) - 97) * 100 + 50, cy = (8 - Number(to[1])) * 100 + 50;
      expect(ex + (ex - x) / length * arrowTipOffset).toBeCloseTo(flipped ? 800 - cx : cx);
      expect(ey + (ey - y) / length * arrowTipOffset).toBeCloseTo(flipped ? 800 - cy : cy);
    }
  }

  expect(moveArrowPath('g8', 'h6', true, true)).toBe(moveArrowPath('b1', 'a3', true));
  expect(moveArrowPath('g8', 'f6', true, true)).toBe(moveArrowPath('b1', 'c3', true));
  expect(moveArrowPath('d7', 'd5', false, true)).toBe(moveArrowPath('e2', 'e4', false));
});
