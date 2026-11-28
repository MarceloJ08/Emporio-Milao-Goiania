import test from 'node:test';
import assert from 'node:assert/strict';
import {matchExtraCollection,matchWineCollection} from '../src/js/catalog-collections.mjs';

test('separa rosé tranquilo, espumante rosé, champagne e tinto pelo cadastro',()=>{
 const rose={name:'Miraval Rosé',category:'Vinhos Rosés',tipo_vinho:'rose',price:350};
 const sparkling={name:'Chandon Brut Rosé',category:'Espumantes',tipo_vinho:'espumante',price:90};
 const champagne={name:'Ruinart Brut Rosé',category:'Champagnes',tipo_vinho:'espumante',price:650};
 const red={name:'Château Montrose 2014',category:'Vinhos Tintos',tipo_vinho:'tinto',price:1200};
 const port={name:'Burmester Tawny',category:'Vinho do Porto',tipo_vinho:'fortificado',price:140};
 const noAlcohol={name:'Garibaldi Rosé Zero',category:'Espumantes sem álcool',tipo_vinho:'espumante',price:40};
 assert.deepEqual([rose,sparkling,champagne,red,port,noAlcohol].filter(w=>matchWineCollection(w,'Rosés')),[rose]);
 assert.deepEqual([rose,sparkling,champagne,red,port,noAlcohol].filter(w=>matchWineCollection(w,'Espumantes')),[sparkling,champagne]);
 assert.equal(matchWineCollection(red,'Tintos'),true);
 assert.equal(matchWineCollection(port,'Tintos'),false);
 assert.equal(matchWineCollection(champagne,'Champagne'),true);
 assert.equal(matchExtraCollection(noAlcohol,'Bebidas sem álcool'),true);
});

test('premium considera preço de tabela e o cadastro, sem interpretar reserva no nome',()=>{
 assert.equal(matchWineCollection({category:'Vinhos Tintos',name:'Reserva Especial',price:99},'Vinhos premium'),false);
 assert.equal(matchWineCollection({category:'Whiskys',price:600},'Vinhos premium'),false);
 assert.equal(matchWineCollection({category:'Vinhos Tintos',regularPrice:400,price:320},'Vinhos premium'),true);
 assert.equal(matchWineCollection({category:'Vinhos premium',tipo_vinho:'branco',price:200},'Vinhos premium'),true);
});
