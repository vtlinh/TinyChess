import { expect, test, type Page } from '@playwright/test';
import { Game } from '../../src/game';
import { fromHash, gameHash } from '../../src/share';

async function square(page: Page, key: string) {
  const board = page.locator('#board');
  await expect(board).toHaveAttribute('data-animating', 'false');
  const box = (await board.boundingBox())!;
  const flipped = state(page)?.game.humanColor === 'b';
  const file = key.charCodeAt(0) - 97, rank = 8 - Number(key[1]);
  await board.click({ position: {
    x: ((flipped ? 7 - file : file) + .5) * box.width / 8,
    y: ((flipped ? 7 - rank : rank) + .5) * box.height / 8,
  } });
}
const state = (page: Page) => fromHash(new URL(page.url()).hash);
async function settings(page: Page) { await page.getByRole('button', { name: 'Settings', exact: true }).click(); }
async function trackSpeech(page: Page) {
  await page.addInitScript(() => {
    const audioWindow = window as typeof window & { speechDurations: number[] };
    audioWindow.speechDurations = [];
    const original = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      audioWindow.speechDurations.push(this.buffer?.duration ?? 0);
      return original.apply(this, args);
    };
  });
}

test('Start Over as Black flips the board, AI opens, and takebacks preserve its opening', { tag: '@cross-browser' }, async ({ page }) => {
  await page.goto('/' + gameHash(new Game()));
  await page.getByRole('button', { name: 'Start Over', exact: true }).click();
  await page.getByRole('radio', { name: 'Black', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => state(page)?.game.indices.length).toBe(1);
  expect(state(page)?.game.humanColor).toBe('b');
  await expect(page.locator('#board')).toHaveClass(/orientation-black/);
  await expect(page.locator('#board')).toHaveAttribute('aria-label', /You play black/);
  await expect(page.locator('#undo')).toBeDisabled();
  await expect(page.locator('#eval-bar')).toHaveClass(/flipped/);
  const opening = new URL(page.url()).hash;
  await square(page, 'g8');
  await expect(page.locator('#move-arrows > path[data-to="h6"]')).toHaveAttribute('d', 'M132 722 L132 550 L70 550');
  await square(page, 'f6');
  await expect.poll(() => state(page)?.game.indices.length).toBe(3);
  await page.getByRole('button', { name: 'Take Back' }).click();
  await expect.poll(() => new URL(page.url()).hash).toBe(opening);
  await page.reload();
  await expect(page.locator('#board')).toHaveClass(/orientation-black/);
  await expect(page.locator('#undo')).toBeDisabled();
  // Chessground redraws coordinates after ResizeObserver; reload may precede that frame.
  await expect.poll(async () => {
    const firstFile = await page.locator('coords.files coord').first().boundingBox();
    const lastFile = await page.locator('coords.files coord').last().boundingBox();
    return !!firstFile && !!lastFile && firstFile.x > lastFile.x;
  }).toBe(true);
  await page.getByRole('button', { name: 'Start Over', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Random', exact: true })).toBeChecked();
  await page.screenshot({ path: `test-results/start-over-${test.info().project.name}.png`, fullPage: true });
});

for (const [random, color] of [[.1, 'w'], [.9, 'b']] as const) {
  test(`Random starts as ${color} and keeps the resolved color on reload`, async ({ page }) => {
    await page.addInitScript(value => { Math.random = () => value; }, random);
    await page.goto('/');
    await expect.poll(() => state(page)?.game.humanColor).toBe(color);
    await page.getByRole('button', { name: 'Start Over', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Random', exact: true })).toBeChecked();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => state(page)?.game.humanColor).toBe(color);
    await expect.poll(() => state(page)?.game.indices.length).toBe(color === 'w' ? 0 : 1);
    const hash = new URL(page.url()).hash;
    await page.reload();
    expect(state(page)?.game.humanColor).toBe(color);
    expect(new URL(page.url()).hash).toBe(hash);
  });
}

test('Black keyboard movement and dots follow the flipped board', async ({ page }) => {
  const game = new Game(undefined, 'b'); game.play('e2e4');
  await page.goto('/' + gameHash(game));
  const board = page.locator('#board');
  await board.focus(); await board.press('Enter');
  await expect(page.locator('#move-arrows > path[data-to="e5"]')).toHaveAttribute('d', 'M350 650 L350 470');
  await board.press('ArrowUp'); await board.press('ArrowUp'); await board.press('Enter');
  await expect.poll(() => state(page)?.game.indices.length).toBe(3);
  expect(state(page)?.game.moves[1].to).toBe('e5');
  await settings(page);
  await page.getByText('Dots', { exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await square(page, 'g8');
  await expect(page.locator('square.move-dest')).not.toHaveCount(0);
  await expect(page.locator('#move-arrows > path')).toHaveCount(0);
});

test('Black can choose a promotion with black artwork', async ({ page }) => {
  const game = new Game(undefined, 'b');
  for (const move of ['h2h4', 'a7a5', 'h4h5', 'a5a4', 'h5h6', 'a4a3', 'h6g7', 'a3b2', 'g7h8q']) game.play(move);
  await page.goto('/' + gameHash(game));
  await expect(page.locator('cg-board piece.anim')).toHaveCount(0);
  await square(page, 'b2'); await square(page, 'a1');
  const option = page.getByRole('button', { name: 'Promote to knight' });
  await expect(option.locator('img')).toHaveAttribute('src', /\/bN.svg$/);
  await option.click();
  await expect.poll(() => state(page)?.game.moves[9]?.promotion).toBe('n');
});

test('Black gets blunder warnings, bouncing takebacks, and AI attack hints', async ({ page }) => {
  const game = new Game(undefined, 'b');
  for (const move of ['e2e4', 'e7e5', 'b1c3', 'd8h4', 'g1f3']) game.play(move);
  await page.goto('/' + gameHash(game));
  await expect(page.locator('cg-board piece.anim')).toHaveCount(0);
  await square(page, 'h4'); await square(page, 'e4');
  await expect(page.locator('#undo')).toHaveClass(/blunder-bounce/);
  await expect.poll(() => state(page)?.game.indices.length).toBe(7);
  await page.reload();
  await expect(page.locator('#undo')).toHaveClass(/blunder-bounce/);
  await page.getByRole('button', { name: 'Take Back' }).click();
  await expect.poll(() => state(page)?.game.indices.length).toBe(5);
  await expect(page.locator('#undo')).not.toHaveClass(/blunder-bounce/);
  const threat = new Game(undefined, 'b');
  for (const move of ['e2e4', 'e7e5', 'd2d4', 'b8c6', 'd4d5']) threat.play(move);
  await page.goto('/' + gameHash(threat));
  await expect(page.locator('#coach-message')).toHaveText('My pawn can take your knight.');
  await expect(page.locator('#undo')).not.toHaveClass(/blunder-bounce/);
});

test('initial board is simple, responsive, and shows knight L arrows', { tag: '@cross-browser' }, async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/' + gameHash(new Game()));
  const install = await page.evaluate(async () => {
    const manifestUrl = (document.querySelector('link[rel="manifest"]') as HTMLLinkElement).href;
    const manifest = await fetch(manifestUrl).then(response => response.json());
    const icons = await Promise.all(manifest.icons.map(async (icon: { src: string }) => {
      const image = new Image(); image.src = new URL(icon.src, manifestUrl).href;
      await image.decode(); return [image.naturalWidth, image.naturalHeight];
    }));
    return { manifest, icons,
      apple: (document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement).href,
      capable: (document.querySelector('meta[name="apple-mobile-web-app-capable"]') as HTMLMetaElement).content };
  });
  expect(install.manifest).toMatchObject({ name: 'Little Knight', start_url: '.', display: 'standalone', theme_color: '#252525' });
  expect(install.icons).toEqual([[192, 192], [512, 512]]);
  expect(install.apple).toMatch(/icons\/apple-touch-icon\.png$/);
  expect(install.capable).toBe('yes');
  await expect(page.locator('cg-board piece:not(.ghost)')).toHaveCount(32);
  await expect(page.locator('#turn-badge')).toHaveCount(0);
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(37, 37, 37)');
  await expect(page.locator('cg-board')).toHaveCSS('background-image', /boards\/wood.jpg/);
  await expect.poll(() => page.locator('cg-board').evaluate(async el => {
    // ResizeObserver may replace this element between locating it and reading its style.
    const url = /^url\(["']?(.*?)["']?\)$/.exec(getComputedStyle(el).backgroundImage)?.[1];
    if (!el.isConnected || !url) return 0;
    const texture = new Image();
    texture.src = url;
    await texture.decode().catch(() => {});
    return texture.naturalWidth;
  })).toBe(1024);
  await expect(page.locator('cg-board piece.white.knight').first()).toHaveCSS('background-image', /pieces\/cburnett\/wN.svg/);
  await expect(page.locator('coords.files coord')).toHaveText(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
  await expect(page.locator('coords.ranks coord')).toHaveText(['1', '2', '3', '4', '5', '6', '7', '8']);
  await expect(page.getByRole('button', { name: 'Take Back' })).toBeDisabled();
  await square(page, 'g1');
  await expect(page.locator('#move-arrows > path')).toHaveCount(2);
  await expect(page.locator('.opponent #coach-message')).toHaveText('Your turn');
  expect(await page.locator('#move-arrows > path').first().getAttribute('d')).toMatch(/L.+L/);
  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.viewport);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `test-results/board-${test.info().project.name}.png`, fullPage: true });
});

test('AI replies and takeback removes both moves', async ({ page }) => {
  await page.goto('/' + gameHash(new Game()));
  await square(page, 'e2');
  await square(page, 'e4');
  await expect.poll(() => state(page)?.game.indices.length).toBe(2);
  await expect(page.locator('#coach-message')).toHaveText(/^(Good move!|My (pawn|knight) can take your pawn for free\.|I think you can capture this pawn for free\.)/);
  await expect(page.locator('#undo')).not.toHaveClass(/blunder-bounce/);
  await page.getByRole('button', { name: 'Take Back' }).click();
  await expect.poll(() => state(page)?.game.indices.length).toBe(0);
  await expect(page.getByRole('button', { name: 'Take Back' })).toBeDisabled();
});

test('knight left and right moves have separate L paths, including a third horizontal route', async ({ page }) => {
  const game = new Game();
  for (const move of ['e2e4', 'e7e5', 'd2d4', 'd7d5']) game.play(move);
  await page.goto('/' + gameHash(game));
  await expect(page.locator('cg-board piece.anim')).toHaveCount(0);
  await square(page, 'b1');
  await expect(page.locator('#move-arrows > path')).toHaveCount(3);
  await expect(page.locator('#arrowhead')).toHaveAttribute('markerUnits', 'userSpaceOnUse');
  await expect(page.locator('#arrowhead')).toHaveAttribute('refX', '5');
  await expect(page.locator('#arrowhead')).toHaveAttribute('markerWidth', '40');
  await expect(page.locator('#move-arrows > path[data-to="a3"]')).toHaveAttribute('d', 'M132 722 L132 550 L70 550');
  await expect(page.locator('#move-arrows > path[data-to="c3"]')).toHaveAttribute('d', 'M168 722 L168 550 L230 550');
  await expect(page.locator('#move-arrows > path[data-to="d2"]')).toHaveAttribute('d', 'M178 732 L350 732 L350 670');
  await page.screenshot({ path: `test-results/knight-lanes-${test.info().project.name}.png`, fullPage: true });
});

test('settings persist, dots replace arrows, and appearance does not reset the game', { tag: '@cross-browser' }, async ({ page }) => {
  await page.goto('/' + gameHash(new Game()));
  await square(page, 'e2'); await square(page, 'e4');
  await expect.poll(() => state(page)?.game.indices.length).toBe(2);
  const before = new URL(page.url()).hash;
  await settings(page);
  await page.getByText('Ocean', { exact: true }).click();
  await page.getByText('Storybook', { exact: true }).click();
  await page.getByText('Dots', { exact: true }).click();
  await page.getByRole('slider', { name: 'CPU Elo' }).focus();
  await page.getByRole('slider', { name: 'CPU Elo' }).press('ArrowRight');
  await page.getByRole('slider', { name: 'CPU Elo' }).press('ArrowRight');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  expect(new URL(page.url()).hash).toBe(before);
  await expect(page.locator('html')).toHaveAttribute('data-board', 'ocean');
  await page.reload();
  await square(page, 'g1');
  await expect(page.locator('square.move-dest')).not.toHaveCount(0);
  await expect(page.locator('#move-arrows > path')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-board', 'ocean');
  await expect(page.locator('cg-board piece.white.knight').first()).toHaveCSS('background-image', /pieces\/fantasy\/wN.svg/);
});

test('rule changes start a new game and round trip in the URL', async ({ page }) => {
  await page.goto('/' + gameHash(new Game()));
  await settings(page);
  await page.locator('wa-radio-group[name="castling"]').getByRole('radio', { name: 'On', exact: true }).click();
  await page.locator('wa-radio-group[name="enPassant"]').getByRole('radio', { name: 'On', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  expect(state(page)?.game.rules).toEqual({ castling: true, enPassant: true });
  await page.reload();
  expect(state(page)?.game.rules).toEqual({ castling: true, enPassant: true });
});

test('unsafe move warns above the board and bounces Take Back without pausing', async ({ page }) => {
  await page.route('**/assets/worker-*.js', route => route.fulfill({ contentType: 'text/javascript', body:
    `self.onmessage = ({ data }) => { if (data.type === 'play') self.postMessage({ id: data.id, fen: data.fen, move: 'g8f6' }); };` }));
  const game = new Game();
  for (const move of ['e2e4', 'a7a6']) game.play(move);
  await page.goto('/' + gameHash(game));
  await square(page, 'f1'); await square(page, 'b5');
  await expect(page.locator('#undo')).toHaveClass(/blunder-bounce/);
  await expect(page.locator('.opponent #coach-message')).toHaveText('Careful! I can take your bishop.');
  await expect.poll(() => state(page)?.game.indices.length).toBe(4);
  expect(state(page)?.game.moves.at(-1)).toMatchObject({ from: 'a6', to: 'b5', captured: 'b' });
  expect((await page.locator('#coach').boundingBox())!.y).toBeLessThan((await page.locator('#board').boundingBox())!.y);
  expect(state(page)?.pending).toBe(false);
  await page.getByRole('button', { name: 'Take Back' }).click();
  expect(state(page)?.game.indices.length).toBe(2);
  await expect(page.locator('#undo')).not.toHaveClass(/blunder-bounce/);
  await expect(page.locator('.opponent #coach-message')).toHaveText('Your turn');
});

test('a blunder takes priority over a free-capture tip after AI replies, reload, and re-enabling Buddy', async ({ page }) => {
  await trackSpeech(page);
  await page.route('**/assets/worker-*.js', route => route.fulfill({ contentType: 'text/javascript', body:
    `self.onmessage = ({ data }) => { if (data.type === 'play') self.postMessage({ id: data.id, fen: data.fen, move: 'c6b4' }); };` }));
  const game = new Game();
  for (const move of ['c2c3', 'h7h6', 'g2g4', 'g7g5', 'a2a3', 'f7f6', 'e2e4', 'b8c6', 'a3a4', 'h6h5', 'g1h3', 'd7d5', 'f2f4', 'b7b6']) game.play(move);
  await page.goto('/' + gameHash(game));
  await expect(page.locator('cg-board piece.anim')).toHaveCount(0);
  await square(page, 'd1'); await square(page, 'b3');
  await expect.poll(() => state(page)?.game.indices.length).toBe(16);
  const warning = page.locator('#coach-message');
  await expect(warning).toHaveText('That move exposed your pawn.');
  await expect(page.locator('#undo')).toHaveClass(/blunder-bounce/);
  await expect(page.locator('#move-arrows > path[data-from="b3"][data-to="b4"]')).toHaveCount(0);
  await page.reload();
  await expect(warning).toHaveText('That move exposed your pawn.');
  await page.getByRole('button', { name: 'Repeat message', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { speechDurations: number[] }).speechDurations.some(n => n > 1))).toBe(true);
  await settings(page);
  await page.locator('wa-radio-group[name="blunders"]').getByRole('radio', { name: 'Off', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(warning).toHaveText('Your turn');
  await settings(page);
  await page.locator('wa-radio-group[name="blunders"]').getByRole('radio', { name: 'On', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(warning).toHaveText('That move exposed your pawn.');
});

test('legacy warning links resume AI, retain bounce on reload, and respect mode off', async ({ page }) => {
  const game = new Game();
  for (const move of ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'h5e5']) game.play(move);
  await page.goto('/' + gameHash(game, true));
  await expect.poll(() => state(page)?.game.indices.length).toBe(6);
  await expect(page.locator('#undo')).toHaveClass(/blunder-bounce/);
  const hash = new URL(page.url()).hash;
  await page.reload();
  await expect(page.locator('#undo')).toHaveClass(/blunder-bounce/);
  expect(new URL(page.url()).hash).toBe(hash);
  await settings(page);
  await page.locator('wa-radio-group[name="blunders"]').getByRole('radio', { name: 'Off', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('#undo')).not.toHaveClass(/blunder-bounce/);
  await page.reload();
  await expect(page.locator('#undo')).not.toHaveClass(/blunder-bounce/);
});

test('Start Over defaults to Random, can cancel, and can start as White', async ({ page }) => {
  const game = new Game(); game.play('e2e4'); game.play('e7e5');
  await page.goto('/' + gameHash(game));
  await expect(page.locator('.controls button')).toHaveText(['Start Over', 'Take Back']);
  await page.getByRole('button', { name: 'Start Over', exact: true }).click();
  await expect(page.locator('wa-radio-group[name="side"]').getByRole('radio', { name: 'Random', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(state(page)?.game.indices.length).toBe(2);
  await page.getByRole('button', { name: 'Start Over', exact: true }).click();
  await page.getByRole('radio', { name: 'White', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => state(page)?.game.indices.length).toBe(0);
  expect(state(page)?.game.humanColor).toBe('w');
});

test('malformed URL recovers and the keyboard can play a move', async ({ page }) => {
  await page.goto('/#v1.____');
  await expect(page.locator('#coach-message')).toContainText('could not be opened');
  const board = page.locator('#board');
  await board.focus(); await board.press('Enter');
  await expect(page.locator('#move-arrows > path')).toHaveCount(2);
  await board.press('ArrowUp'); await board.press('ArrowUp'); await board.press('Enter');
  await expect.poll(() => state(page)?.game.indices.length).toBe(2);
});

test('a pawn can promote to a chosen piece', async ({ page }) => {
  const game = new Game();
  for (const move of ['a2a4', 'h7h5', 'a4a5', 'h5h4', 'a5a6', 'h4h3', 'a6b7', 'h3g2']) game.play(move);
  await page.goto('/' + gameHash(game));
  await square(page, 'b7'); await square(page, 'a8');
  await expect(page.locator('#promotion-dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Promote to knight' }).click();
  await expect.poll(() => state(page)?.game.moves[8]?.promotion).toBe('n');
});

test('a failed engine worker produces a legal fallback at 650ms', async ({ page }) => {
  // Test the response deadline independently of animation and shared-runner CPU load.
  await page.addInitScript(() => {
    localStorage.setItem('little-knight-settings', JSON.stringify({ blunders: false }));
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.route('**/assets/worker-*.js', route => route.abort());
  await page.goto('/' + gameHash(new Game()));
  await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'));
  await square(page, 'e2'); await square(page, 'e4');
  await page.clock.runFor(1); // Chessground dispatches the move callback after 1ms.
  expect(state(page)?.game.indices.length).toBe(1);
  await page.clock.runFor(649);
  expect(state(page)?.game.indices.length).toBe(1);
  await page.clock.runFor(1);
  await expect.poll(() => state(page)?.game.indices.length).toBe(2);
});

for (const blunders of [true, false]) test(`Blunder Buddy controls speech, enabled=${blunders}, ignoring the old Voice setting`, async ({ page }) => {
  await trackSpeech(page);
  await page.addInitScript(enabled => {
    localStorage.setItem('little-knight-settings', JSON.stringify({ blunders: enabled, voice: !enabled }));
  }, blunders);
  const game = new Game();
  if (blunders) for (const move of ['e2e4', 'e7e5', 'd1h5', 'b8c6']) game.play(move);
  await page.goto('/' + gameHash(game));
  await square(page, blunders ? 'h5' : 'e2'); await square(page, blunders ? 'e5' : 'e4');
  const heardSpeech = () => page.evaluate(() =>
    (window as typeof window & { speechDurations: number[] }).speechDurations.some(n => n > 1));
  if (blunders) await expect.poll(heardSpeech, { timeout: 15000 }).toBe(true);
  else {
    await expect.poll(() => state(page)?.game.indices.length).toBe(2);
    await expect(page.locator('#coach')).toBeDisabled();
    await page.waitForLoadState('networkidle');
    expect(await heardSpeech()).toBe(false);
    expect(await page.evaluate(() => (window as typeof window & { speechDurations: number[] }).speechDurations.some(n => n > 0 && n < 1))).toBe(true);
  }
});

test('clicking or keyboard-activating the AI message replays speech without changing the game', async ({ page }) => {
  await trackSpeech(page);
  const game = new Game();
  for (const move of ['e2e4', 'd7d5', 'b1c3', 'd5d4']) game.play(move);
  await page.goto('/' + gameHash(game));
  const count = () => page.evaluate(() => (window as typeof window & { speechDurations: number[] }).speechDurations.filter(n => n > 1).length);
  const message = page.getByRole('button', { name: 'Repeat message', exact: true });
  await expect(message).toBeVisible();
  await expect(message).toHaveAttribute('title', 'Repeat message');
  expect(await count()).toBe(0);
  for (const action of ['click', 'Enter', ' '] as const) {
    const before = await count();
    if (action === 'click') await message.click();
    else { await message.focus(); await message.press(action); }
    await expect.poll(count, { timeout: 15000 }).toBe(before + 1);
    expect(new URL(page.url()).hash).toBe(gameHash(game));
  }
  await page.getByRole('button', { name: 'Take Back', exact: true }).click();
  await expect(page.locator('.opponent #coach-message')).toHaveText('Your turn');
});

test('Blunder Buddy suggests a free rook without revealing the capturer, repeats the hint, and respects Off', async ({ page }) => {
  await trackSpeech(page);
  const game = new Game();
  for (const move of ['e2e3', 'a7a6', 'f1c4', 'b7b6', 'b1c3', 'c7c6', 'c3e4', 'd7d6', 'e4g5', 'g7g6', 'g5f7', 'b8d7']) game.play(move);
  await page.goto('/' + gameHash(game));
  await expect(page.locator('#coach-message')).toHaveText('I think you can capture this rook for free.');
  await expect(page.locator('#move-arrows > path')).toHaveCount(0);
  await expect(page.locator('square.selected, square.move-dest')).toHaveCount(0);
  await expect(page.locator('#undo')).not.toHaveClass(/blunder-bounce/);
  await page.getByRole('button', { name: 'Repeat message', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { speechDurations: number[] }).speechDurations.some(n => n > 1))).toBe(true);
  await settings(page);
  await page.locator('wa-radio-group[name="blunders"]').getByRole('radio', { name: 'Off', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('.opponent #coach-message')).toHaveText('Your turn');
  await expect(page.locator('#move-arrows > path')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.opponent #coach-message')).toHaveText('Your turn');
  await settings(page);
  await page.locator('wa-radio-group[name="blunders"]').getByRole('radio', { name: 'On', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('#coach-message')).toHaveText('I think you can capture this rook for free.');
  await expect(page.locator('#move-arrows > path')).toHaveCount(0);
  await square(page, 'f7');
  const legalArrow = page.locator('#move-arrows > path[data-from="f7"][data-to="h8"]');
  await expect(legalArrow).toHaveAttribute('stroke', '#37644f');
  await expect(legalArrow).toHaveAttribute('marker-end', 'url(#arrowhead)');
  await square(page, 'h8');
  await expect.poll(() => state(page)?.game.indices.length).toBe(14);
  await expect(page.locator('#coach-message')).not.toContainText('capture this rook for free');
  await page.getByRole('button', { name: 'Take Back', exact: true }).click();
  await expect(page.locator('#coach-message')).toHaveText('I think you can capture this rook for free.');
  await expect(page.locator('#move-arrows > path')).toHaveCount(0);
});

test('captured pieces align by type, update with undo, and flank the board opposite evaluation', async ({ page }) => {
  const game = new Game();
  for (const move of ['e2e4', 'd7d5', 'e4d5', 'd8d5', 'b1c3', 'd5e5']) game.play(move);
  await page.goto('/' + gameHash(game));
  await expect(page.locator('#white-captures piece.black.pawn')).toHaveCount(1);
  await expect(page.locator('#black-captures piece.white.pawn')).toHaveCount(1);
  const left = (await page.locator('#eval-bar').boundingBox())!;
  const board = (await page.locator('#board').boundingBox())!;
  const right = (await page.locator('.captures').boundingBox())!;
  expect(left.x + left.width).toBeLessThan(board.x);
  expect(right.x).toBeGreaterThan(board.x + board.width);
  const white = (await page.locator('#white-captures piece').boundingBox())!;
  const black = (await page.locator('#black-captures piece').boundingBox())!;
  expect(white.y).toBe(black.y);
  await page.screenshot({ path: `test-results/mat-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Take Back' }).click();
  await page.getByRole('button', { name: 'Take Back' }).click();
  await expect(page.locator('.captures piece')).toHaveCount(0);
  await page.getByRole('button', { name: 'Start Over' }).click();
  await page.getByRole('radio', { name: 'White', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('meter')).toHaveAttribute('aria-valuenow', '50.0');
  await expect(page.locator('#eval-score')).toHaveText('0.0');
});

test('AI attack warning stays above the board without blunder bounce, and mode off hides it', async ({ page }) => {
  const game = new Game();
  for (const move of ['e2e4', 'd7d5', 'b1c3', 'd5d4']) game.play(move);
  await page.goto('/' + gameHash(game));
  await expect(page.locator('.opponent #coach-message')).toHaveText('My pawn can take your knight.');
  const threat = page.locator('#move-arrows > path[data-from="d4"][data-to="c3"]');
  await expect(threat).toHaveAttribute('stroke', '#cc653c');
  await expect(threat).toHaveAttribute('marker-end', 'url(#arrowhead)');
  await expect(page.locator('#undo')).not.toHaveClass(/blunder-bounce/);
  await settings(page);
  await page.locator('wa-radio-group[name="blunders"]').getByRole('radio', { name: 'Off', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('.opponent #coach-message')).toHaveText('Your turn');
  await page.reload();
  await expect(page.locator('.opponent #coach-message')).toHaveText('Your turn');
});

test('settings offer the full catalog and persist pills and the Elo slider', async ({ page }) => {
  await page.goto('/' + gameHash(new Game()));
  await settings(page);
  await expect(page.locator('wa-radio-group[name="voice"]')).toHaveCount(0);
  await expect(page.locator('.boards .choice')).toHaveCount(27);
  await expect(page.locator('.pieces .choice')).toHaveCount(12);
  await page.getByText('Marble', { exact: true }).click();
  await page.getByText('Pixel', { exact: true }).click();
  const blunders = page.locator('wa-radio-group[name="blunders"]');
  await expect(page.locator('wa-radio-group[name="blunders"]')).toHaveAttribute('title', 'Warn on a blunder');
  await blunders.getByRole('radio', { name: 'Off', exact: true }).click();
  const slider = page.getByRole('slider', { name: 'CPU Elo' });
  await expect(slider).toHaveAttribute('min', '100');
  await expect(slider).toHaveAttribute('max', '3000');
  await expect(slider).toHaveAttribute('step', '100');
  await slider.focus(); await slider.press('End');
  await expect(page.locator('#elo-value')).toHaveText('3000');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('cg-board')).toHaveCSS('background-image', /boards\/marble.jpg/);
  await expect(page.locator('cg-board piece.white.knight').first()).toHaveCSS('background-image', /pieces\/pixel\/wN.svg/);
  await page.reload();
  await settings(page);
  await expect(slider).toHaveValue('3000');
  await expect(blunders.getByRole('radio', { name: 'Off', exact: true })).toBeChecked();
  await page.locator('#settings-dialog').evaluate(dialog => { dialog.scrollTop = 0; });
  await page.screenshot({ path: `test-results/settings-${test.info().project.name}.png`, fullPage: true });
});
