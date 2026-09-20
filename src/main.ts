import { Chessground } from '@lichess-org/chessground';
import type { Key } from '@lichess-org/chessground/types';
import { Chess, type Color, type Square, type Move } from 'chess.js';
import { Game, randomColor, findDanger, findAttack, findFreeCapture, legalMoves, names, uci, type Danger } from './game';
import { renderMat } from './mat';
import { arrowTipOffset, moveArrowPath } from './arrows';
import { animateMove, undoDuration, type MoveMotion } from './motion';
import { gameHash, fromHash } from './share';
import { readSettings, saveSettings, type Settings } from './settings';
import { settingsPanel } from './settings-panel';
import { boards } from './visuals.json';
import { playSound, speak, stopSpeech, warmAudio } from './audio';
import { voiceText, type VoiceId } from './voices';
import { icon } from './icons';
import type { Request, Reply } from './engine/worker';
import '@lichess-org/chessground/assets/chessground.base.css';
import './style.css';

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
let settings = readSettings();
const restored = fromHash(location.hash);
let game = restored?.game ?? new Game({ castling: settings.castling, enPassant: settings.enPassant }, location.hash ? 'w' : randomColor());
let danger: Danger | undefined;
let attack: Danger | undefined;
let opportunity: Danger | undefined;
let selected: Square | undefined;
let message: VoiceId[] = location.hash && !restored ? ['invalid-game-link'] : [];
let revision = 0;
let replyTimer: ReturnType<typeof setTimeout> | undefined;
let worker: Worker | undefined;
let promotion: { from: Key; to: Key } | undefined;
let motion: MoveMotion | undefined;
let queuedReply: string | undefined;
let coaching = false;
let coachToken = 0;
let undoing = false;
let undoQueue: Move[] = [];
// Absolute URLs also resolve correctly when a CSS variable is consumed by a bundled stylesheet.
const asset = (path: string) => new URL(path, new URL(import.meta.env.BASE_URL, document.baseURI)).href;

$('#app').innerHTML = `
  <header class="header">
    <a class="brand" href="${import.meta.env.BASE_URL}" aria-label="Little Knight home"><span class="brand-mark">♞</span><span>little knight<span class="brand-dot">.</span></span></a>
    <div class="header-tools">${__COMMIT_URL__
      ? `<a class="version" href="${__COMMIT_URL__}" target="_blank" rel="noopener" title="${__COMMIT__}">${__COMMIT__.slice(0, 7)}</a>`
      : `<span class="version" title="${__COMMIT__ || 'Local build'}">${__COMMIT__.slice(0, 7) || 'dev'}</span>`}<button id="settings-button" class="icon-button" aria-label="Settings" title="Settings">${icon('settings')}</button></div>
  </header>
  <main>
    <section class="play-area" aria-label="Chess game">
      <div class="player opponent"><span class="avatar ai" aria-hidden="true">🤖</span><strong>AI</strong><button type="button" class="coach" id="coach" title="Repeat message" hidden><span id="coach-message" role="status" aria-live="polite"></span></button></div>
      <div class="board-layout">
        <div id="eval-bar" role="meter" aria-label="Position estimate, White’s perspective" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" title="Position estimate: material and piece placement"><div id="eval-white"></div><span id="eval-score">0.0</span></div>
        <div class="board-frame"><div id="board" tabindex="0" role="application" aria-label="Chessboard. You play white. Use arrow keys to explore, then Enter to select a piece and destination."></div><svg id="move-arrows" viewBox="0 0 800 800" aria-hidden="true"></svg><div id="motion-layer" class="cg-wrap" aria-hidden="true"></div></div>
        <div class="captures" aria-label="Captured pieces"><div id="white-captures" class="captured-pieces cg-wrap" aria-label="Captured by White"></div><div id="black-captures" class="captured-pieces cg-wrap" aria-label="Captured by Black"></div></div>
      </div>
      <span id="keyboard-status" class="sr-only" role="status" aria-live="polite"></span>
      <div class="player human"><span class="avatar you">☀</span><strong>You</strong></div>
      <div class="controls"><button id="new-game">${icon('plus')} Start Over</button><button id="undo">${icon('undo')} Take Back</button></div>
    </section>
  </main>
  <dialog id="settings-dialog" aria-labelledby="settings-title"></dialog>
  <dialog id="start-dialog" aria-labelledby="start-title"><form id="start-form">
    <div class="dialog-heading"><h2 id="start-title">Start Over</h2><button type="button" class="icon-button" data-close aria-label="Cancel">${icon('close')}</button></div>
    <wa-radio-group class="pill" label="Play as" name="side" value="random" orientation="horizontal" size="s">
      <wa-radio appearance="button" value="w">White</wa-radio><wa-radio appearance="button" value="b">Black</wa-radio><wa-radio appearance="button" value="random">Random</wa-radio>
    </wa-radio-group>
    <div class="dialog-actions"><button type="submit" class="primary">Play</button></div>
  </form></dialog>
  <dialog id="promotion-dialog" aria-labelledby="promotion-title"><h2 id="promotion-title">Your pawn grew up!</h2><p>Choose its new piece.</p><div id="promotion-options"></div></dialog>
`;

const board = Chessground($('#board'), {
  orientation: game.humanName, coordinates: true, autoCastle: true,
  animation: { enabled: false },
  movable: { free: false, color: game.humanName, rookCastle: false, events: { after: humanMove } },
  premovable: { enabled: false }, draggable: { enabled: true, showGhost: true },
  drawable: { enabled: false },
  events: { select: key => {
    if (!game.humanTurn || paused() || motion || game.over) return;
    selected = game.chess.get(key as Square)?.color === game.humanColor ? key as Square : undefined;
    renderHints();
  } },
});

function paused() { return !!document.querySelector('dialog[open]') || document.hidden; }
function cancelMotion() {
  motion?.cancel(); motion = undefined; queuedReply = undefined;
  undoQueue = []; undoing = false;
}
function cancelCoach() { coachToken++; coaching = false; stopSpeech(); }
function releaseReply() {
  if (motion || coaching || paused()) return;
  const reply = queuedReply; queuedReply = undefined;
  if (reply && !game.humanTurn) computerMove(reply);
  else syncEngine();
}
function startMotion(move: Move, reverse = false, landed?: () => void) {
  motion = animateMove(move, game.humanColor === 'b', $('#motion-layer'), () => {
    motion = undefined;
    render();
    landed?.();
    if (reverse) playNextUndo();
    else releaseReply();
  }, reverse ? { reverse: true, duration: undoDuration } : undefined);
  return !!motion;
}
function persist() { history.replaceState(null, '', location.pathname + location.search + gameHash(game)); }
function restoredDanger(): Danger | undefined {
  if (!settings.blunders) return;
  const moves = game.moves;
  const lastHuman = moves.reverse().find(move => move.color === game.humanColor);
  return lastHuman ? findDanger(new Chess(lastHuman.after), game.rules, lastHuman) : undefined;
}
function warningMessage(): VoiceId[] {
  return danger ? [game.humanTurn ? danger.exposedVoice ?? danger.voice : danger.voice] : hintMessage();
}
function hintMessage(): VoiceId[] {
  return [attack?.voice, opportunity?.voice].filter((id): id is VoiceId => !!id);
}
function positionMessage(fallback: readonly VoiceId[] = []): VoiceId[] {
  if (danger) return warningMessage();
  if (game.over) return [game.over];
  if (game.chess.isCheck() && game.humanTurn) return ['king-in-check'];
  const hints = hintMessage();
  return hints.length ? hints : [...fallback];
}
function warnedCapture(): string | undefined {
  if (!danger || game.humanTurn) return;
  const captures = legalMoves(game.chess, game.rules).filter(move => move.from === danger!.from && move.to === danger!.to);
  const capture = captures.find(move => move.promotion === 'q') ?? captures[0];
  return capture ? uci(capture) : undefined;
}
function displayedMessage(): VoiceId[] { return message.length ? message : game.humanTurn && !game.over ? ['your-turn'] : []; }
function refreshPositionHints() {
  attack = settings.blunders ? findAttack(game.chess, game.rules, game.humanColor) : undefined;
  opportunity = settings.blunders ? findFreeCapture(game.chess, game.rules, game.humanColor) : undefined;
}
function tell(next?: VoiceId | readonly VoiceId[]) {
  message = !next ? [] : typeof next === 'string' ? [next] : [...next];
  render();
}
function cancelEngine() {
  revision++; clearTimeout(replyTimer); queuedReply = undefined;
  worker?.postMessage({ type: 'stop', id: revision, fen: game.chess.fen(), rules: game.rules, elo: settings.elo } satisfies Request);
}
function syncEngine() {
  cancelEngine();
  if (paused() || game.over) return;
  const fen = game.chess.fen(), id = revision;
  worker?.postMessage({ type: game.humanTurn ? 'ponder' : 'play', id, fen, rules: game.rules, elo: settings.elo } satisfies Request);
  if (!game.humanTurn) {
    // A legal fallback also covers worker loading, crashes, or a slow device.
    replyTimer = setTimeout(() => {
      if (revision !== id || paused() || game.chess.fen() !== fen) return;
      const moves = legalMoves(game.chess, game.rules);
      const move = moves[Math.floor(Math.random() * moves.length)];
      if (move) computerMove(uci(move));
    }, 650);
  }
}
try {
  worker = new Worker(new URL('./engine/worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }: MessageEvent<Reply>) => {
    if (data.id !== revision || data.fen !== game.chess.fen() || paused() || game.humanTurn || !data.move) return;
    if (legalMoves(game.chess, game.rules).some(m => uci(m) === data.move)) computerMove(data.move);
  };
  worker.onerror = () => { worker?.terminate(); worker = undefined; };
} catch { /* The bounded legal-move fallback keeps the game playable. */ }

function computerMove(move: string) {
  clearTimeout(replyTimer);
  if (motion || coaching) { queuedReply = move; return; }
  const played = game.play(warnedCapture() ?? move); selected = undefined;
  refreshPositionHints();
  const text = positionMessage(message);
  // The blunder was already spoken before the AI reply.
  // Do not queue a lower-priority tip behind it when the AI replies.
  const announce = !danger && !!(game.over || game.chess.isCheck() || hintMessage().length);
  const landed = () => {
    playSound(settings.sound);
    if (announce && settings.blunders) void speak(text, true);
  };
  const animated = startMotion(played, false, landed);
  tell(text); persist(); syncEngine();
  if (!animated) landed();
}
function humanMove(from: Key, to: Key) {
  if (!game.humanTurn || paused() || motion || game.over) { render(); return; }
  warmAudio();
  const options = legalMoves(game.chess, game.rules).filter(m => m.from === from && m.to === to);
  if (!options.length) { render(); return; }
  if (options.some(m => m.promotion)) {
    promotion = { from, to }; render(); cancelEngine();
    $('#promotion-options').innerHTML = options.map(m => `<button data-promote="${m.promotion}" aria-label="Promote to ${names[m.promotion!]}"><img alt="" src="${asset(`pieces/${settings.pieces}/${game.humanColor}${m.promotion!.toUpperCase()}.svg`)}"/>${names[m.promotion!]}</button>`).join('');
    $<HTMLDialogElement>('#promotion-dialog').showModal(); return;
  }
  commitHuman(uci(options[0]));
}
function commitHuman(move: string) {
  cancelEngine(); cancelCoach(); selected = undefined;
  const played = game.play(move);
  const risk = findDanger(game.chess, game.rules, played);
  danger = settings.blunders ? risk : undefined; attack = undefined; opportunity = undefined;
  const next = game.over ?? danger?.voice ?? (risk ? undefined : 'good-move');
  const announce = !!game.over || !!danger || !risk;
  const token = ++coachToken;
  coaching = announce && settings.blunders && !!next;
  const landed = () => {
    playSound(settings.sound);
    if (!coaching || !next || token !== coachToken) return;
    void speak(next).finally(() => {
      if (token !== coachToken) return;
      coaching = false; releaseReply();
    });
  };
  const animated = startMotion(played, false, landed);
  tell(next); persist(); syncEngine();
  if (!animated) landed();
}
function undo() {
  cancelEngine(); cancelMotion(); cancelCoach(); danger = undefined; attack = undefined; selected = undefined;
  undoQueue = game.undo();
  opportunity = settings.blunders ? findFreeCapture(game.chess, game.rules, game.humanColor) : undefined;
  message = opportunity ? [opportunity.voice] : [];
  persist();
  if (undoQueue.length) { undoing = true; playNextUndo(); }
  else { render(); syncEngine(); }
}
function playNextUndo() {
  const move = undoQueue.shift();
  if (!move) { undoing = false; render(); syncEngine(); return; }
  if (startMotion(move, true)) render();
  else playNextUndo();
}
function freshGame(color: Color = game.humanColor) {
  cancelEngine(); cancelMotion(); cancelCoach(); danger = undefined; attack = undefined; selected = undefined;
  game = new Game({ castling: settings.castling, enPassant: settings.enPassant }, color);
  opportunity = undefined;
  keyboardSquare = color === 'w' ? 'e2' : 'e7';
  board.selectSquare(null); board.set({ highlight: { custom: new Map() } });
  tell(); persist(); syncEngine();
}

function renderHints() {
  const piece = selected ? game.chess.get(selected) : undefined;
  const destinations = selected && game.humanTurn ? game.destinations().get(selected) ?? [] : [];
  const ids = displayedMessage();
  const text = voiceText(ids);
  $('#coach-message').textContent = text;
  $('#coach').hidden = !text;
  $<HTMLButtonElement>('#coach').disabled = !settings.blunders || !text || !!motion;
  $('#coach').title = settings.blunders ? 'Repeat message' : '';
  if (motion) { $('#move-arrows').innerHTML = ''; return; }
  const threat = !game.humanTurn ? danger : !selected ? attack : undefined;
  const showThreat = !!threat;
  // Free-capture tips are verbal only: let the child discover the capturing piece.
  const arrows: { from: string; to: string; knight: boolean }[] = threat ? [{ from: threat.from, to: threat.to, knight: game.chess.get(threat.from)?.type === 'n' }]
    : settings.hints === 'arrows' && selected ? destinations.map(to => ({ from: selected!, to, knight: piece?.type === 'n' })) : [];
  $('#move-arrows').innerHTML = `<defs><marker id="arrowhead" viewBox="0 0 10 10" refX="5" refY="5" markerUnits="userSpaceOnUse" markerWidth="${arrowTipOffset * 2}" markerHeight="${arrowTipOffset * 2}" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${showThreat ? '#cc653c' : '#37644f'}" /></marker></defs>` + arrows.map(a => {
    return `<path data-from="${a.from}" data-to="${a.to}" d="${moveArrowPath(a.from, a.to, a.knight, game.humanColor === 'b')}" fill="none" stroke="${showThreat ? '#cc653c' : '#37644f'}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" opacity=".76" marker-end="url(#arrowhead)"/>`;
  }).join('');
}
function applyAppearance() {
  document.documentElement.dataset.board = settings.board;
  const texture = boards[settings.board].file;
  document.documentElement.style.setProperty('--board-image', texture
    ? `url("${asset(`boards/${texture}`)}")` : 'none');
  document.documentElement.dataset.textured = String(!!texture);
  let style = document.querySelector<HTMLStyleElement>('#piece-style');
  if (!style) { style = document.createElement('style'); style.id = 'piece-style'; document.head.append(style); }
  style.textContent = Object.entries(names).flatMap(([type, role]) => ['w', 'b'].map(color =>
    `.cg-wrap piece.${color === 'w' ? 'white' : 'black'}.${role}{background-image:url("${asset(`pieces/${settings.pieces}/${color}${type.toUpperCase()}.svg`)}")}`)).join('\n');
}
function render() {
  const last: Move | undefined = game.moves.at(-1);
  board.set({ orientation: game.humanName, fen: motion?.fen ?? game.chess.fen(), turnColor: game.chess.turn() === 'w' ? 'white' : 'black',
    check: !motion && game.chess.isCheck(), lastMove: last ? [last.from, last.to] : [],
    movable: { color: !game.over && !paused() && !motion ? game.humanName : undefined,
      dests: game.humanTurn && !game.over && !motion ? game.destinations() : new Map(), showDests: settings.hints === 'dots' },
  });
  $('#board').dataset.animating = String(!!motion);
  $('#board').setAttribute('aria-busy', String(!!motion));
  $('#board').setAttribute('aria-label', `Chessboard. You play ${game.humanName}. Use arrow keys to explore, then Enter to select a piece and destination.`);
  $<HTMLButtonElement>('#undo').disabled = !game.canUndo || undoing;
  $('#undo').classList.toggle('blunder-bounce', settings.blunders && !!danger);
  $('#coach').classList.toggle('careful', !!danger || !!attack);
  renderMat($('.board-layout'), game);
  renderHints();
}

function showSettings() {
  cancelEngine(); cancelMotion(); cancelCoach();
  $('#settings-dialog').innerHTML = settingsPanel(settings, game.rules, asset);
  $<HTMLDialogElement>('#settings-dialog').showModal(); render();
  $('#settings-form').addEventListener('change', event => {
    const input = event.target as HTMLInputElement;
    if (input.name === 'sound') { warmAudio(); playSound(input.value as Settings['sound']); }
    const form = new FormData($<HTMLFormElement>('#settings-form'));
    const newRules = (form.get('castling') === 'on') !== game.rules.castling || (form.get('enPassant') === 'on') !== game.rules.enPassant;
    $('#save-settings').innerHTML = `${newRules && game.indices.length ? 'New game' : 'Done'} ${icon('check')}`;
  });
  $('#elo').addEventListener('input', event => { $('#elo-value').textContent = (event.target as HTMLInputElement).value; });
  $('#settings-form').addEventListener('submit', event => {
    event.preventDefault();
    const form = new FormData(event.target as HTMLFormElement);
    const buddyWasEnabled = settings.blunders;
    const changedRules = (form.get('castling') === 'on') !== game.rules.castling || (form.get('enPassant') === 'on') !== game.rules.enPassant;
    settings = { board: form.get('board') as Settings['board'], pieces: form.get('pieces') as Settings['pieces'],
      hints: form.get('hints') as Settings['hints'], sound: form.get('sound') as Settings['sound'], elo: Number(form.get('elo')) as Settings['elo'],
      blunders: form.get('blunders') === 'on', castling: form.get('castling') === 'on', enPassant: form.get('enPassant') === 'on' };
    saveSettings(settings); applyAppearance();
    if (!settings.blunders && (danger || attack || opportunity)) {
      danger = undefined; attack = undefined; opportunity = undefined;
      message = game.over ? [game.over] : game.chess.isCheck() && game.humanTurn ? ['king-in-check'] : [];
    } else if (settings.blunders && !buddyWasEnabled) {
      danger = restoredDanger(); refreshPositionHints();
      message = positionMessage();
    }
    $<HTMLDialogElement>('#settings-dialog').close();
    if (changedRules) freshGame(); else { render(); persist(); syncEngine(); }
  });
}

$('#settings-button').addEventListener('click', showSettings);
$('#coach').addEventListener('click', () => {
  const ids = displayedMessage();
  if (!ids.length || !settings.blunders || paused() || motion) return;
  warmAudio();
  const gateReply = !game.humanTurn && !game.over;
  const token = ++coachToken;
  coaching = gateReply;
  const playback = speak(ids);
  if (gateReply) void playback.finally(() => {
    if (token !== coachToken) return;
    coaching = false; releaseReply();
  });
});
$('#undo').addEventListener('click', undo);
$('#new-game').addEventListener('click', () => {
  cancelEngine(); cancelMotion(); cancelCoach();
  ($('wa-radio-group[name="side"]') as HTMLElement & { value: string }).value = 'random';
  $<HTMLDialogElement>('#start-dialog').showModal(); render();
});
$('#start-form').addEventListener('submit', event => {
  event.preventDefault();
  const side = new FormData($<HTMLFormElement>('#start-form')).get('side');
  $<HTMLDialogElement>('#start-dialog').close();
  freshGame(side === 'w' || side === 'b' ? side : randomColor());
});
$('#promotion-options').addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLElement>('[data-promote]');
  if (!button || !promotion) return;
  const move = promotion.from + promotion.to + button.dataset.promote;
  promotion = undefined; $<HTMLDialogElement>('#promotion-dialog').close(); commitHuman(move);
});
document.addEventListener('click', event => {
  const close = (event.target as HTMLElement).closest('[data-close]');
  if (close) close.closest('dialog')?.close();
});
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('close', () => { promotion = undefined; render(); syncEngine(); });
document.addEventListener('pointerdown', warmAudio, { once: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelMotion(); cancelCoach(); render(); }
  syncEngine();
});
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', event => {
  if (event.matches) { cancelMotion(); cancelCoach(); render(); syncEngine(); }
});
window.addEventListener('hashchange', () => {
  cancelEngine(); cancelMotion(); cancelCoach();
  const state = fromHash(location.hash);
  if (!state) { tell('invalid-game-link-current'); syncEngine(); return; }
  game = state.game; danger = restoredDanger(); refreshPositionHints();
  keyboardSquare = game.humanColor === 'w' ? 'e2' : 'e7';
  selected = undefined; board.selectSquare(null);
  tell(positionMessage()); syncEngine();
});
let keyboardSquare: Square = game.humanColor === 'w' ? 'e2' : 'e7';
$('#board').addEventListener('keydown', event => {
  if (motion) return;
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Escape'].includes(event.key)) return;
  event.preventDefault(); warmAudio();
  if (event.key === 'Escape') { selected = undefined; board.selectSquare(null); renderHints(); return; }
  if (event.key === 'Enter' || event.key === ' ') {
    if (selected && game.destinations().get(selected)?.includes(keyboardSquare)) humanMove(selected, keyboardSquare);
    else board.selectSquare(keyboardSquare);
    return;
  }
  const direction = game.humanColor === 'w' ? 1 : -1;
  const file = Math.max(0, Math.min(7, keyboardSquare.charCodeAt(0) - 97 + direction * (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0)));
  const rank = Math.max(1, Math.min(8, Number(keyboardSquare[1]) + direction * (event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0)));
  keyboardSquare = `${String.fromCharCode(97 + file)}${rank}` as Square;
  const piece = game.chess.get(keyboardSquare);
  $('#keyboard-status').textContent = `${keyboardSquare}: ${piece ? `${piece.color === game.humanColor ? 'your' : 'AI’s'} ${names[piece.type]}` : 'empty square'}. Press Enter to choose.`;
  board.set({ highlight: { custom: new Map([[keyboardSquare, 'keyboard-focus']]) } });
});
danger = restoredDanger();
refreshPositionHints();
message = positionMessage(message);
if (!location.hash) persist();
applyAppearance(); render(); syncEngine();
let boardWidth = 0;
new ResizeObserver(() => {
  const width = $('#board').clientWidth;
  if (width === boardWidth) return;
  boardWidth = width;
  requestAnimationFrame(() => {
    $('.board-layout').style.setProperty('--board-size', `${width}px`);
    board.redrawAll();
  });
}).observe($('#board'));
