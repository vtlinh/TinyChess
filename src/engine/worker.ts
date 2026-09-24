import { Chess } from 'chess.js';
import { legalMoves, type Rules } from '../game';
import { chooseMove } from './search';

export interface Request { type: 'ponder' | 'play' | 'stop'; id: number; fen: string; rules: Rules; elo: number }
export interface Reply { id: number; fen: string; move?: string }
let generation = 0;
const cache = new Map<string, string>();
const keyFor = (fen: string, rules: Rules, elo: number) => `${fen}|${Number(rules.castling)}${Number(rules.enPassant)}|${elo}`;
self.onmessage = async ({ data }: MessageEvent<Request>) => {
  const generationHere = ++generation;
  if (data.type === 'stop') return;
  const { fen, rules, elo, id } = data;
  if (data.type === 'play') {
    const move = cache.get(keyFor(fen, rules, elo)) ?? chooseMove(fen, rules, elo, 120);
    self.postMessage({ id, fen, move } satisfies Reply);
    return;
  }
  // Prepare a reply to each possible human move while the child explores.
  const chess = new Chess(fen);
  for (const move of legalMoves(chess, rules)) {
    if (generationHere !== generation) return;
    chess.move(move);
    const childFen = chess.fen();
    const key = keyFor(childFen, rules, elo);
    if (!cache.has(key)) {
      const reply = chooseMove(childFen, rules, elo, 35);
      if (reply) cache.set(key, reply);
    }
    chess.undo();
    if (cache.size > 512) cache.delete(cache.keys().next().value!);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
};
