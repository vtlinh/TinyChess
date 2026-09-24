import { expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { motionPlan, moveDuration, moveRoute, undoDuration } from '../../src/motion';

it('plans forward and reverse travel for every special move', () => {
  expect(moveDuration).toBe(800);
  expect(undoDuration).toBe(400);
  expect(moveRoute('g1', 'f3', true, false)).toEqual([[6, 7], [6, 5], [5, 5]]);
  expect(moveRoute('g1', 'e2', true, false)).toEqual([[6, 7], [4, 7], [4, 6]]);
  expect(moveRoute('b8', 'c6', true, true)).toEqual([[6, 7], [6, 5], [5, 5]]);
  expect(moveRoute('e2', 'e4', false, false)).toEqual([[4, 6], [4, 4]]);
  const chess = new Chess();
  const knight = chess.move('Nf3');
  expect(motionPlan(knight, false, true).pieces).toEqual([
    { role: 'knight', route: [[5, 5], [6, 5], [6, 7]] },
  ]);
  const reversePromotion = new Chess('4k3/6P1/8/8/8/8/8/4K3 w - - 0 1').move('g8=Q');
  expect(motionPlan(reversePromotion, false, true).pieces[0]).toEqual({ role: 'queen', route: [[6, 0], [6, 1]] });
  const capture = new Chess('4k3/8/8/8/4r3/8/4R3/4K3 w - - 0 1');
  const plan = motionPlan(capture.move('Rxe4'), false);
  const visible = new Chess(plan.fen);
  expect(visible.get('e2')).toBeUndefined();
  expect(visible.get('e4')).toEqual({ type: 'r', color: 'b' });
  expect(plan.pieces).toEqual([{ role: 'rook', route: [[4, 6], [4, 4]] }]);
  const castle = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const castlePlan = motionPlan(castle.move('O-O'), false);
  expect(castlePlan.pieces).toEqual([
    { role: 'king', route: [[4, 7], [6, 7]] },
    { role: 'rook', route: [[7, 7], [5, 7]] },
  ]);
  const before = new Chess(castlePlan.fen, { skipValidation: true });
  expect(before.get('e1')).toBeUndefined(); expect(before.get('h1')).toBeUndefined();
  const forwardPromotion = new Chess('4k3/6P1/8/8/8/8/8/4K3 w - - 0 1');
  expect(motionPlan(forwardPromotion.move('g8=Q'), false).pieces[0].role).toBe('pawn');
  const enPassant = new Chess('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
  const enPassantPlan = motionPlan(enPassant.move('exd6'), false);
  expect(new Chess(enPassantPlan.fen).get('d5')).toEqual({ type: 'p', color: 'b' });
  expect(enPassantPlan.pieces[0].route).toEqual([[4, 3], [3, 2]]);
});
