import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { Game, beginnerRules, ending, findDanger, findAttack, legalMoves, uci } from '../../src/game';
import { captureRows } from '../../src/mat';
import { gameHash, fromHash } from '../../src/share';
import { chooseMove, whiteEvaluation } from '../../src/engine/search';

const full = { castling: true, enPassant: true };

describe('chess behavior', () => {
  it('enforces simplified rules, king safety, and endings', () => {
    for (const side of ['w', 'b']) {
      const chess = new Chess(`r3k2r/8/8/8/8/8/8/R3K2R ${side} KQkq - 0 1`);
      expect(legalMoves(chess, full).filter(m => /[kq]/.test(m.flags))).toHaveLength(2);
      expect(legalMoves(chess, beginnerRules).some(m => /[kq]/.test(m.flags))).toBe(false);
    }
    for (const fen of ['4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', '4k3/8/8/8/3Pp3/8/8/4K3 b - d3 0 1']) {
      const chess = new Chess(fen);
      expect(legalMoves(chess, full).some(m => m.flags.includes('e'))).toBe(true);
      expect(legalMoves(chess, beginnerRules).some(m => m.flags.includes('e'))).toBe(false);
    }
    const game = new Game();
    game.chess = new Chess('4r1k1/8/8/8/8/8/P7/4K3 w - - 0 1');
    expect(game.destinations().has('a2')).toBe(false);
    expect(game.destinations().get('e1')).not.toContain('e2');
    expect(ending(new Chess('7k/6Q1/5K2/8/8/8/8/8 b - - 0 1'), beginnerRules)).toBe('ai-checkmated');
    expect(ending(new Chess('7k/5Q2/5K2/8/8/8/8/8 b - - 0 1'), beginnerRules)).toBe('stalemate');
  });

  it('takes back complete turns and safely round-trips URL state', () => {
    const game = new Game();
    game.play('e2e4'); game.play('e7e5');
    expect(game.undo().map(uci)).toEqual(['e7e5', 'e2e4']);
    expect(game.chess.fen()).toBe(new Chess().fen());
    expect(game.indices).toEqual([]);
    game.play('d2d4');
    expect(fromHash(gameHash(game))?.game.chess.fen()).toBe(game.chess.fen());

    const early = new Game(); early.play('e2e4'); early.undo(); early.undo();
    expect(early.chess.fen()).toBe(new Chess().fen());

    const replay = new Game(full);
    for (const move of ['e2e4', 'e7e5', 'd1h5']) replay.play(move);
    const restored = fromHash(gameHash(replay, true))!;
    expect(restored.pending).toBe(true);
    expect(restored.game.rules).toEqual(full);
    expect(restored.game.chess.fen()).toBe(replay.chess.fen());
    expect(restored.game.moves.map(uci)).toEqual(replay.moves.map(uci));

    const castle = new Game(full);
    for (const move of ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'e1g1']) castle.play(move);
    expect(fromHash(gameHash(castle))?.game.chess.fen()).toBe(castle.chess.fen());

    const repetition = new Game();
    for (let n = 0; n < 2; n++) for (const move of ['g1f3', 'g8f6', 'f3g1', 'f6g8']) repetition.play(move);
    expect(fromHash(gameHash(repetition))?.game.chess.isThreefoldRepetition()).toBe(true);
    for (const hash of ['#oops', '#v2.AA', '#v1.A', '#v1.____', '#v1.AP8', '#v1.BA', '#v1.' + 'A'.repeat(3000)]) {
      expect(fromHash(hash)).toBeUndefined();
    }
  });

  it('warns only about uncompensated legal blunders', () => {
    const hanging = new Chess('4k3/8/8/3p4/8/8/4Q3/4K3 w - - 0 1');
    const hangingMove = hanging.move('Qe4'), before = hanging.fen();
    expect(findDanger(hanging, beginnerRules, hangingMove)?.voice).toBe('blunder-queen');
    expect(hanging.fen()).toBe(before);
    expect(hanging.history()).toEqual(['Qe4+']);

    const exposed = new Chess('4k3/8/8/8/r1B1Q3/8/8/4K3 w - - 0 1');
    expect(findDanger(exposed, beginnerRules, exposed.move('Bd3'))?.to).toBe('e4');

    const fair = new Chess('4k3/8/8/3p4/8/5P2/4P3/4K3 w - - 0 1');
    expect(findDanger(fair, beginnerRules, fair.move('e4'))).toBeUndefined();
    const profitable = new Chess('4k3/8/8/3p4/4q3/8/4R3/4K3 w - - 0 1');
    expect(findDanger(profitable, beginnerRules, profitable.move('Rxe4'))).toBeUndefined();
    const pinned = new Chess('4k3/8/4n3/8/8/8/3Q4/K3R3 w - - 0 1');
    expect(findDanger(pinned, beginnerRules, pinned.move('Qd4'))).toBeUndefined();
  });

  it('describes AI threats, captures, and evaluation without mutating the game', () => {
    const threat = new Chess('4k3/8/8/3p4/4R3/8/8/4K3 w - - 0 1');
    const before = threat.fen();
    expect(findAttack(threat, beginnerRules)?.voice).toBe('attack-pawn-rook-free');
    expect(threat.fen()).toBe(before);
    for (const fen of ['4k3/8/8/3p4/4P3/5P2/8/4K3 w - - 0 1', '4k3/8/4n3/8/3Q4/8/8/K3R3 w - - 0 1', '4r1k1/8/8/8/8/8/8/4K3 w - - 0 1']) {
      expect(findAttack(new Chess(fen), beginnerRules)).toBeUndefined();
    }
    expect(findAttack(new Chess('2q4k/8/8/8/2B5/8/8/7K w - - 0 1'), beginnerRules)?.voice).toBe('attack-queen-bishop-free');
    expect(findAttack(new Chess('4k3/8/8/3p4/4R3/5P2/8/4K3 w - - 0 1'), beginnerRules)?.voice).toBe('attack-pawn-rook');

    const captures = new Chess('4k3/P7/8/3pP3/8/8/8/4K3 w - d6 0 1');
    captures.move('exd6'); captures.move('Kf7'); captures.move('a8=Q');
    expect(captureRows(captures.history({ verbose: true })).find(row => row.type === 'p'))
      .toEqual({ type: 'p', white: 1, black: 0, rows: 1 });
    expect(whiteEvaluation(new Chess())).toBe(0);
    for (const turn of ['w', 'b']) {
      expect(whiteEvaluation(new Chess(`4k3/8/8/8/8/8/8/R3K3 ${turn} - - 0 1`))).toBe(500);
    }
  });

  it('returns legal rule-compatible opponent moves at every strength', () => {
    const fen = 'r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1';
    const moves = legalMoves(new Chess(fen), beginnerRules).map(uci);
    for (const elo of [100, 300, 600, 900, 1500, 2400, 3000]) for (const random of [() => .01, () => .99]) {
      expect(moves).toContain(chooseMove(fen, beginnerRules, elo, 50, random));
    }
    expect(chooseMove('7k/6Q1/5K2/8/8/8/8/8 b - - 0 1', full, 900)).toBeUndefined();
    expect(chooseMove('4k3/8/8/3p4/4Q3/8/8/4K3 b - - 0 1', full, 900, 300, () => .99)).toBe('d5e4');
  });
});
