import { afterEach, describe, expect, it } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { prepareDeployment, projectRoot, readDeployment, validateDeployment, type Deployment } from '../../scripts/cloudflare-config.ts';

const settings: Deployment = {
  accountId: 'a'.repeat(32), workerName: 'test-api', zoneName: 'gallery.test',
  pagesProject: 'test-pages', pagesBranch: 'main', appOrigin: 'https://gallery.test',
  photoOrigin: 'https://photos.gallery.test', accessIssuer: 'https://test-team.cloudflareaccess.com',
  privateBucket: 'test-private', publicBucket: 'test-public',
  devLoginOrigins: ['http://localhost:5180', 'https://preview.internal.test'],
};
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'cloud-config-')); roots.push(root);
  mkdirSync(path.join(root, 'cloudflare'));
  for (const name of ['wrangler.jsonc', 'deployment.example.json', 'private-cors.json', 'public-cors.json', 'devOrigins.ts']) {
    cpSync(path.join(projectRoot, 'cloudflare', name), path.join(root, 'cloudflare', name));
  }
  cpSync(path.join(projectRoot, 'wrangler.pages.jsonc'), path.join(root, 'wrangler.pages.jsonc'));
  return root;
}

describe('private Cloudflare deployment configuration', () => {
  it('requires private settings and does not fall back to the example', () => {
    const root = fixture();
    expect(() => readDeployment(root, {})).toThrow('Production settings are missing');
    expect(() => validateDeployment(JSON.parse(readFileSync(path.join(root, 'cloudflare/deployment.example.json'), 'utf8')))).toThrow();
  });

  it('reads local settings and lets explicit CI settings take precedence', () => {
    const root = fixture();
    writeFileSync(path.join(root, 'cloudflare/deployment.local.json'), JSON.stringify(settings));
    expect(readDeployment(root, {})).toEqual(settings);
    expect(readDeployment(root, { CLOUDFLARE_DEPLOYMENT_CONFIG: JSON.stringify({ ...settings, workerName: 'ci-api' }) }).workerName).toBe('ci-api');
    expect(() => readDeployment(root, { CLOUDFLARE_DEPLOYMENT_CONFIG: '' })).toThrow('valid JSON');
  });

  it('preserves production targets, binding names, origins, security flags and Pages branch independently', () => {
    const root = fixture();
    const files = prepareDeployment(settings, root);
    const worker = JSON.parse(readFileSync(files.worker, 'utf8'));
    const pages = JSON.parse(readFileSync(files.pages, 'utf8'));
    expect(worker).toMatchObject({ name: 'test-api', account_id: settings.accountId,
      main: path.join(root, 'cloudflare/worker.ts'), workers_dev: false, preview_urls: false,
      routes: [{ pattern: 'gallery.test/api/*', zone_name: 'gallery.test' }],
      r2_buckets: [{ binding: 'PRIVATE_BUCKET', bucket_name: 'test-private' }, { binding: 'PUBLIC_BUCKET', bucket_name: 'test-public' }],
      vars: { APP_ORIGIN: settings.appOrigin, PHOTO_ORIGIN: settings.photoOrigin, ACCESS_ISSUER: settings.accessIssuer,
        R2_ACCOUNT_ID: settings.accountId, PRIVATE_BUCKET_NAME: settings.privateBucket, DEV_LOGIN_ORIGINS: settings.devLoginOrigins.join(',') },
    });
    for (const key of ['OWNER_EMAIL', 'ACCESS_AUDIENCE', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) expect(worker.vars).not.toHaveProperty(key);
    expect(pages).toMatchObject({ name: 'test-pages', pages_build_output_dir: path.join(root, 'dist') });
    for (const kind of ['private', 'public']) {
      const cors = JSON.parse(readFileSync(path.join(root, `.cache/cloudflare-deploy/${kind}-cors.json`), 'utf8'));
      expect(cors.rules[0].allowed.origins).toEqual([settings.appOrigin]);
    }
    expect(JSON.parse(readFileSync(path.join(root, 'cloudflare/wrangler.jsonc'), 'utf8'))).not.toHaveProperty('account_id');
  });

  it.each([
    { privateBucket: settings.publicBucket }, { appOrigin: 'http://gallery.test' },
    { appOrigin: 'https://user:password@gallery.test' }, { zoneName: 'unrelated.test' },
    { devLoginOrigins: ['http://preview.internal.test'] }, { accessIssuer: 'https://attacker.test' },
    { devLoginOrigins: ['https://attacker.test:*'] }, { devLoginOrigins: ['http://macbook.evil.test:*'] },
    { R2_SECRET_ACCESS_KEY: 'must-not-enter-config' },
  ])('rejects unsafe deployment settings: %j', change => {
    expect(() => validateDeployment({ ...settings, ...change })).toThrow();
  });

  it('rejects invalid input without echoing its contents', () => {
    const root = fixture();
    expect(() => readDeployment(root, { CLOUDFLARE_DEPLOYMENT_CONFIG: 'private-sentinel' })).toThrow('Values have not been printed');
    const result = spawnSync(process.execPath, ['scripts/cloudflare-deploy.ts', 'worker'], {
      cwd: projectRoot, encoding: 'utf8', env: { ...process.env, CLOUDFLARE_DEPLOYMENT_CONFIG: 'private-sentinel' },
    });
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).not.toContain('private-sentinel');
    expect(result.stdout).not.toContain('wrangler');
  });

  it('invokes Pages with a discoverable configuration and the pushed commit', () => {
    const root = realpathSync(fixture());
    mkdirSync(path.join(root, 'scripts'));
    for (const name of ['cloudflare-config.ts', 'cloudflare-deploy.ts']) {
      cpSync(path.join(projectRoot, 'scripts', name), path.join(root, 'scripts', name));
    }
    const cli = path.join(root, 'node_modules/wrangler/bin');
    mkdirSync(cli, { recursive: true });
    writeFileSync(path.join(cli, 'wrangler.js'), `
      const fs = require('node:fs');
      if (process.argv.includes('--config')) throw new Error('Pages rejects --config');
      const config = JSON.parse(fs.readFileSync('wrangler.jsonc', 'utf8'));
      console.log(JSON.stringify({ config, args: process.argv.slice(2) }));
    `);
    const result = spawnSync(process.execPath, ['scripts/cloudflare-deploy.ts', 'pages'], {
      cwd: root, encoding: 'utf8', env: { ...process.env,
        CLOUDFLARE_DEPLOYMENT_CONFIG: JSON.stringify(settings), GITHUB_SHA: 'a'.repeat(40) },
    });
    expect(result.status, result.stderr).toBe(0);
    const invocation = JSON.parse(result.stdout);
    expect(invocation.config).toMatchObject({ name: settings.pagesProject, pages_build_output_dir: path.join(root, 'dist') });
    expect(invocation.args).toEqual(['pages', 'deploy', path.join(root, 'dist'),
      '--project-name', settings.pagesProject, '--branch', settings.pagesBranch, '--commit-hash', 'a'.repeat(40)]);
  });
});
