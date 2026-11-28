function categoryKey(value) {
  return (value || '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
}

const collections = [
  ['Mercearias', 'snack', 'Produtos de despensa', ['mercearia', 'mercearias', 'azeite', 'azeites', 'conservas', 'massas', 'molhos', 'petiscos', 'doces', 'chocolates', 'biscoitos']],
  ['Bebidas não alcoólicas', 'drink', 'Sucos, águas e refrigerantes', ['bebidas nao alcoolicas', 'bebidas sem alcool', 'nao alcoolicos', 'suco', 'sucos', 'refrigerante', 'refrigerantes', 'agua', 'aguas', 'agua tonica', 'aguas tonicas', 'energeticos', 'chas']],
  ['Conhaque', 'bottle', 'Conhaques e cognacs', ['conhaque', 'conhaques', 'cognac', 'cognacs'], /\b(?:conhaque|cognac)\b/],
  ['Cachaça', 'bottle', 'Destilados brasileiros de cana', ['cachaca', 'cachacas'], /\bcachaca\b/],
  ['Licor', 'drink', 'Licores e cremes', ['licor', 'licores']],
  ['Vermouth', 'drink', 'Vermutes para servir ou misturar', ['vermouth', 'vermouths', 'vermute', 'vermutes'], /\b(?:vermouth|vermute)\b/],
  ['Tequilas', 'bottle', 'Tequilas de agave', ['tequila', 'tequilas'], /\btequila\b/],
  ['Drinks', 'drink', 'Coquetéis e bebidas mistas', ['drink', 'drinks', 'coquetel', 'coqueteis', 'bebida mista', 'bebidas mistas']],
  ['Gins', 'drink', 'Gins clássicos e aromáticos', ['gin', 'gins'], /\bgin\b/],
  ['Aperitivos', 'drink', 'Bebidas para o aperitivo', ['aperitivo', 'aperitivos']],
  ['Champagne', 'flute', 'Champagnes da França', ['champagne', 'champagnes']],
];

export const EXTRA_COLLECTIONS = collections.map(([label, icon, subtitle]) => [label, icon, subtitle]);

const collectionRules = new Map(collections.map(([label, , , categories, namePattern]) => [
  categoryKey(label), { categories: new Set(categories), namePattern },
]));

export function matchExtraCollection(product, collection) {
  const rule = collectionRules.get(categoryKey(collection));
  if (!rule) return undefined;
  const category = categoryKey(product.category);
  return rule.categories.has(category) ||
    (['destilados', 'aperitivos', 'bebidas alcoolicas'].includes(category) &&
      Boolean(rule.namePattern?.test(categoryKey(product.name))));
}
