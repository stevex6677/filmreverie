import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { prepareDeployment, projectRoot, readDeployment } from './cloudflare-config.ts';

async function main() {
  const command = process.argv[2];
  if (!['configure', 'check', 'worker', 'pages', 'verify'].includes(command)) throw new Error('Expected configure, check, worker, pages or verify.');
  const settings = readDeployment();
  if (command === 'verify') {
    const website = await fetch(settings.appOrigin, { signal: AbortSignal.timeout(30000) });
    if (!website.ok || !website.headers.get('content-type')?.includes('text/html')) throw new Error('Production website check failed.');
    const response = await fetch(`${settings.appOrigin}/api/gallery`, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('Public gallery endpoint check failed.');
    const catalog = await response.json();
    if (catalog.version !== 1 || !Array.isArray(catalog.rolls)) throw new Error('Unexpected public gallery response.');
    console.log('Production website and public gallery API are available. No rolls were changed.');
    return;
  }
  const config = prepareDeployment(settings);
  if (command === 'configure') {
    console.log('Private Worker, Pages and CORS configurations prepared under .cache/cloudflare-deploy/.');
    return;
  }
  const args = command === 'pages'
    ? ['pages', 'deploy', path.join(projectRoot, 'dist'), '--config', config.pages,
      '--project-name', settings.pagesProject, '--branch', settings.pagesBranch,
      ...(process.env.GITHUB_SHA ? ['--commit-hash', process.env.GITHUB_SHA] : [])]
    : ['deploy', '--config', config.worker,
      ...(command === 'check' ? ['--dry-run', '--outdir', path.join(projectRoot, '.cache/cloud-worker-production')] : [])];
  const result = spawnSync(process.execPath, [path.join(projectRoot, 'node_modules/wrangler/bin/wrangler.js'), ...args], {
    cwd: projectRoot, stdio: 'inherit',
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: settings.accountId, WRANGLER_SEND_METRICS: 'false',
      WRANGLER_LOG_PATH: path.join(projectRoot, '.cache/wrangler-logs') },
  });
  if (result.error) throw new Error('Could not start Wrangler. Run npm ci with Node 24 or newer.');
  process.exitCode = result.status ?? 1;
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
