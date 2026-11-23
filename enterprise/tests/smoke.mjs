import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const required = [
  'index.html',
  'src/js/app.js',
  'src/css/styles.css',
  'src/css/premium.css',
  'src/css/brand-refresh.css',
  'vercel.json',
  'enterprise/ARCHITECTURE.md',
  'enterprise/SECURITY.md',
  'enterprise/TESTING.md',
  'supabase/migrations/20261123193000_online_sales_assistant_access_and_locations.sql',
  'supabase/migrations/20261123222630_add_assistant_attributed_sales_rpc.sql'
];
for (const file of required) {
  if (!existsSync(file)) throw new Error('Missing required file: ' + file);
}

for (const file of ['src/js/app.js', 'enterprise/tests/smoke.mjs']) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(check.stderr || ('Syntax check failed: ' + file));
}

const app = readFileSync('src/js/app.js', 'utf8');
for (const token of [
  'saleAssistant', 'Gabriela', 'Tawane', 'Victoria',
  'create_assisted_sale_for_assistant', 'seller_name',
  'sales-workspace-summary', 'Confirmar venda e lançar no ADM',
  'admin-orders-live', 'admin_finance_summary',
  'store_locations(name)', 'order_items(product_name,quantity,unit_price'
]) {
  if (!app.includes(token)) throw new Error('Online sales/ADM integration missing: ' + token);
}

for (const token of [
  '<select id="pCategory" required>', '<select id="pCountry">',
  'value="Espumantes"', 'value="Sucos"', 'value="Vinho do Porto"',
  'value="Vinhos Brancos"', 'value="Vinhos Tintos"',
  'value="Argentina"', 'value="Brasil"', 'value="Chile"',
  'value="Coreia do Sul"', 'value="França"', 'value="Itália"', 'value="Portugal"'
]) {
  if (!app.includes(token)) throw new Error('Catalog dropdown option missing: ' + token);
}

const accessMigration = readFileSync('supabase/migrations/20261123193000_online_sales_assistant_access_and_locations.sql', 'utf8');
for (const token of ['33marcelogof@gmail.com', 'private.sales_staff', 'Celina Park', 'Galpão']) {
  if (!accessMigration.toLowerCase().includes(token.toLowerCase())) {
    throw new Error('Assistant access/location migration missing: ' + token);
  }
}

const rpcMigration = readFileSync('supabase/migrations/20261123222630_add_assistant_attributed_sales_rpc.sql', 'utf8');
for (const token of [
  'private.create_assisted_sale_for_assistant', 'public.create_assisted_sale_for_assistant',
  "('Gabriela', 'Tawane', 'Victoria')", 'private.is_sales_staff()',
  'seller_name = v_assistant', 'security invoker', 'to authenticated'
]) {
  if (!rpcMigration.toLowerCase().includes(token.toLowerCase())) {
    throw new Error('Secure assistant sales RPC migration missing: ' + token);
  }
}

const css = readFileSync('src/css/premium.css', 'utf8');
for (const token of ['.sales-mode #assistedSaleForm', 'sales-workspace-summary']) {
  if (!css.includes(token)) throw new Error('Sales workspace styling missing: ' + token);
}

const html = readFileSync('index.html', 'utf8');
if (!html.includes('<html lang="pt-BR">')) throw new Error('HTML language metadata missing');
if (!html.includes('/src/css/styles.css') || !html.includes('/src/css/brand-refresh.css') || !html.includes('/src/js/app.js')) {
  throw new Error('Expected frontend assets not referenced');
}

const headers = JSON.parse(readFileSync('vercel.json', 'utf8'));
const allHeaders = headers.headers?.flatMap(h => h.headers || []) || [];
for (const key of ['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Permissions-Policy']) {
  if (!allHeaders.some(h => h.key === key)) throw new Error('Missing security header: ' + key);
}

const brand = readFileSync('src/css/brand-refresh.css', 'utf8');
for (const token of ['--forest:#4b2029', '--gold:#c7a15a', '.hero']) {
  if (!brand.includes(token)) throw new Error('Brand refresh palette missing: ' + token);
}


const productForm = readFileSync('src/js/app.js', 'utf8');
for (const token of ['product-image-editor', 'pImagePreview', 'pDiscount', 'refreshProductDiscount', '<s>']) {
  if (!productForm.includes(token)) throw new Error('Product entry panel enhancement missing: ' + token);
}
if (!existsSync('assets/logo-emporio-milao.jpg')) throw new Error('Original Emporio Milao logo asset missing');
if (!html.includes('/assets/logo-emporio-milao.jpg')) throw new Error('Original logo not referenced by site header');

console.log('Smoke checks passed: structure, JS syntax, assistant UI, RPC/ADM wiring, catalog dropdowns, brand palette and security headers.');
