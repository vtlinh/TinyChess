import { expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { beginnerRules, findFreeCapture } from '../../src/game';

it('finds only legal, uncompensated captures and prefers the best one', () => {
  const chess = new Chess('k7/8/8/8/4r3/8/4R3/K7 w - - 0 1');
  const before = chess.fen();
  expect(findFreeCapture(chess, beginnerRules)).toEqual({ from: 'e2', to: 'e4', voice: 'capture-rook-free', exposedVoice: undefined });
  expect(chess.fen()).toBe(before);
  expect(chess.history()).toEqual([]);
  const black = new Chess('k7/4r3/8/4R3/8/8/8/K7 b - - 0 1');
  expect(findFreeCapture(black, beginnerRules, 'b')?.to).toBe('e5');
  expect(findFreeCapture(black, beginnerRules, 'w')).toBeUndefined();

  expect(findFreeCapture(new Chess('k7/8/8/3p4/4r3/8/4R3/K7 w - - 0 1'), beginnerRules)).toBeUndefined();
  expect(findFreeCapture(new Chess('k7/8/4p3/3q4/2P5/8/8/K7 w - - 0 1'), beginnerRules)).toBeUndefined();
  expect(findFreeCapture(new Chess('k3r3/8/8/8/3q4/8/4N3/4K3 w - - 0 1'), beginnerRules)).toBeUndefined();

  const enPassant = new Chess('k7/8/8/3pP3/8/8/8/K7 w - d6 0 1');
  expect(findFreeCapture(enPassant, beginnerRules)).toBeUndefined();
  expect(findFreeCapture(enPassant, { castling: false, enPassant: true })?.to).toBe('d6');

  const best = new Chess('k7/8/8/8/4r3/8/4R2q/K7 w - - 0 1');
  expect(findFreeCapture(best, beginnerRules)?.to).toBe('h2');
});
