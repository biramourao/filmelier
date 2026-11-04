import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { casarTemas, calcularClima } from '../scripts/lib/temas.mjs';

const raiz = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const tabela = JSON.parse(readFileSync(`${raiz}/data/temas.json`, 'utf8'));
const viabilidade = JSON.parse(readFileSync(`${raiz}/tests/fixtures/keywords-viabilidade.json`, 'utf8'));
const mini = { temas: [{ id: 'bruxaria', rotulo: 'Bruxaria', keywords: ['witch'] }], climas: [], generosClima: {}, ignorar: [] };

const FANTASIA = 'Q157394';
const FAMILIA = 'Q1361932';
const ACAO = 'Q188473';
const DRAMA = 'Q130232';
const AVENTURA = 'Q319221';

test('AC-3: keyword exata witch casa o tema bruxaria', () => {
  assert.ok(casarTemas(['witch'], mini).has('bruxaria'));
});

test('AC-3: plural e substring não casam', () => {
  assert.ok(!casarTemas(['witches'], mini).has('bruxaria'));
  assert.ok(!casarTemas(['witchcraft museum'], mini).has('bruxaria'));
});

test('AC-3: espaço e maiúscula são normalizados', () => {
  assert.ok(casarTemas(['Witch '], mini).has('bruxaria'));
});

test('AC-3: uma keyword pode estar em mais de um tema', () => {
  const ids = casarTemas(['school of witchcraft'], tabela);
  assert.ok(ids.has('bruxaria') && ids.has('escola-de-magia'));
});

test('AC-6: só sinal leve (whimsical e Fantasia)', () => {
  assert.equal(calcularClima({ keywords: ['whimsical'], generos: [FANTASIA], temasCasados: [], tabela }), 'leve');
});

test('AC-6: leve e intermediário dão intermediário', () => {
  assert.equal(calcularClima({ keywords: ['whimsical', 'tension'], generos: [], temasCasados: [], tabela }), 'intermediario');
});

test('AC-6: intermediário e sombrio dão sombrio', () => {
  assert.equal(calcularClima({ keywords: ['tension', 'depressing'], generos: [], temasCasados: [], tabela }), 'sombrio');
});

test('AC-6: gêneros Família e Ação dão intermediário', () => {
  assert.equal(calcularClima({ keywords: [], generos: [FAMILIA, ACAO], temasCasados: [], tabela }), 'intermediario');
});

test('AC-6: só Drama e keywords fora da tabela ficam sem clima', () => {
  assert.equal(calcularClima({ keywords: ['volcano-inexistente', 'time travel'], generos: [DRAMA], temasCasados: [], tabela }), undefined);
});

test('AC-6: Aventura sozinha não muda o clima; com whimsical fica leve', () => {
  assert.equal(calcularClima({ keywords: [], generos: [AVENTURA], temasCasados: [], tabela }), undefined);
  assert.equal(calcularClima({ keywords: ['whimsical'], generos: [AVENTURA], temasCasados: [], tabela }), 'leve');
});

const clima = (qid, generos) => {
  const temasCasados = casarTemas(viabilidade[qid], tabela);
  return calcularClima({ keywords: viabilidade[qid], generos, temasCasados, tabela });
};

test('AC-6: exemplos medidos na viabilidade (Alice leve, Retorno do Rei intermediário, Enigma do Príncipe sombrio)', () => {
  assert.equal(clima('Q174385', [FANTASIA]), 'leve');
  assert.equal(clima('Q131074', ['Q319221', FANTASIA]), 'intermediario');
  assert.equal(clima('Q161687', [FANTASIA]), 'sombrio');
});

test('AC-3: Alice casa classicos-infantis e mundos-fantasticos', () => {
  const ids = casarTemas(viabilidade.Q174385, tabela);
  assert.ok(ids.has('classicos-infantis') && ids.has('mundos-fantasticos'));
});

test('AC-3: o sinal do tema vale mesmo sem limiar (a regra recebe os temas casados antes do limiar)', () => {
  assert.equal(calcularClima({ keywords: [], generos: [], temasCasados: ['classicos-infantis'], tabela }), 'leve');
});

// Clima de filmes com temas ambíguos (decisão D-20): bruxaria e magia não definem clima; vem do tom, do gênero e da curadoria.
const ANIMACAO = 'Q202866';
const MUSICAL = 'Q842256';
const TERROR = 'Q200092';
const climaDe = (keywords, generos) => calcularClima({ keywords, generos, temasCasados: casarTemas(keywords, tabela), tabela });

test('AC-6: filme com bruxaria e magia e gêneros Família e Animação (A Pequena Sereia, Hocus Pocus) sai leve', () => {
  const k = ['witch', 'magic', 'mermaid', 'dragon', 'ghost'];
  assert.ok(casarTemas(k, tabela).has('bruxaria'));
  assert.equal(climaDe(k, [FANTASIA, FAMILIA, ANIMACAO]), 'leve');
  assert.equal(climaDe(['witch', 'magic', 'ghost'], [FAMILIA]), 'leve');
  assert.equal(climaDe(['witch', 'magic'], [ANIMACAO]), 'leve');
  assert.equal(climaDe(['witch'], [MUSICAL]), undefined);
  assert.equal(climaDe([], [MUSICAL]), undefined);
});

test('AC-6: bruxaria e magia sozinhas, sem tom nem gênero, ficam sem clima', () => {
  assert.equal(climaDe(['witch', 'magic', 'wizard', 'vampire', 'werewolf', 'occult', 'curse'], [FANTASIA]), undefined);
});

test('AC-6: bruxaria com horror (keyword ou gênero Terror) sai sombrio, mesmo com Família', () => {
  assert.equal(climaDe(['witch', 'horror'], [FANTASIA]), 'sombrio');
  assert.equal(climaDe(['witch', 'gore'], []), 'sombrio');
  assert.equal(climaDe(['witch', 'dark fantasy'], [FANTASIA]), 'sombrio');
  assert.equal(climaDe(['witch', 'magic'], [TERROR]), 'sombrio');
  assert.equal(climaDe(['witch', 'whimsical'], [FAMILIA, TERROR]), 'sombrio');
});

test('AC-6: temas inequívocos continuam definindo clima (zumbis, assassino em série, demônios)', () => {
  assert.equal(climaDe(['zombie'], [FAMILIA]), 'sombrio');
  assert.equal(climaDe(['serial killer'], []), 'sombrio');
  assert.equal(climaDe(['demonic possession'], []), 'sombrio');
});

test('AC-6: sem a curadoria, Harry Potter e a Pedra Filosofal sai leve (keywords whimsical e children\'s adventure); a curadoria o torna sombrio', () => {
  assert.equal(clima('Q102438', [FANTASIA, FAMILIA, AVENTURA]), 'leve');
  assert.equal(clima('Q161687', [FANTASIA]), 'sombrio');
});
