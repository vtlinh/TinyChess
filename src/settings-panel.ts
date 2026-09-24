import '@awesome.me/webawesome/dist/components/radio-group/radio-group.js';
import '@awesome.me/webawesome/dist/styles/themes/default.css';
import { boards, pieces } from './visuals.json';
import type { Settings } from './settings';
import type { Rules } from './game';
import { icon } from './icons';

export function settingsPanel(settings: Settings, rules: Rules, asset: (path: string) => string) {
  const choice = (key: keyof Settings, value: string, label: string, preview = '') =>
    `<label class="choice" title="${label}"><input type="radio" name="${key}" value="${value}" ${settings[key] === value ? 'checked' : ''}/>${preview}<span>${label}</span></label>`;
  const pill = (key: keyof Settings, label: string, value: string, options: [string, string][], title = '') =>
    `<wa-radio-group class="pill" label="${label}" name="${key}" value="${value}" orientation="horizontal" size="s" ${title ? `title="${title}"` : ''}>
      ${options.map(([v, name]) => `<wa-radio appearance="button" value="${v}">${name}</wa-radio>`).join('')}
    </wa-radio-group>`;
  const toggle = (key: keyof Settings, label: string, enabled: boolean, title = '') =>
    pill(key, label, enabled ? 'on' : 'off', [['on', 'On'], ['off', 'Off']], title);
  return `<form id="settings-form">
    <div class="dialog-heading"><h2 id="settings-title">Settings</h2><button type="button" class="icon-button" data-close aria-label="Close settings">${icon('close')}</button></div>
    <fieldset><legend>Board</legend><div class="choices catalog boards">${Object.entries(boards).map(([id, board]) =>
      choice('board', id, board.name, board.file
        ? `<img class="board-swatch" alt="" loading="lazy" src="${asset(`boards/${board.file}`)}"/>`
        : `<span class="board-swatch ${id}"></span>`)).join('')}</div></fieldset>
    <fieldset><legend>Pieces</legend><div class="choices catalog pieces">${Object.entries(pieces).map(([id, set]) =>
      choice('pieces', id, set.name, `<img class="piece-preview" alt="" loading="lazy" src="${asset(`pieces/${id}/wN.svg`)}"/>`)).join('')}</div></fieldset>
    ${pill('hints', 'Move Hint', settings.hints, [['arrows', 'Arrows'], ['dots', 'Dots']])}
    ${toggle('blunders', 'Blunder Buddy', settings.blunders, 'Warn on a blunder')}
    <fieldset class="elo-control"><div class="level-label"><label for="elo">CPU Elo</label><output id="elo-value" for="elo">${settings.elo}</output></div>
      <input id="elo" name="elo" type="range" min="100" max="3000" step="100" value="${settings.elo}"/>
      <div class="range-labels" aria-hidden="true"><span>100</span><span>3000</span></div>
    </fieldset>
    ${pill('sound', 'Sound', settings.sound, [['wood', 'Wood'], ['bubbles', 'Bubbles'], ['chimes', 'Chimes'], ['off', 'Off']])}
    <fieldset class="rules"><legend>Rules</legend>
      ${toggle('castling', 'Castling', rules.castling)}
      ${toggle('enPassant', 'En passant', rules.enPassant)}
    </fieldset>
    <div class="dialog-actions"><button id="save-settings" type="submit" class="primary">Done ${icon('check')}</button></div>
  </form>`;
}
