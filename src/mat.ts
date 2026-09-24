import type { Move } from 'chess.js';
import { names, type Game } from './game';
import { whiteEvaluation } from './engine/search';

const types = ['q', 'r', 'b', 'n', 'p'] as const;
export function captureRows(moves: Move[]) {
  return types.map(type => {
    const white = moves.filter(m => m.color === 'w' && m.captured === type).length;
    const black = moves.filter(m => m.color === 'b' && m.captured === type).length;
    return { type, white, black, rows: Math.max(white, black) };
  });
}

export function renderMat(element: HTMLElement, game: Game) {
  const rows = captureRows(game.moves);
  element.style.setProperty('--capture-rows', String(Math.max(1, rows.reduce((sum, row) => sum + row.rows, 0))));
  for (const by of ['white', 'black'] as const) {
    const color = by === 'white' ? 'black' : 'white';
    element.querySelector(`#${by}-captures`)!.innerHTML = rows.filter(row => row.rows).map(row =>
      `<div class="capture-slot" data-piece="${row.type}" style="height:calc(var(--capture-size) * ${row.rows})">${Array.from({ length: row[by] }, () =>
        `<piece class="${color} ${names[row.type]}" role="img" aria-label="${color} ${names[row.type]}"></piece>`).join('')}</div>`).join('');
  }
  const over = game.over;
  const mate = !!over && game.chess.isCheck();
  const score = over ? 0 : whiteEvaluation(game.chess) / 100;
  const percent = mate ? (game.chess.turn() === 'w' ? 0 : 100) : 100 / (1 + Math.exp(-score / 4));
  const label = mate ? (game.chess.turn() === 'w' ? '0–1' : '1–0') : `${score > 0 ? '+' : ''}${score.toFixed(1)}`;
  const meter = element.querySelector<HTMLElement>('#eval-bar')!;
  meter.classList.toggle('flipped', game.humanColor === 'b');
  meter.setAttribute('aria-valuenow', percent.toFixed(1));
  meter.setAttribute('aria-valuetext', mate ? `Checkmate: ${label}` : `${label} pawns, White’s perspective`);
  element.querySelector<HTMLElement>('#eval-white')!.style.height = `${percent}%`;
  element.querySelector('#eval-score')!.textContent = label;
}
