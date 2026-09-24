import { Chess } from 'chess.js';
import { legalMoves, uci, values, type Rules } from '../game';

export function whiteEvaluation(chess: Chess): number {
  let score = 0;
  for (const piece of chess.board().flat()) if (piece) {
    const file = piece.square.charCodeAt(0) - 97;
    const rank = Number(piece.square[1]) - 1;
    const center = 3.5 - (Math.abs(file - 3.5) + Math.abs(rank - 3.5)) / 2;
    const advance = piece.color === 'w' ? rank : 7 - rank;
    score += (piece.color === 'w' ? 1 : -1) * (values[piece.type]
      + (piece.type === 'p' ? advance * 5 : piece.type === 'n' || piece.type === 'b' ? center * 12 : 0));
  }
  return score;
}
function evaluation(chess: Chess) { return whiteEvaluation(chess) * (chess.turn() === 'w' ? 1 : -1); }

/** Tiny GPL JavaScript engine using chess.js for every legal move, including variants. */
export function chooseMove(fen: string, rules: Rules, elo: number, budgetMs = 100, random = Math.random): string | undefined {
  const chess = new Chess(fen);
  const moves = legalMoves(chess, rules);
  if (!moves.length) return;
  // These are approximate teaching levels, not measured tournament ratings.
  const strength = Math.max(100, Math.min(3000, elo));
  const mistakeRate = .92 * Math.pow(1 - (strength - 100) / 2900, 6);
  if (random() < mistakeRate) return uci(moves[Math.min(moves.length - 1, Math.floor(random() * moves.length))]);
  const deadline = performance.now() + budgetMs * (.35 + .65 * strength / 3000);
  const timeout = Symbol('search deadline');
  function search(depth: number, alpha: number, beta: number, ply: number): number {
    if (performance.now() >= deadline) throw timeout;
    const choices = legalMoves(chess, rules);
    if (!choices.length) return chess.isCheck() ? -100000 + ply : 0;
    if (depth === 0) return evaluation(chess);
    choices.sort((a, b) => (b.captured ? values[b.captured] : 0) - (a.captured ? values[a.captured] : 0));
    let best = -Infinity;
    for (const move of choices) {
      chess.move(move);
      let score: number;
      try { score = -search(depth - 1, -beta, -alpha, ply + 1); }
      finally { chess.undo(); }
      best = Math.max(best, score);
      alpha = Math.max(alpha, score);
      if (alpha >= beta) break;
    }
    return best;
  }
  const ordered = moves.map(move => ({ move, score: random() }));
  ordered.sort((a, b) => b.score - a.score);
  // A completed one-ply pass provides a stable fallback if deeper search times out.
  for (const entry of ordered) {
    chess.move(entry.move);
    entry.score = -evaluation(chess);
    chess.undo();
  }
  ordered.sort((a, b) => b.score - a.score);
  let best = uci(ordered[0].move);
  const maxDepth = strength < 600 ? 1 : strength < 1200 ? 2 : strength < 2000 ? 3 : strength < 2600 ? 4 : 5;
  for (let depth = 1; depth <= maxDepth; depth++) {
    const scored = [];
    try {
      for (const entry of ordered) {
        chess.move(entry.move);
        try { scored.push({ move: entry.move, score: -search(depth - 1, -Infinity, Infinity, 1) }); }
        finally { chess.undo(); }
      }
    } catch (error) { if (error === timeout) break; throw error; }
    scored.sort((a, b) => b.score - a.score);
    best = uci(scored[0].move);
    ordered.splice(0, ordered.length, ...scored);
  }
  return best;
}
