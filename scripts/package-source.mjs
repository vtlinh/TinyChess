import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

// Distribute the exact application source alongside the GPL browser bundle.
// Explicit paths also work before the first commit and never include secrets.
const source = 'dist/source';
await mkdir(source, { recursive: true });
for (const path of ['src', 'scripts', 'tests', 'public', 'docs', '.github', 'package.json', 'package-lock.json',
  'index.html', 'tsconfig.json', 'vite.config.ts', 'vitest.config.ts', 'playwright.config.ts', 'README.md', 'LICENSE']) {
  await cp(path, `${source}/${path}`, { recursive: true });
}
const dependencies = JSON.parse(await readFile('package.json', 'utf8')).dependencies;
await mkdir(`${source}/dependencies`, { recursive: true });
for (const name of Object.keys(dependencies)) {
  await cp(`node_modules/${name}`, `${source}/dependencies/${name}`, { recursive: true });
}
execFileSync('tar', ['-czf', 'dist/source.tar.gz', '-C', 'dist', 'source']);
await writeFile('dist/source/index.html', '<!doctype html><title>Little Knight source</title><h1>Little Knight source</h1><p><a href="../source.tar.gz">Download the application and dependency source</a></p><p>Run npm ci, then npm run dev. See README.md and THIRD-PARTY-NOTICES.txt for licenses and instructions.</p>');
console.log('Packaged corresponding source and dependency licenses.');
