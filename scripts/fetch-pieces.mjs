import { mkdir, writeFile } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
const { boards, pieces } = JSON.parse(await readFile(new URL('../src/visuals.json', import.meta.url), 'utf8'));

// Run manually to refresh the checked-in, unmodified upstream SVG assets.
const revision = process.argv[2];
if (!/^[a-f0-9]{40}$/.test(revision ?? '')) throw new Error('Pass a full lichess-org/lila commit SHA.');
const root = `https://raw.githubusercontent.com/lichess-org/lila/${revision}`;
async function download(path, target) {
  const response = await fetch(`${root}/${path}`);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  await writeFile(target, new Uint8Array(await response.arrayBuffer()));
}
await mkdir('public/pieces', { recursive: true });
await download('COPYING.md', 'public/pieces/UPSTREAM-COPYING.md');
for (const set of Object.keys(pieces)) {
  await mkdir(`public/pieces/${set}`, { recursive: true });
  await Promise.all(['w', 'b'].flatMap(color => [...'PNBRQK'].map(piece =>
    download(`public/piece/${set}/${color}${piece}.svg`, `public/pieces/${set}/${color}${piece}.svg`))));
}
await writeFile('public/pieces/provenance.json', JSON.stringify({ repository: 'https://github.com/lichess-org/lila', revision,
  sets: pieces }, null, 2) + '\n');
await mkdir('public/boards', { recursive: true });
for (const { file } of Object.values(boards)) if (file) {
  await download(`public/images/board/${file}`, `public/boards/${file}`);
}
await writeFile('public/boards/provenance.json', JSON.stringify({ repository: 'https://github.com/lichess-org/lila', revision,
  author: 'The lila authors and pirouetti', license: 'AGPL-3.0-or-later',
  files: Object.values(boards).map(board => board.file).filter(Boolean) }, null, 2) + '\n');
