import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';

function git(...args: string[]) {
  try { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return ''; }
}
const commit = process.env.GITHUB_SHA || git('rev-parse', 'HEAD');
const origin = git('remote', 'get-url', 'origin');
const repository = process.env.GITHUB_REPOSITORY || origin.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/)?.[1];
const commitUrl = repository && /^[\w.-]+\/[\w.-]+$/.test(repository) && /^[a-f0-9]{40}$/.test(commit)
  ? `https://github.com/${repository}/commit/${commit}` : '';

export default defineConfig({ base: './',
  define: { __COMMIT__: JSON.stringify(commit), __COMMIT_URL__: JSON.stringify(commitUrl) },
});
