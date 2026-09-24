import { Chess, type Move, type Square } from 'chess.js';
import { names } from './game';

export const moveDuration = 800;
export const undoDuration = 400;
type Point = [number, number];
export function moveRoute(from: Square, to: Square, knight: boolean, flipped: boolean): Point[] {
  const point = (square: Square): Point => {
    const x = square.charCodeAt(0) - 97, y = 8 - Number(square[1]);
    return flipped ? [7 - x, 7 - y] : [x, y];
  };
  const start = point(from), end = point(to);
  if (!knight) return [start, end];
  const corner: Point = Math.abs(end[0] - start[0]) > Math.abs(end[1] - start[1])
    ? [end[0], start[1]] : [start[0], end[1]];
  return [start, corner, end];
}

export function motionPlan(move: Move, flipped: boolean, reverse = false) {
  const chess = new Chess(move.before);
  chess.remove(move.from);
  const route = (from: Square, to: Square, knight: boolean) => {
    const points = moveRoute(from, to, knight, flipped);
    return reverse ? points.reverse() : points;
  };
  const pieces = [{ role: names[reverse && move.promotion ? move.promotion : move.piece],
    route: route(move.from, move.to, move.piece === 'n') }];
  if (/[kq]/.test(move.flags)) {
    const rank = move.color === 'w' ? '1' : '8';
    const from = `${move.flags.includes('k') ? 'h' : 'a'}${rank}` as Square;
    const to = `${move.flags.includes('k') ? 'f' : 'd'}${rank}` as Square;
    chess.remove(from);
    pieces.push({ role: 'rook', route: route(from, to, false) });
  }
  // The captured piece remains visible until the mover lands. Forward promotions travel as pawns.
  return { fen: chess.fen(), pieces, color: move.color === 'w' ? 'white' : 'black' };
}

export interface MoveMotion { fen: string; cancel(): void }
export function animateMove(move: Move, flipped: boolean, layer: HTMLElement, done: () => void,
  options: { reverse?: boolean; duration?: number } = {}): MoveMotion | undefined {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const plan = motionPlan(move, flipped, options.reverse);
  const animations: Animation[] = [];
  let cancelled = false;
  const arrow = options.reverse ? '' : ' marker-end="url(#motion-arrowhead)"';
  layer.innerHTML = `<svg class="motion-track" viewBox="0 0 800 800" aria-hidden="true">
    ${options.reverse ? '' : '<defs><marker id="motion-arrowhead" viewBox="0 0 10 10" refX="10" refY="5" markerUnits="userSpaceOnUse" markerWidth="28" markerHeight="28" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z"/></marker></defs>'}
    ${plan.pieces.map(piece => `<polyline points="${piece.route.map(([x, y]) => `${x * 100 + 50},${y * 100 + 50}`).join(' ')}"${arrow}/>`).join('')}
  </svg>`;
  for (const piece of plan.pieces) {
    const element = document.createElement('piece');
    element.className = `${plan.color} ${piece.role} moving-piece`;
    layer.append(element);
    const frames = piece.route.map(([x, y], index) => ({
      transform: `translate(${x * 100}%, ${y * 100}%)`,
      offset: piece.route.length === 3 ? [0, 2 / 3, 1][index] : index,
    }));
    animations.push(element.animate(frames, { duration: options.duration ?? moveDuration, easing: 'linear', fill: 'both' }));
  }
  const cancel = () => {
    cancelled = true;
    animations.forEach(animation => animation.cancel());
    layer.replaceChildren();
  };
  void Promise.all(animations.map(animation => animation.finished)).then(() => {
    if (cancelled) return;
    cancel(); done();
  }).catch(() => { /* Cancellation never commits or replays a move. */ });
  return { fen: plan.fen, cancel };
}
