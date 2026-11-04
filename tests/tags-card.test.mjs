import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { montarCard } from '../src/card.mjs';
import { montarItem } from '../src/item.mjs';
import { criarSessaoLista } from '../src/lista.mjs';
import { carregarDados } from '../src/dados.mjs';
import { listarGeneros, recomendar } from '../src/recomendar.mjs';
import { listaDeTags, montarChips } from '../src/tags.mjs';

const humores = JSON.parse(readFileSync(new URL('../data/humores.json', import.meta.url), 'utf8'));
const generos = listarGeneros(humores);
const lista = [
  { id: 'sombrio', rotulo: 'Clima sombrio', filmes: 500 }, { id: 't300', rotulo: 'Tema de 300', filmes: 300 },
  { id: 't25a', rotulo: 'Beta 25', filmes: 25 }, { id: 't90', rotulo: 'Tema de 90', filmes: 90 }, { id: 't25b', rotulo: 'Alfa 25', filmes: 25 },
];
const filme = { qid: 'Q1', titulo: 'Filme', ano: 2001, generos: ['Q157394'], sitelinks: 10, tags: ['t300', 't25a', 't90', 't25b'], clima: 'sombrio' };
const completo = { idioma: 'pt', sinopse: 'Sinopse.', capaUrl: 'https://upload.wikimedia.org/a.jpg', artigoUrl: 'https://pt.wikipedia.org/wiki/X' };

test('AC-14: montarItem leva tags e clima do filme, e só quando existem', () => {
  const item = montarItem(filme, generos);
  assert.deepEqual(item.tags, filme.tags);
  assert.equal(item.clima, 'sombrio');
  const sem = montarItem({ ...filme, tags: undefined, clima: undefined }, generos);
  assert.ok(!('tags' in sem) && !('clima' in sem));
});

test('AC-14: card com clima e 4 temas tem a seção de tags com 3 itens, entre gêneros e sinopse', () => {
  const card = montarCard(montarItem(filme, generos), completo, null, { lista, incluir: [] });
  assert.deepEqual(card.tags, ['Clima sombrio', 'Alfa 25', 'Beta 25']);
  const chaves = Object.keys(card);
  for (const [a, b] of [['titulo', 'ano'], ['ano', 'generos'], ['generos', 'tags'], ['notaTexto', 'tags'], ['tags', 'oscar'], ['tags', 'sinopse']]) {
    assert.ok(chaves.indexOf(a) < chaves.indexOf(b), `${a} antes de ${b}`);
  }
});

test('AC-14: tema incluído tem prioridade no card', () => {
  const card = montarCard(montarItem(filme, generos), null, null, { lista, incluir: ['t300'] });
  assert.deepEqual(card.tags, ['Clima sombrio', 'Tema de 300', 'Alfa 25']);
});

test('AC-14: card sem tags (filme sem tags, ids fora da lista, ou sem opções) não tem a seção', () => {
  assert.equal(montarCard(montarItem({ ...filme, tags: undefined, clima: undefined }, generos), null, null, { lista, incluir: [] }).tags, null);
  assert.equal(montarCard(montarItem({ ...filme, tags: ['x'], clima: 'y' }, generos), null, null, { lista, incluir: [] }).tags, null);
  assert.equal(montarCard(montarItem(filme, generos)).tags, null);
});

test('AC-14: a sessão da lista passa lista e o incluir atual a montarCard', () => {
  let incluir = [];
  const sessao = criarSessaoLista({
    enriquecedor: { enriquecer: async () => new Map() }, generos, aoAtualizar() {}, lista, incluirAtual: () => incluir,
  });
  const a = sessao.exibir({ filmes: [filme] });
  assert.deepEqual(a.cards[0].tags, ['Clima sombrio', 'Alfa 25', 'Beta 25']);
  incluir = ['t300'];
  assert.deepEqual(sessao.exibir({ filmes: [filme] }).cards[0].tags, ['Clima sombrio', 'Tema de 300', 'Alfa 25']);
  const semLista = criarSessaoLista({ enriquecedor: { enriquecer: async () => new Map() }, generos, aoAtualizar() {} });
  assert.equal(semLista.exibir({ filmes: [filme] }).cards[0].tags, null);
});

test('AC-14: base sintética da FILMELIER-3 sem meta.temas devolve lista, card sem seção, listas vazias e 0 console.error', async () => {
  const base = { meta: { geradoEm: '2026-11-04T00:00:00.000Z', fonte: 'Wikidata', licenca: 'CC0 1.0', total: 6 },
    filmes: Array.from({ length: 6 }, (_, i) => ({ qid: `Q${i + 1}`, titulo: `F${i + 1}`, ano: 2000, generos: ['Q157394'], sitelinks: 10 + i })) };
  const erros = [];
  const fetchImpl = async (url) => ({ ok: true, status: 200, json: async () => (String(url).includes('humores') ? humores : base) });
  const dados = await carregarDados(fetchImpl, { error: (m) => erros.push(m) });
  assert.equal(dados.erro, null);
  const grupo = listaDeTags(dados.filmes.meta);
  assert.deepEqual(grupo, []);
  const r = recomendar({ filmes: dados.filmes.filmes, humores: dados.humores, humorId: 'aventura', rng: () => 0.3, tagsValidas: grupo.map((t) => t.id) });
  assert.ok(r.filmes.length > 0);
  const sessao = criarSessaoLista({ enriquecedor: { enriquecer: async () => new Map() }, generos, aoAtualizar() {}, lista: grupo });
  const { cards } = sessao.exibir(r);
  assert.ok(cards.every((c) => c.tags === null));
  assert.deepEqual(montarChips({ candidatos: r.candidatos, estado: new Map(), lista: grupo }), []);
  assert.equal(erros.length, 0);
});
