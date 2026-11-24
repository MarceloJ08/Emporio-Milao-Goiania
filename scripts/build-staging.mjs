import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const stagingOrigin = process.env.STAGING_ORIGIN;
const supabaseUrl = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const expectedSupabaseUrl = 'https://uzldbiahraeqnhzxqfoz.supabase.co';

if (!stagingOrigin || !supabaseUrl || !publishableKey) {
  throw new Error('Staging build requires STAGING_ORIGIN, SUPABASE_URL, and SUPABASE_PUBLISHABLE_KEY.');
}
let origin;
try {
  origin = new URL(stagingOrigin);
} catch {
  throw new Error('STAGING_ORIGIN must be a valid HTTPS origin.');
}
if (origin.protocol !== 'https:' || origin.origin !== stagingOrigin || origin.pathname !== '/') {
  throw new Error('STAGING_ORIGIN must be the exact HTTPS origin without a path.');
}
if (supabaseUrl !== expectedSupabaseUrl || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) {
  throw new Error('Staging build rejected: Supabase must be the approved staging project and use its publishable key.');
}

const root = process.cwd();
const output = resolve(root, 'dist');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(resolve(root, 'index.html'), resolve(output, 'index.html'));
await cp(resolve(root, 'privacidade-cadastro.html'), resolve(output, 'privacidade-cadastro.html'));
await cp(resolve(root, 'src'), resolve(output, 'src'), { recursive: true });

const appPath = resolve(output, 'src/js/app.js');
const appSource = await readFile(appPath, 'utf8');
const stagingAppSource = appSource.replace(
  /const productionAuthProject = \[[^\r\n]+\];/,
  'const productionAuthProject = [null, null];',
);
if (stagingAppSource === appSource) throw new Error('Staging build could not remove production auth settings.');
await writeFile(appPath, stagingAppSource, 'utf8');

const stagingConfig = `// Generated only by the isolated Vercel staging build.\nexport const stagingBuild = true;\nexport const tokenHashStaging = Object.freeze({ origin: ${JSON.stringify(origin.origin)}, supabaseUrl: ${JSON.stringify(supabaseUrl)}, publishableKey: ${JSON.stringify(publishableKey)} });\n`;
await writeFile(resolve(output, 'src/js/auth-staging.mjs'), stagingConfig, { flag: 'w' });

const builtConfig = await readFile(resolve(output, 'src/js/auth-staging.mjs'), 'utf8');
const builtApp = await readFile(appPath, 'utf8');
if (!builtConfig.includes('stagingBuild = true') || !builtConfig.includes(expectedSupabaseUrl)
  || /https:\/\/[a-z0-9]+\.supabase\.co/.test(builtApp)) {
  throw new Error('Staging output verification failed.');
}
