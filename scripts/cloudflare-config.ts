import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export interface Deployment {
  accountId: string;
  workerName: string;
  zoneName: string;
  pagesProject: string;
  pagesBranch: string;
  appOrigin: string;
  photoOrigin: string;
  accessIssuer: string;
  privateBucket: string;
  publicBucket: string;
  devLoginOrigins: string[];
}

function origin(value: unknown, allowLoopback = false): boolean {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.origin === value && !url.username && !url.password
      && (url.protocol === 'https:' || allowLoopback && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));
  } catch { return false; }
}

export function validateDeployment(value: unknown): Deployment {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Deployment settings must be a JSON object.');
  const d = value as Deployment;
  const fail = (field: string): never => { throw new Error(`Invalid or missing deployment setting: ${field}. See cloudflare/deployment.example.json.`); };
  if (typeof d.accountId !== 'string' || !/^[a-f0-9]{32}$/.test(d.accountId) || /^0+$/.test(d.accountId)) fail('accountId');
  for (const field of ['workerName', 'pagesProject', 'privateBucket', 'publicBucket'] as const) {
    if (typeof d[field] !== 'string' || !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(d[field])) fail(field);
  }
  if (d.privateBucket === d.publicBucket) fail('publicBucket (must differ from privateBucket)');
  if (typeof d.pagesBranch !== 'string' || !/^[\w][\w./-]*$/.test(d.pagesBranch)) fail('pagesBranch');
  if (typeof d.zoneName !== 'string' || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d.zoneName) || d.zoneName === 'example.com') fail('zoneName');
  for (const field of ['appOrigin', 'photoOrigin', 'accessIssuer'] as const) if (!origin(d[field])) fail(field);
  const hostname = new URL(d.appOrigin).hostname;
  if (hostname !== d.zoneName && !hostname.endsWith(`.${d.zoneName}`)) fail('zoneName (must contain appOrigin)');
  if (!new URL(d.accessIssuer).hostname.endsWith('.cloudflareaccess.com') || d.accessIssuer === 'https://your-team.cloudflareaccess.com') fail('accessIssuer');
  if (d.appOrigin === d.photoOrigin) fail('photoOrigin (must differ from appOrigin)');
  if (!Array.isArray(d.devLoginOrigins) || !d.devLoginOrigins.every(value => origin(value, true))) fail('devLoginOrigins');
  const fields = ['accountId', 'workerName', 'zoneName', 'pagesProject', 'pagesBranch', 'appOrigin', 'photoOrigin', 'accessIssuer', 'privateBucket', 'publicBucket', 'devLoginOrigins'];
  if (Object.keys(value).some(key => !fields.includes(key))) throw new Error('Unknown deployment setting. Store credentials in Worker/GitHub secrets, not deployment JSON.');
  return d;
}

export function readDeployment(root = projectRoot, env = process.env): Deployment {
  let source = env.CLOUDFLARE_DEPLOYMENT_CONFIG;
  if (source === undefined) {
    try { source = readFileSync(path.join(root, 'cloudflare/deployment.local.json'), 'utf8'); }
    catch { throw new Error('Production settings are missing. Copy cloudflare/deployment.example.json to cloudflare/deployment.local.json and fill it in, or set CLOUDFLARE_DEPLOYMENT_CONFIG in CI.'); }
  }
  let value: unknown;
  try { value = JSON.parse(source); }
  catch { throw new Error('Deployment settings must be valid JSON. Values have not been printed.'); }
  return validateDeployment(value);
}

/** Write disposable Wrangler/CORS files; never write credentials or change remote services. */
export function prepareDeployment(d: Deployment, root = projectRoot) {
  validateDeployment(d);
  const directory = path.join(root, '.cache/cloudflare-deploy');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const read = (name: string) => JSON.parse(readFileSync(path.join(root, name), 'utf8'));
  const write = (name: string, value: unknown) => {
    const filename = path.join(directory, name);
    writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    return filename;
  };
  const base = read('cloudflare/wrangler.jsonc');
  const worker = write('worker.json', {
    ...base, $schema: path.join(root, 'node_modules/wrangler/config-schema.json'),
    main: path.join(root, 'cloudflare/worker.ts'), name: d.workerName, account_id: d.accountId,
    routes: [{ pattern: `${new URL(d.appOrigin).hostname}/api/*`, zone_name: d.zoneName }],
    r2_buckets: [{ binding: 'PRIVATE_BUCKET', bucket_name: d.privateBucket }, { binding: 'PUBLIC_BUCKET', bucket_name: d.publicBucket }],
    vars: { ...base.vars, APP_ORIGIN: d.appOrigin, PHOTO_ORIGIN: d.photoOrigin, ACCESS_ISSUER: d.accessIssuer,
      R2_ACCOUNT_ID: d.accountId, PRIVATE_BUCKET_NAME: d.privateBucket, DEV_LOGIN_ORIGINS: d.devLoginOrigins.join(',') },
  });
  const pages = write('wrangler.jsonc', { ...read('wrangler.pages.jsonc'),
    $schema: path.join(root, 'node_modules/wrangler/config-schema.json'),
    name: d.pagesProject, pages_build_output_dir: path.join(root, 'dist') });
  for (const name of ['private-cors.json', 'public-cors.json']) {
    const cors = read(`cloudflare/${name}`);
    cors.rules[0].allowed.origins = [d.appOrigin];
    write(name, cors);
  }
  return { worker, pages };
}
