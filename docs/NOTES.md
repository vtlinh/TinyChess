# Little Knight — development notes

A gentle chess tutor for a child’s first games. Big board, no timer, no move list, unlimited takebacks. Everything runs in the browser.

## Run

Use Node 24 LTS (or Node 22.12+).

```sh
npm ci
npm run dev
npm test
npm run build
npm run site # alias used by CI
npm run test:browser
```

Install browser test binaries once with `npx playwright install chromium firefox webkit`.

Linux CI starts PulseAudio with a virtual output device so Firefox can exercise real audio playback. The engine fallback deadline is checked with [Playwright's controlled clock](https://playwright.dev/docs/clock), separately from animation and real-worker integration tests; shared-runner wall time is not a reliable performance assertion. Layout checks wait for Chessground's asynchronous redraw after reload.

## What’s included

- Chessground board, chess.js legal moves, tap or drag, and a keyboard board (arrows to explore; Enter to select a piece or destination).
- Dark Talbot-inspired UI, with Wood and Classic pieces as the defaults. File letters and rank numbers sit outside the playing squares. Saved appearance choices are preserved.
- Legal-move arrows by default, with separate L-shaped knight paths that do not share stems; optional dots.
- Moves travel along a visible path over 800ms, one at a time; knights follow two squares then one. The AI thinks during the human animation and coaching audio, then starts its move only after both finish. Captures land before the victim disappears, castling animates both pieces, and promotion travels as a pawn. Settings, resets, and tab hiding cancel animation safely; reduced-motion preferences skip it.
- Start Over offers White, Black, or Random (default). New visits also choose a random side. The child’s pieces are always at the bottom; AI opens when the child is Black. No clocks, move lists, sign-in, or server. Only Start Over and Take Back below the board.
- Unlimited takebacks remove the child’s last move and AI’s reply, including while AI is thinking or speaking. The AI move walks backward first, then the child’s move, at 400ms each; taking back before the reply reverses only the child’s move. When playing Black, takebacks preserve the AI’s opening move. Cancelling Start Over preserves the current game.
- Talbot-style captured-piece mat on the right, paired by piece type and using the selected artwork. A left-side evaluation bar estimates material and piece placement from White’s perspective (not a deep tactical evaluation). Captures and evaluation follow takebacks, resets, and URL restores.
- Twelve open-source Lichess piece sets and 27 boards (including Lichess textures), three synthesized sound styles, and mute. Howler handles audio playback. Web Awesome (MIT) supplies accessible segmented pill controls for move hints, Blunder Buddy, sound, and rules.
- Blunder checks default on. Legal capture/recapture checks warn about immediate material loss, including pieces exposed by moving another piece. Fair trades and compensated captures are excluded. Play continues; Take Back bounces only with Blunder Buddy on and a detected blunder (animation respects reduced-motion preferences). AI-side messages announce blunders, praise safe moves, warn about uncompensated AI attacks, and suggest free captures through text and speech only, without revealing the capturing piece. Legal-move hints still appear when the child selects a piece. A free capture means no immediate legal recapture; the most valuable available piece is suggested. Turning Blunder Buddy off suppresses warnings and capture hints. This is a simple material safety check, not a full tactical coach; longer combinations and sacrifices may need a parent’s guidance.
- Blunder warnings take priority over other messages and speech, including free-capture tips. Attack alerts name both pieces (for example, “My queen can take your bishop for free”); “for free” is included only when there is no immediate legal recapture.
- Blunder Buddy uses 63 checked-in coaching clips generated with Kokoro’s soothing `af_heart` voice; there is no separate Voice setting or runtime voice service. Complete phrases and every reachable piece-warning combination are packed into one 32 kbps MP3 audio sprite (about 0.5 MB). The typed catalog in `src/voices.ts` gives every phrase an ID, its display text, audio file, and sprite position; game code refers only to those IDs. Turning Buddy off also silences spoken announcements, independently of move sounds. Click the AI message to repeat it (or focus it and press Enter/Space). Replay restarts the current message without stacking speech. Queued announcements keep an AI reply from interrupting praise or a warning. Text remains available if audio cannot load. Browser audio policies require a gesture before playback; restoring a link does not auto-speak.
- Castling and en passant default off, for both sides. These are filtered consistently from human moves, engine search, threat checks, URL replay, and terminal-state checks. Changing these settings starts a new game; appearance/strength changes preserve the game.
- A small GPL JavaScript opponent built on chess.js, with random mistakes and bounded iterative alpha-beta search. The CPU Elo slider spans 100–3000 in steps of 100; its values are difficulty targets, not calibrated ratings (this engine is not a measured 3000-Elo opponent). Higher values reduce random mistakes and increase search effort, up to five plies when the time budget allows. Default 100 mostly chooses random legal moves.
- A Web Worker prepares replies to possible human moves in the background. Actual searches have a 120ms budget; a main-thread legal fallback is scheduled at 650ms. This targets replies within one second on an active tab; suspended tabs, long browser tasks, or very slow hardware can delay JavaScript timers. Games pause when hidden or a dialog is open.
- Versioned base64url fragments use Talbot’s legal-move-index idea: about one byte per ply, plus rule and human-color flags (legacy pending-warning flags remain readable). URL replay validates every move. Copy the address to share the position, rules, and chosen side; visual settings stay local. Legacy links play as White. Blunders are recomputed from the last human move when restoring a link. Reloading an AI-to-move link resumes AI without rerolling the child’s color. Decode limit: 2,048 plies.

## Why not Maia first?

[Maia’s official frontend](https://github.com/CSSLab/maia-platform-frontend#client-side-chess-engines) demonstrates browser inference through ONNX Runtime Web (with models such as 1100–1900). So Maia in the browser is feasible, though it is not simply a tiny drop-in WASM chess engine. A deliberately weak opponent is a better initial fit here, avoids model downloads, and applies the simplified rules inside every search. The worker protocol isolates the opponent for a later Maia adapter; no Maia model is included in this version.

## GitHub Pages

`.github/workflows/pages.yml` checks types, unit tests, the production build, and browser tests before deploying the repository’s default branch. Pull requests only run checks. Relative asset URLs support both project Pages (`/little-knight/`) and a custom domain.

1. Push this project to a GitHub repository.
2. In Settings → Pages, set Source to **GitHub Actions**.
3. Push to the default branch or run the workflow manually.

Repository: [pathikrit/little-knight](https://github.com/pathikrit/little-knight). The README badge links to its build and deployment workflow.

## Attribution and source

Inspired by [Talbot](https://github.com/pathikrit/talbot). See [the notices](../public/THIRD-PARTY-NOTICES.txt) and [piece provenance](../public/pieces/provenance.json). The production build includes `source.tar.gz` with application source and exact installed runtime dependencies. Piece SVGs, fonts, and coaching recordings are local, and speech loads lazily. No runtime CDNs or external services are required.

To refresh piece assets from a reviewed Lichess commit, run `node scripts/fetch-pieces.mjs <full-commit-sha>`. Assets and upstream license notices are checked in; builds never fetch artwork.
