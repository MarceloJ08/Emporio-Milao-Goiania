function categoryKey(value) {
  return (value || '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
}

export const ALCOHOL_FREE_COLLECTION = 'Bebidas sem álcool';
export const ALCOHOL_FREE_WINES = ['Vinhos desalcoolizados', 'Espumantes sem álcool'];

export function isAlcoholFreeCollection(value) {
  return ['bebidas sem alcool', 'bebidas nao alcoolicas'].includes(categoryKey(value));
}

export function isAlcoholFreeWine(product) {
  return ALCOHOL_FREE_WINES.some(category => categoryKey(category) === categoryKey(product.category));
}

const wineCategories = {
  tintos:'tinto', 'vinhos tintos':'tinto',
  brancos:'branco', 'vinhos brancos':'branco',
  roses:'rose', 'vinhos roses':'rose',
  espumantes:'espumante', champagne:'champagne', champagnes:'champagne',
  'vinho do porto':'porto',
};
export const PREMIUM_WINE_PRICE = 400;

export function catalogWineType(product) {
  if(isAlcoholFreeWine(product))return '';
  const category=categoryKey(product.category);
  return Object.hasOwn(wineCategories,category) ? wineCategories[category] : product.tipo_vinho || '';
}

export function matchWineCollection(product, collection) {
  const key=categoryKey(collection);
  const type=catalogWineType(product);
  if(key==='vinhos')return Boolean(type);
  if(key==='premium'||key==='vinhos premium'){
    const regularPrice=Number(product.regularPrice ?? product.price);
    return Boolean(type && (categoryKey(product.category)==='vinhos premium'||regularPrice>=PREMIUM_WINE_PRICE));
  }
  if(key==='espumantes')return type==='espumante'||type==='champagne';
  return Object.hasOwn(wineCategories,key)?type===wineCategories[key]:undefined;
}

const collections = [
  ['Mercearias', 'snack', 'Produtos de despensa', ['mercearia', 'mercearias', 'azeite', 'azeites', 'conservas', 'massas', 'molhos', 'petiscos', 'doces', 'chocolates', 'biscoitos']],
  [ALCOHOL_FREE_COLLECTION, 'drink', 'Vinhos desalcoolizados e espumantes sem álcool', ['bebidas nao alcoolicas', 'bebidas sem alcool', 'nao alcoolicos', 'refrigerante', 'refrigerantes', 'agua', 'aguas', 'agua tonica', 'aguas tonicas', 'energeticos', 'chas', ...ALCOHOL_FREE_WINES.map(categoryKey)]],
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
  const key = categoryKey(isAlcoholFreeCollection(collection) ? ALCOHOL_FREE_COLLECTION : collection);
  const rule = collectionRules.get(key);
  if (!rule) return undefined;
  const category = categoryKey(product.category);
  return rule.categories.has(category) ||
    (['destilados', 'aperitivos', 'bebidas alcoolicas'].includes(category) &&
      Boolean(rule.namePattern?.test(categoryKey(product.name))));
}
