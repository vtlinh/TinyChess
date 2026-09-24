import { Game, legalMoves, uci } from './game';

// Talbot's compact legal-move-index idea; v1 also records our simplified rules.
// One byte per ply, base64url in the fragment: no server and no game database.
export function gameHash(game: Game, pending = false): string {
  const header = Number(game.rules.castling) | (Number(game.rules.enPassant) << 1) | (Number(pending) << 2) | (Number(game.humanColor === 'b') << 3);
  const binary = [header, ...game.indices].map(n => String.fromCharCode(n)).join('');
  return '#v1.' + btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
export function fromHash(hash: string): { game: Game; pending: boolean } | undefined {
  if (!/^#v1\.[A-Za-z0-9_-]+$/.test(hash) || hash.length > 2800) return;
  try {
    const encoded = hash.slice(4);
    if (encoded.length % 4 === 1) return;
    const bytes = Array.from(atob(encoded.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
    if (!bytes.length || bytes[0] > 15 || bytes.length > 2049) return;
    const game = new Game({ castling: !!(bytes[0] & 1), enPassant: !!(bytes[0] & 2) }, bytes[0] & 8 ? 'b' : 'w');
    for (const index of bytes.slice(1)) {
      const choices = legalMoves(game.chess, game.rules).sort((a, b) => uci(a).localeCompare(uci(b), 'en'));
      if (!choices[index]) return;
      game.play(uci(choices[index]));
    }
    const pending = !!(bytes[0] & 4);
    if (pending && (game.humanTurn || game.over)) return;
    return { game, pending };
  } catch { return; }
}
