import { boards, pieces } from './visuals.json';

export interface Settings {
  board: keyof typeof boards;
  pieces: keyof typeof pieces;
  hints: 'arrows' | 'dots';
  blunders: boolean;
  sound: 'wood' | 'bubbles' | 'chimes' | 'off';
  elo: number;
  castling: boolean;
  enPassant: boolean;
}
export const defaults: Settings = {
  board: 'lichess-wood', pieces: 'cburnett', hints: 'arrows', blunders: true,
  sound: 'wood', elo: 100, castling: false, enPassant: false,
};
export function readSettings(): Settings {
  const result = { ...defaults };
  try {
    const data = JSON.parse(localStorage.getItem('little-knight-settings') ?? '{}');
    const options = { board: Object.keys(boards), pieces: Object.keys(pieces),
      hints: ['arrows', 'dots'], sound: ['wood', 'bubbles', 'chimes', 'off'],
      elo: Array.from({ length: 30 }, (_, index) => (index + 1) * 100) };
    for (const key of Object.keys(defaults) as (keyof Settings)[]) {
      if (key in options ? (options[key as keyof typeof options] as readonly unknown[]).includes(data[key])
        : typeof data[key] === 'boolean') Object.assign(result, { [key]: data[key] });
    }
  } catch { /* Private browsing and corrupt preferences keep the defaults. */ }
  return result;
}
export function saveSettings(settings: Settings) {
  try { localStorage.setItem('little-knight-settings', JSON.stringify(settings)); } catch { /* Optional persistence. */ }
}
