import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { montarItem } from '../src/item.mjs';
import { montarCard } from '../src/card.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/app.mjs', import.meta.url), 'utf8');
const generos = [{ qid: 'Q1', rotulo: 'Drama' }];
const base = { qid: 'Q9', titulo: 'T', ano: 1999, generos: ['Q1'], sitelinks: 1 };

test('card: nota com vírgula pt-BR e uma casa; sem nota o campo é nulo', () => {
  assert.equal(montarCard(montarItem({ ...base, nota: 8.4 }, generos)).notaTexto, 'Nota 8,4');
  assert.equal(montarCard(montarItem({ ...base, nota: 8 }, generos)).notaTexto, 'Nota 8,0');
  assert.equal(montarCard(montarItem(base, generos)).notaTexto, null);
  assert.equal('nota' in montarItem(base, generos), false);
});

function opcoes(id) {
  const m = new RegExp(`<select id="${id}">([\\s\\S]*?)</select>`).exec(html);
  assert.ok(m, id);
  return [...m[1].matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g)].map((x) => [x[1], x[2]]);
}

test('página: fieldset Época com De e Até por década e Nota mínima, cada select com label[for]', () => {
  assert.match(html, /<fieldset[^>]*>\s*<legend>Época<\/legend>/);
  for (const id of ['ano-de', 'ano-ate', 'nota-min']) assert.match(html, new RegExp(`<label for="${id}">`));
  const de = opcoes('ano-de');
  const ate = opcoes('ano-ate');
  assert.deepEqual(de[0], ['', 'Qualquer']);
  assert.deepEqual(ate[0], ['', 'Qualquer']);
  assert.deepEqual(de.slice(1).map((o) => o[0]), ['1920', '1930', '1940', '1950', '1960', '1970', '1980', '1990', '2000', '2010', '2020']);
  assert.deepEqual(ate.slice(1).map((o) => o[0]), ['1929', '1939', '1949', '1959', '1969', '1979', '1989', '1999', '2009', '2019', '2029']);
  assert.deepEqual(opcoes('nota-min'), [['', 'Qualquer'], ['6', '6+'], ['7', '7+'], ['8', '8+'], ['9', '9+']]);
});

test('página: o fieldset de época vem depois do gênero e antes do botão; rodapé com o crédito das notas', () => {
  const i = (t) => html.indexOf(t);
  assert.ok(i('id="genero"') < i('<legend>Época</legend>') && i('<legend>Época</legend>') < i('id="recomendar"'));
  assert.match(html, /<p>Notas da crítica: Rotten Tomatoes e Metacritic via Wikidata \(CC0\)<\/p>/);
});

test('app: filtros lidos dos selects e enviados ao recomendar; mudança no formulário já limpa o resultado', () => {
  assert.match(app, /anoDe: numero\('ano-de'\), anoAte: numero\('ano-ate'\), notaMin: numero\('nota-min'\)/);
  assert.match(app, /\.\.\.filtrosDaPagina\(\)/);
  assert.match(app, /addEventListener\('change', \(\) => \{\s*limparResultado\(\)/);
});

test('página: select Oscar com label[for] junto da Nota mínima; rodapé com o crédito do Oscar', () => {
  assert.match(html, /<label for="oscar">Oscar<\/label>/);
  assert.deepEqual(opcoes('oscar'), [['', 'Qualquer'], ['indicado', 'Indicado'], ['vencedor', 'Vencedor']]);
  const i = (t) => html.indexOf(t);
  assert.ok(i('id="nota-min"') < i('id="oscar"') && i('id="oscar"') < i('id="recomendar"'));
  assert.match(html, /Oscar: dados do Wikidata \(CC0\)/);
  assert.match(app, /oscar: el\('oscar'\)\.value/);
});

test('card: selo do Oscar com singular e plural; sem Oscar não há selo', () => {
  const selo = (o) => montarCard(montarItem({ ...base, ...o }, generos)).oscar;
  assert.equal(selo({ oscarVitorias: 1, oscarIndicacoes: 7 }).texto, 'Venceu 1 Oscar · indicado em 7 categorias');
  assert.equal(selo({ oscarVitorias: 3, oscarIndicacoes: 9 }).texto, 'Venceu 3 Oscars · indicado em 9 categorias');
  assert.equal(selo({ oscarVitorias: 1, oscarIndicacoes: 1 }).texto, 'Venceu 1 Oscar · indicado em 1 categoria');
  assert.equal(selo({ oscarIndicacoes: 1 }).texto, 'Indicado em 1 categoria do Oscar');
  assert.equal(selo({ oscarIndicacoes: 6 }).texto, 'Indicado em 6 categorias do Oscar');
  assert.equal(selo({ oscarVitorias: 2, oscarIndicacoes: 6 }).emoji, '\u{1F3C6}');
  assert.equal(selo({ oscarIndicacoes: 6 }).emoji, null);
  assert.equal(selo({}), null);
  assert.equal(selo({ oscarVitorias: 0, oscarIndicacoes: 0 }), null);
});

test('app: selo em linha própria depois da meta, emoji só em span aria-hidden e texto sem o emoji', () => {
  assert.ok(app.indexOf("class: 'oscar'") > app.indexOf("class: 'meta'"));
  assert.ok(app.indexOf("class: 'oscar'") < app.indexOf('desenharSinopse(card)'));
  assert.match(app, /criar\('span', card\.oscar\.emoji, \{ class: 'emoji', 'aria-hidden': 'true' \}\)/);
  assert.match(app, /criar\('span', card\.oscar\.texto\)/);
});
