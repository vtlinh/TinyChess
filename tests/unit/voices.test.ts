import { statSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { attackVoice, voices, voiceText } from '../../src/voices';

describe('typed coaching voice catalog', () => {
  test('keeps every resolvable phrase and sprite pointer in one compact typed catalog', () => {
    const lines = Object.values(voices);
    expect(lines).toHaveLength(63);
    expect(new Set(lines.map(line => line.phrase)).size).toBe(lines.length);
    expect(new Set(lines.map(line => line.audio.file))).toEqual(new Set(['voices/coach.mp3']));
    expect(statSync('public/voices/coach.mp3').size).toBeLessThan(550 * 1024);
    expect(voiceText(['good-move'])).toBe('Good move!');
    expect(voiceText(['attack-queen-bishop-free', 'capture-rook-free']))
      .toBe('My queen can take your bishop for free. I think you can capture this rook for free.');
    expect(attackVoice('pawn', 'rook', false)).toBe('attack-pawn-rook');
    expect(() => attackVoice('queen', 'pawn', false)).toThrow('Missing voice');
  });
});
