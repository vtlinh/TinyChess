const center = (square: string) => [(square.charCodeAt(0) - 97) * 100 + 50, (8 - Number(square[1])) * 100 + 50];
// The marker is 40 board units wide and anchored at its midpoint (refX=5).
// Its tip extends 20 units beyond the shaft, independently of stroke width.
export const arrowTipOffset = 20;

export function moveArrowPath(from: string, to: string, knight: boolean, flipped = false): string {
  const orient = (square: string) => center(square).map(n => flipped ? 800 - n : n);
  const [x, y] = orient(from), [tx, ty] = orient(to);
  const dx = tx - x, dy = ty - y;
  if (knight) {
    // Separate lanes prevent opposite destinations from sharing a T-shaped stem.
    // Start just outside the piece center; each route keeps its own right-angle bend.
    const vertical = Math.abs(dy) > Math.abs(dx);
    const sx = x + Math.sign(dx) * (vertical ? 18 : 28);
    const sy = y + Math.sign(dy) * (vertical ? 28 : 18);
    const cx = vertical ? sx : tx, cy = vertical ? ty : sy;
    const len = Math.hypot(tx - cx, ty - cy);
    return `M${sx} ${sy} L${cx} ${cy} L${tx - (tx - cx) / len * arrowTipOffset} ${ty - (ty - cy) / len * arrowTipOffset}`;
  }
  const len = Math.hypot(dx, dy);
  return `M${x} ${y} L${tx - dx / len * arrowTipOffset} ${ty - dy / len * arrowTipOffset}`;
}
