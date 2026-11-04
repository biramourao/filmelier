import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  listaDeTags, alternar, filtroDoEstado, estadoDaTag, montarChips, montarControle, montarControles, tagsDoCard, textoTagsAtivas, MAX_CHIPS,
} from '../src/tags.mjs';

const raiz = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const temas = JSON.parse(readFileSync(`${raiz}/data/temas.json`, 'utf8'));
const item = (id, rotulo, filmes = 50) => ({ id, rotulo, filmes });
const meta = (lista) => ({ temas: { geradoEm: '2026-11-04T00:00:00.000Z', lista, semPar: {} } });

test('AC-12: a lista vem só de meta.temas.lista, em ordem localeCompare pt-BR do rótulo, sem itens inválidos', () => {
  const lista = [item('e', 'Zebra'), item('a', 'Ônibus'), item('b', 'Abacate'), item('c', 'Casa'), item('d', 'Árvore'),
    item('x', 'Pouco', 19), { id: 'y', rotulo: '', filmes: 40 }, { id: 'z', rotulo: 'Z', filmes: '40' }, null];
  const r = listaDeTags(meta(lista));
  assert.equal(r.length, 5);
  assert.deepEqual(r.map((t) => t.rotulo), [...r.map((t) => t.rotulo)].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  assert.deepEqual(r.map((t) => t.rotulo), ['Abacate', 'Árvore', 'Casa', 'Ônibus', 'Zebra']);
  for (const m of [undefined, {}, { temas: {} }, { temas: { lista: 'x' } }, { temas: { lista: [] } }]) assert.deepEqual(listaDeTags(m), []);
});

test('AC-12: cada tag do grupo tem 2 botões com aria-pressed false: o do rótulo e o "Menos {rótulo}"', () => {
  const controles = montarControles(listaDeTags(meta([item('b', 'Beta'), item('a', 'Alfa')])), new Map());
  assert.equal(controles.length, 2);
  for (const c of controles) {
    assert.equal(c.botoes.length, 2);
    assert.deepEqual(c.botoes.map((b) => b.acao), ['incluir', 'excluir']);
    assert.ok(c.botoes.every((b) => b.pressionado === false && b.texto !== ''));
    assert.equal(c.botoes[0].nome, c.rotulo);
    assert.equal(c.botoes[1].texto, 'Menos');
    assert.equal(c.botoes[1].nome, `Menos ${c.rotulo}`);
  }
});

test('AC-12: transições de estado: incluir, Menos, Menos de novo (incluída, excluída, neutra)', () => {
  let e = new Map();
  e = alternar(e, 'bruxaria', 'incluir');
  assert.equal(estadoDaTag(e, 'bruxaria'), 'incluida');
  e = alternar(e, 'bruxaria', 'excluir');
  assert.equal(estadoDaTag(e, 'bruxaria'), 'excluida');
  e = alternar(e, 'bruxaria', 'excluir');
  assert.equal(estadoDaTag(e, 'bruxaria'), 'neutra');
  const original = new Map();
  alternar(original, 'a', 'incluir');
  assert.equal(original.size, 0);
  e = alternar(alternar(new Map(), 'a', 'incluir'), 'a', 'incluir');
  assert.equal(estadoDaTag(e, 'a'), 'neutra');
});

test('AC-13: incluir "Bruxaria" e depois "Menos Bruxaria" deixa só excluir', () => {
  const e = alternar(alternar(new Map(), 'bruxaria', 'incluir'), 'bruxaria', 'excluir');
  assert.deepEqual(filtroDoEstado(e), { incluir: [], excluir: ['bruxaria'] });
});

test('AC-12: formulário e chips refletem o mesmo estado (aria-pressed)', () => {
  const lista = listaDeTags(meta([item('bruxaria', 'Bruxaria')]));
  let e = alternar(new Map(), 'bruxaria', 'incluir');
  assert.equal(montarControle(lista[0], e).botoes[0].pressionado, true);
  e = alternar(e, 'bruxaria', 'excluir');
  const c = montarControle(lista[0], e);
  assert.deepEqual(c.botoes.map((b) => b.pressionado), [false, true]);
});

const filmeCom = (tags, clima) => ({ qid: 'Q1', tags, ...(clima ? { clima } : {}) });
const quinze = Array.from({ length: 15 }, (_, i) => item(`t${String(i).padStart(2, '0')}`, `Tema ${String.fromCharCode(65 + i)}`, 100 + i));

test('AC-13: 10 chips na ordem definida: ativa primeiro, depois frequência decrescente e rótulo', () => {
  // t00..t14: frequência 15 - i no conjunto (t00 em 15 filmes... t14 em 1); empate t05 e t06 forçado.
  const candidatos = Array.from({ length: 40 }, (_, k) => filmeCom(
    Array.from({ length: 15 }, (_, i) => i).filter((i) => k < 40 - 2 * i).map((i) => `t${String(i).padStart(2, '0')}`),
  ));
  const estado = alternar(new Map(), 't14', 'incluir');
  const chips = montarChips({ candidatos, estado, lista: quinze });
  assert.equal(chips.length, MAX_CHIPS);
  assert.equal(chips[0].id, 't14');
  assert.equal(chips[0].incluida, true);
  assert.deepEqual(chips.slice(1).map((c) => c.id), ['t00', 't01', 't02', 't03', 't04', 't05', 't06', 't07', 't08']);
});

test('AC-13: empate de frequência resolvido por localeCompare pt-BR do rótulo', () => {
  const lista = [item('a', 'Zeta'), item('b', 'Álamo'), item('c', 'Beta')];
  const candidatos = [filmeCom(['a']), filmeCom(['b']), filmeCom(['c'])];
  assert.deepEqual(montarChips({ candidatos, estado: new Map(), lista }).map((c) => c.rotulo), ['Álamo', 'Beta', 'Zeta']);
});

test('AC-13: tag com 19 filmes na lista, ou fora dela, não vira chip; clima do conjunto vira chip', () => {
  const lista = [item('pouco', 'Pouco', 19), item('ok', 'Ok', 20), item('sombrio', 'Clima sombrio', 300)];
  const candidatos = [filmeCom(['pouco', 'ok', 'fora'], 'sombrio')];
  assert.deepEqual(montarChips({ candidatos, estado: new Map(), lista }).map((c) => c.id).sort(), ['ok', 'sombrio']);
});

test('AC-13: tag ativa fora do conjunto é o 1º chip, e com resultado vazio é o único', () => {
  const lista = [item('bruxaria', 'Bruxaria'), item('magia', 'Magia'), item('princesas', 'Princesas e reinos encantados')];
  const candidatos = [filmeCom(['magia'])];
  const excl = alternar(new Map(), 'bruxaria', 'excluir');
  const chips = montarChips({ candidatos, estado: excl, lista });
  assert.equal(chips[0].id, 'bruxaria');
  assert.equal(chips[0].excluida, true);
  const vazio = montarChips({ candidatos: [], estado: alternar(new Map(), 'princesas', 'incluir'), lista });
  assert.deepEqual(vazio.map((c) => c.id), ['princesas']);
  assert.equal(vazio[0].rotulo, 'Princesas e reinos encantados');
  assert.deepEqual(montarChips({ candidatos: [], estado: new Map(), lista }), []);
});

test('AC-13: texto das tags ativas "Com Bruxaria. Sem Clima sombrio."', () => {
  const lista = [item('bruxaria', 'Bruxaria'), item('sombrio', 'Clima sombrio'), item('magia', 'Magia')];
  let e = alternar(new Map(), 'bruxaria', 'incluir');
  e = alternar(e, 'sombrio', 'excluir');
  assert.equal(textoTagsAtivas(e, lista), 'Com Bruxaria. Sem Clima sombrio.');
  assert.equal(textoTagsAtivas(alternar(new Map(), 'magia', 'incluir'), lista), 'Com Magia.');
  assert.equal(textoTagsAtivas(alternar(new Map(), 'magia', 'excluir'), lista), 'Sem Magia.');
  assert.equal(textoTagsAtivas(new Map(), lista), '');
  const dois = alternar(alternar(new Map(), 'magia', 'incluir'), 'bruxaria', 'incluir');
  assert.equal(textoTagsAtivas(dois, lista), 'Com Bruxaria, Magia.');
});

const listaCard = [item('sombrio', 'Clima sombrio', 500), item('t300', 'Tema de 300', 300), item('t25a', 'Beta 25', 25), item('t90', 'Tema de 90', 90), item('t25b', 'Alfa 25', 25)];
const filmeCard = { tags: ['t300', 't25a', 't90', 't25b'], clima: 'sombrio' };

test('AC-14: clima e 4 temas viram 3 tags: clima e os 2 de menor contagem em ordem alfabética', () => {
  assert.deepEqual(tagsDoCard(filmeCard, { lista: listaCard, incluir: [] }), ['Clima sombrio', 'Alfa 25', 'Beta 25']);
});

test('AC-14: tema incluído tem prioridade', () => {
  assert.deepEqual(tagsDoCard(filmeCard, { lista: listaCard, incluir: ['t300'] }), ['Clima sombrio', 'Tema de 300', 'Alfa 25']);
});

test('AC-14: filme sem tag, ids ausentes da lista e sem lista não têm tags', () => {
  assert.deepEqual(tagsDoCard({}, { lista: listaCard, incluir: [] }), []);
  assert.deepEqual(tagsDoCard({ tags: ['x'], clima: 'leve' }, { lista: listaCard, incluir: [] }), []);
  assert.deepEqual(tagsDoCard(filmeCard, { lista: [], incluir: [] }), []);
  assert.deepEqual(tagsDoCard(filmeCard, {}), []);
});

test('AC-16: nenhum rótulo de tag da tabela versionada é igual a uma keyword (sem diferenciar maiúsculas)', () => {
  const keywords = new Set([...temas.temas, ...temas.climas].flatMap((t) => t.keywords));
  for (const t of [...temas.temas, ...temas.climas]) assert.ok(!keywords.has(t.rotulo.toLowerCase()), t.rotulo);
});
