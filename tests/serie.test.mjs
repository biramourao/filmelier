import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recomendar, TEXTOS_FILMES } from '../src/recomendar.mjs';

// Literais copiados de src/recomendar.mjs antes da FILMELIER-6 (6bf9b7c).
const LIT = {
  nenhum: 'Não encontramos filmes para essa combinação. Escolha outro humor ou gênero.',
  nenhumFiltros: 'Nenhum filme com esses filtros. Tente ampliar o período, baixar a nota mínima ou mudar o filtro de Oscar.',
  nenhumTags: 'Nenhum filme com esses temas. Tente incluir outro tema ou desfazer um "não quero".',
  nenhumTagsFiltros: 'Nenhum filme com esses temas e filtros. Tente incluir outro tema, desfazer um "não quero", ampliar o período, baixar a nota mínima ou mudar o filtro de Oscar.',
};

const HUMORES = { humores: [
  { id: 'leve', rotulo: 'Leve e engraçado', generos: [{ qid: 'Q1', rotulo: 'Comédia' }] },
  { id: 'emocionar', rotulo: 'Quero me emocionar', generos: [{ qid: 'Q2', rotulo: 'Drama' }] },
  { id: 'outro', rotulo: 'Outro', generos: [{ qid: 'Q3', rotulo: 'Crime' }] },
] };
const rng = () => 0.5;
const filme = (qid, generos, extra = {}) => ({ qid, titulo: qid, ano: 2000, generos, sitelinks: 50, ...extra });

test('AC-5: Textos de filmes iguais aos de hoje', () => {
  assert.deepEqual({ ...TEXTOS_FILMES }, { ...LIT, itens: 'filmes' });
  const base = { humores: HUMORES, humorId: 'leve', rng };
  assert.equal(recomendar({ ...base, filmes: [] }).mensagem, LIT.nenhum);
  assert.equal(recomendar({ ...base, filmes: [filme('Q10', ['Q1'])], anoDe: 2010 }).mensagem, LIT.nenhumFiltros);
  assert.equal(recomendar({ ...base, filmes: [filme('Q10', ['Q1'], { tags: ['a'] })], incluir: ['b'], excluir: ['a'], tagsValidas: ['a', 'b'] }).mensagem, LIT.nenhumTags);
  assert.equal(recomendar({ ...base, filmes: [filme('Q10', ['Q1'], { tags: ['a'] })], excluir: ['a'], tagsValidas: ['a'], anoDe: 1990 }).mensagem, LIT.nenhumTagsFiltros);
  const so = [filme('Q11', ['Q3'])];
  assert.equal(recomendar({ ...base, humorId: 'emocionar', generoQid: 'Q3', filmes: so }).aviso,
    'Não encontramos filmes para esse humor com o gênero Crime. Mostrando filmes de Crime.');
  assert.equal(recomendar({ ...base, humorId: 'emocionar', generoQid: 'Q3', filmes: [filme('Q12', ['Q2'])] }).aviso,
    'Não encontramos filmes para esse humor com o gênero Crime. Mostrando filmes para o humor Quero me emocionar.');
});

test('AC-5: campoAno troca o campo do filtro de época', () => {
  const series = [{ qid: 'Q1', generos: ['Q1'], sitelinks: 5, anoInicio: 2008 }, { qid: 'Q2', generos: ['Q1'], sitelinks: 4, anoInicio: 1999 }];
  const r = recomendar({ filmes: series, humores: HUMORES, humorId: 'leve', rng, anoDe: 2000, campoAno: 'anoInicio' });
  assert.deepEqual(r.filmes.map((s) => s.qid), ['Q1']);
});

// ---- tarefa 6.2: lógica pura de séries ----
import { readFileSync } from 'node:fs';
import { TEXTOS_SERIES, textoAnos, textoSituacao, linhaSerie, montarCardSerie, montarItemSerie } from '../src/serie.mjs';
import { listarGeneros, conjuntoCandidato } from '../src/recomendar.mjs';
import { listaDeTags } from '../src/tags.mjs';

const HUMORES_S = JSON.parse(readFileSync(new URL('../data/humores-series.json', import.meta.url), 'utf8'));
const GENEROS_S = listarGeneros(HUMORES_S);
const serie = (i, extra = {}) => ({
  qid: `Q${1000 + i}`, titulo: `Série ${i}`, anoInicio: 2000 + (i % 20), anoFim: null, situacao: 'finalizada', temporadas: 2, episodios: 20,
  generos: ['Q1366112'], sitelinks: 100 - i, tmdbId: i + 1, ...extra,
});
const rec = (series, extra = {}) => recomendar({ filmes: series, humores: HUMORES_S, humorId: 'emocionar', rng: () => 0.3, textos: TEXTOS_SERIES, campoAno: 'anoInicio', ...extra });

test('AC-4: Até 5 séries do conjunto candidato', () => {
  const series = Array.from({ length: 60 }, (_, i) => serie(i));
  const r = rec(series);
  assert.ok(r.filmes.length <= 5 && r.filmes.length > 0);
  const top40 = conjuntoCandidato(series).map((s) => s.qid);
  assert.equal(r.candidatos.length, 40);
  assert.deepEqual(r.candidatos.map((s) => s.qid), top40);
  assert.ok(r.filmes.every((s) => top40.includes(s.qid)));
});

test('AC-4: Outras sugestões sem repetir', () => {
  const series = Array.from({ length: 60 }, (_, i) => serie(i));
  const primeira = rec(series);
  const nova = rec(series, { anteriores: primeira.filmes, rng: () => 0.7 });
  const antes = new Set(primeira.filmes.map((s) => s.qid));
  assert.ok(nova.filmes.length > 0);
  assert.ok(nova.filmes.every((s) => !antes.has(s.qid)));
});

test('AC-4: Nenhuma elegível', () => {
  const r = rec([serie(1, { generos: ['Q20220309'] })]);
  assert.equal(r.nivel, 'nenhum');
  assert.deepEqual(r.filmes, []);
  assert.deepEqual(r.candidatos, []);
});

test('AC-5: Quatro mensagens de resultado vazio', () => {
  const s = [serie(1, { tags: ['a'] })];
  const sem = rec([]).mensagem;
  const filtros = rec(s, { anoDe: 2100 }).mensagem;
  const tags = rec(s, { excluir: ['a'], tagsValidas: ['a'] }).mensagem;
  const ambos = rec(s, { excluir: ['a'], tagsValidas: ['a'], anoDe: 1990 }).mensagem;
  assert.equal(sem, 'Não encontramos séries para essa combinação. Escolha outro humor ou gênero.');
  assert.equal(filtros, 'Nenhuma série com esses filtros. Tente ampliar o período.');
  assert.equal(tags, 'Nenhuma série com esses temas. Tente incluir outro tema ou desfazer um "não quero".');
  assert.equal(ambos, 'Nenhuma série com esses temas e filtros. Tente incluir outro tema, desfazer um "não quero" ou ampliar o período.');
  for (const m of [sem, filtros, tags, ambos]) assert.ok(!/nota|oscar/i.test(m));
});

test('AC-5: Os 2 avisos de séries', () => {
  const crime = serie(1, { generos: ['Q9335577'] });
  const emocionar = serie(2, { generos: ['Q1366112'] });
  const a = rec([crime, emocionar], { humorId: 'emocionar', generoQid: 'Q9335577' });
  assert.equal(a.aviso, 'Não encontramos séries para esse humor com o gênero Crime. Mostrando séries de Crime.');
  const b = rec([emocionar], { humorId: 'emocionar', generoQid: 'Q9335577' });
  assert.equal(b.aviso, 'Não encontramos séries para esse humor com o gênero Crime. Mostrando séries para o humor Quero me emocionar.');
});

test('AC-6: Série 2008–2013', () => {
  const s = [serie(1, { anoInicio: 2008, anoFim: 2013 })];
  assert.equal(rec(s, { anoDe: 2000, anoAte: 2009 }).filmes.length, 1);
  assert.equal(rec(s, { anoDe: 2010, anoAte: 2019 }).filmes.length, 0);
});

test('AC-6: De maior que Até', () => {
  const s = [serie(1, { anoInicio: 2008, anoFim: 2013 })];
  assert.deepEqual(rec(s, { anoDe: 2010, anoAte: 2000 }), rec(s, { anoDe: 2000, anoAte: 2010 }));
});

test('AC-6: Card de série com campos de nota e Oscar na fixture', () => {
  const s = serie(1, { nota: 8, oscarVitorias: 2, oscarIndicacoes: 3 });
  const card = montarCardSerie(s, GENEROS_S);
  assert.equal(card.notaTexto, null);
  assert.equal(card.oscar, null);
  const textos = [card.titulo, card.ano, ...card.generos, card.linhaSerie, card.situacaoTexto, ...(card.tags ?? [])];
  for (const t of textos) assert.ok(!/nota|oscar/i.test(t), t);
  const item = montarItemSerie(s, GENEROS_S);
  assert.ok(!('nota' in item) && !('oscarVitorias' in item) && !('oscarIndicacoes' in item));
});

test('AC-7: Tag com 19 séries descartada', () => {
  const lista = listaDeTags({ temas: { lista: [{ id: 'a', rotulo: 'A', filmes: 19 }, { id: 'b', rotulo: 'B', filmes: 20 }] } });
  assert.deepEqual(lista.map((t) => t.id), ['b']);
});

test('AC-7: Incluir e excluir em séries', () => {
  const series = Array.from({ length: 30 }, (_, i) => serie(i, i % 3 === 0 ? { tags: ['bruxaria'] } : i % 3 === 1 ? { clima: 'bruxaria' } : {}));
  const tem = (s) => (s.tags ?? []).includes('bruxaria') || s.clima === 'bruxaria';
  const inc = rec(series, { incluir: ['bruxaria'], tagsValidas: ['bruxaria'] });
  assert.ok(inc.filmes.length > 0 && inc.filmes.every(tem));
  const exc = rec(series, { excluir: ['bruxaria'], tagsValidas: ['bruxaria'] });
  assert.ok(exc.filmes.length > 0 && exc.filmes.every((s) => !tem(s)));
});

test('AC-8: Quatro formatos de anos', () => {
  const casos = [
    [serie(1, { anoInicio: 2008, anoFim: 2013, generos: ['Q1366112', 'Q9335577'] }), '2008–2013 · Drama, Crime'],
    [serie(2, { anoInicio: 2010, anoFim: 2010, situacao: 'cancelada', generos: [] }), '2010 · '],
    [serie(3, { anoInicio: 2016, anoFim: null, situacao: 'em-andamento', generos: [] }), '2016– · '],
    [serie(4, { anoInicio: 2002, anoFim: null, situacao: 'finalizada', generos: [] }), '2002 · '],
  ];
  for (const [s, esperado] of casos) {
    const card = montarCardSerie(s, GENEROS_S);
    assert.equal(`${card.ano} · ${card.generos.join(', ')}`, esperado);
    assert.equal(textoAnos(s), esperado.split(' · ')[0]);
  }
});

test('AC-8: Worker com título não muda o card de série', () => {
  const s = serie(1, { titulo: 'Liberdade Vigiada', tituloOriginal: 'Breaking Bad' });
  const card = montarCardSerie(s, GENEROS_S, null, { status: 'ok', titulo: 'Outro', tituloOriginal: 'Another', flatrate: [], rent: [], buy: [], ads: [], free: [], link: null });
  assert.equal(card.titulo, 'Liberdade Vigiada');
  assert.equal(card.tituloOriginalTexto, 'Título original: Breaking Bad');
  const sem = montarCardSerie(serie(2), GENEROS_S);
  assert.equal(sem.tituloOriginalTexto, null);
  assert.equal(sem.tituloOriginal, null);
});

test('AC-9: Quatro situações', () => {
  assert.deepEqual(['cancelada', 'finalizada', 'em-andamento', null, undefined].map(textoSituacao),
    ['Cancelada', 'Finalizada', 'Em andamento', 'Situação não informada', 'Situação não informada']);
  assert.equal(montarCardSerie(serie(1, { situacao: null }), GENEROS_S).situacaoTexto, 'Situação não informada');
});

test('AC-9: Cinco combinações', () => {
  const c = (temporadas, episodios) => linhaSerie(serie(1, { situacao: 'cancelada', temporadas, episodios }));
  assert.equal(c(1, 11), 'Cancelada · 1 temporada · 11 episódios');
  assert.equal(c(5, 1), 'Cancelada · 5 temporadas · 1 episódio');
  assert.equal(c(40, 1234), 'Cancelada · 40 temporadas · 1.234 episódios');
  assert.equal(c(null, 62), 'Cancelada · 62 episódios');
  assert.equal(c(null, null), 'Cancelada');
  assert.equal(montarCardSerie(serie(1, { situacao: 'cancelada', temporadas: 1, episodios: 11 }), GENEROS_S).linhaSerie, 'Cancelada · 1 temporada · 11 episódios');
});

test('AC-8: card de série tem rótulo de tags e provedores como o de filme', () => {
  const card = montarCardSerie(serie(1, { tags: ['a'] }), GENEROS_S, null, null, { lista: [{ id: 'a', rotulo: 'Tema A', filmes: 30 }], incluir: [] });
  assert.equal(card.rotuloTags, 'Tags da série');
  assert.deepEqual(card.tags, ['Tema A']);
  assert.equal(card.provedores, null);
});

// ---- tarefa 6.3: sessão da lista com séries ----
import { criarSessaoLista } from '../src/lista.mjs';

test('AC-10: sessão com montarCardSerie e itemDoLote de séries entrega { qid, imdb, tmdb } e cards com linhaSerie', async () => {
  const lotes = [];
  const provedores = { ativo: true, buscar: async (itens) => { lotes.push(itens); return new Map(); } };
  const enriquecedor = { enriquecer: async () => new Map() };
  const sessao = criarSessaoLista({
    enriquecedor, generos: GENEROS_S, aoAtualizar: () => {}, provedores,
    montarCardDe: (s, enriq, prov, tags) => montarCardSerie(s, GENEROS_S, enriq, prov, tags),
    itemDoLote: (s) => ({ qid: s.qid, imdb: s.imdb ?? null, tmdb: s.tmdbId }),
  });
  const series = [serie(1, { imdb: 'tt0903747', tmdbId: 1396, situacao: 'cancelada', temporadas: 1, episodios: 11 }), serie(2, { tmdbId: null })];
  const { cards, concluidoProvedores } = sessao.exibir({ filmes: series });
  await concluidoProvedores;
  assert.deepEqual(lotes, [[{ qid: 'Q1001', imdb: 'tt0903747', tmdb: 1396 }, { qid: 'Q1002', imdb: null, tmdb: null }]]);
  assert.equal(cards[0].linhaSerie, 'Cancelada · 1 temporada · 11 episódios');
  assert.ok(cards.every((c) => typeof c.linhaSerie === 'string'));
});

test('AC-10: sessão com os padrões continua mandando { qid, imdb } de filmes', async () => {
  const lotes = [];
  const sessao = criarSessaoLista({
    enriquecedor: { enriquecer: async () => new Map() }, generos: GENEROS_S, aoAtualizar: () => {},
    provedores: { ativo: true, buscar: async (itens) => { lotes.push(itens); return new Map(); } },
  });
  const { concluidoProvedores, cards } = sessao.exibir({ filmes: [{ qid: 'Q5', titulo: 'F', ano: 2000, generos: [], sitelinks: 1, tmdbId: 9 }] });
  await concluidoProvedores;
  assert.deepEqual(lotes, [[{ qid: 'Q5', imdb: null }]]);
  assert.ok(!('linhaSerie' in cards[0]));
});
