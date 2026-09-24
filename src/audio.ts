import { Howl, Howler } from 'howler';
import type { Settings } from './settings';
import { voices, type VoiceId } from './voices';

// Original synthesized sounds, distributed with the app under GPL-3.0-or-later.
// Howler handles playback, pooling, and mobile audio unlocking.
function tone(style: string): string {
  const rate = 22050, count = Math.floor(rate * .2);
  const bytes = new Uint8Array(44 + count * 2), view = new DataView(bytes.buffer);
  const text = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) {
    const t = i / rate, fade = Math.min(1, t * 700) * Math.exp(-t * (style === 'wood' ? 45 : 23));
    const f = style === 'wood' ? 420 : style === 'bubbles' ? 650 + 2200 * t : 1046;
    const wave = Math.sin(2 * Math.PI * f * t) + .3 * Math.sin(2 * Math.PI * f * 1.5 * t);
    view.setInt16(44 + i * 2, wave * fade * 13000, true);
  }
  return 'data:audio/wav;base64,' + btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
}
const sounds = new Map<string, Howl>();
export function playSound(style: Settings['sound']) {
  if (style === 'off') return;
  try {
    let sound = sounds.get(style);
    if (!sound) { sound = new Howl({ src: [tone(style)], format: ['wav'], volume: .4 }); sounds.set(style, sound); }
    sound.play();
  } catch { /* Sound is optional. */ }
}

let voice: Howl | undefined;
let speechId = 0;
let speechQueue = Promise.resolve();
let finishSpeech: (() => void) | undefined;
const voiceAsset = (path: string) => new URL(path, new URL(import.meta.env.BASE_URL, document.baseURI)).href;

export function warmAudio() {
  try { void Howler.ctx?.resume(); } catch { /* Optional audio. */ }
  if (voice) return;
  const first = Object.values(voices)[0].audio;
  const sprite: Record<string, [number, number]> = Object.fromEntries(Object.entries(voices).map(([id, line]) =>
    [id, [line.audio.start, line.audio.duration] as [number, number]]));
  voice = new Howl({ src: [voiceAsset(first.file)], format: ['mp3'], sprite, volume: .85, preload: true });
}
export function stopSpeech() {
  speechId++; voice?.stop();
  finishSpeech?.(); finishSpeech = undefined; speechQueue = Promise.resolve();
}
export function speak(message: VoiceId | readonly VoiceId[], queue = false) {
  if (!queue) stopSpeech();
  const id = speechId;
  const lines = typeof message === 'string' ? [message] : message;
  speechQueue = speechQueue.then(async () => {
    for (const line of lines) await say(line, id);
  });
  return speechQueue;
}
async function say(line: VoiceId, id: number) {
  if (id !== speechId) return;
  warmAudio();
  if (id !== speechId || !voice) return;
  try {
    await new Promise<void>(resolve => {
      const finish = () => { if (finishSpeech === finish) finishSpeech = undefined; resolve(); };
      finishSpeech = finish;
      const soundId = voice!.play(line);
      voice!.once('end', finish, soundId);
      voice!.once('loaderror', finish, soundId);
      voice!.once('playerror', finish, soundId);
    });
  } catch { /* Text hints remain available if speech fails. */ }
}
