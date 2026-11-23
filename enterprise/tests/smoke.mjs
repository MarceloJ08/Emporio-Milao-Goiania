import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const required = ['index.html','src/js/app.js','src/css/styles.css','src/css/premium.css','vercel.json','enterprise/ARCHITECTURE.md','enterprise/SECURITY.md','enterprise/TESTING.md'];
for (const file of required) {
  if (!existsSync(file)) throw new Error('Missing required file: '+file);
}
const js = spawnSync(process.execPath,['--check','src/js/app.js'],{encoding:'utf8'});
if (js.status !== 0) throw new Error(js.stderr || 'JS syntax check failed');
const html=readFileSync('index.html','utf8');
if (!html.includes('<html lang="pt-BR">')) throw new Error('HTML language metadata missing');
if (!html.includes('/src/css/styles.css') || !html.includes('/src/js/app.js')) throw new Error('Expected frontend assets not referenced');
const headers=JSON.parse(readFileSync('vercel.json','utf8'));
const allHeaders=headers.headers?.flatMap(h=>h.headers||[])||[];
for(const key of ['X-Content-Type-Options','X-Frame-Options','Referrer-Policy','Permissions-Policy']){
 if(!allHeaders.some(h=>h.key===key)) throw new Error('Missing security header: '+key);
}
console.log('Smoke checks passed: structure, JS syntax, HTML references, Vercel security header configuration.');
