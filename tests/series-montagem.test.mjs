import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mesclarLinhas, aplicarTmdb, aplicarFallback, situacaoDoStatus, montarConsultaSeries } from '../scripts/lib/series.mjs';

const QIDS = new Set(['Q1366112', 'Q9335577', 'Q343782']);
const uri = (q) => ({ value: `http://www.wikidata.org/entity/${q}` });
const v = (x) => ({ value: String(x) });
// linha SPARQL: { s, g, inicio, fim, temp, ep, tmdb, imdb, sl, tpt, ten }
const linha = (s, g, extra = {}) => ({ s: uri(s), g: uri(g), inicio: v('2008-01-20T00:00:00Z'), sl: v(103), tpt: v(`Série ${s}`), ...extra });

test('AC-11: montarConsultaSeries tem o gênero, a coorte P31/P279* Q5398426, P580 obrigatório e o corte de 20', () => {
  const q = montarConsultaSeries('Q1366112');
  assert.match(q, /VALUES \?g \{ wd:Q1366112 \}/);
  assert.match(q, /wdt:P31\/wdt:P279\* wd:Q5398426/);
  assert.match(q, /\?s wdt:P580 \?inicio \./);
  assert.match(q, /FILTER\(\?sl >= 20\)/);
  assert.throws(() => montarConsultaSeries('Q1; DROP'));
});

test('AC-11: Série sem P580 fora', () => {
  const linhas = [linha('Q1', 'Q1366112'), linha('Q2', 'Q1366112'), linha('Q3', 'Q343782'), { ...linha('Q4', 'Q1366112'), inicio: undefined }];
  const series = mesclarLinhas(linhas, { qidsTabela: QIDS });
  assert.deepEqual(series.map((s) => s.qid), ['Q1', 'Q2', 'Q3']);
});

test('AC-11: mesclarLinhas junta gêneros, menor P580, maior P582, maiores P2437/P1113, menor P4983 e imdb válido', () => {
  const linhas = [
    linha('Q1', 'Q9335577', { inicio: v('2010-05-01T00:00:00Z'), fim: v('2013-01-01T00:00:00Z'), temp: v(2), ep: v(20), tmdb: v(500), imdb: v('tt1234567'), sl: v(50) }),
    linha('Q1', 'Q1366112', { inicio: v('2008-01-20T00:00:00Z'), fim: v('2015-01-01T00:00:00Z'), temp: v(5), ep: v(0), tmdb: v(300), imdb: v('ttxx'), sl: v(103), ten: v('Show') }),
    linha('Q5', 'Q999', {}),
    { ...linha('Q6', 'Q1366112'), tpt: undefined },
  ];
  const [s, ...resto] = mesclarLinhas(linhas, { qidsTabela: QIDS });
  assert.equal(resto.length, 0);
  assert.deepEqual(s.generos, ['Q1366112', 'Q9335577']);
  assert.equal(s.anoInicio, 2008);
  assert.equal(s.anoFimWd, 2015);
  assert.equal(s.temporadasWd, 5);
  assert.equal(s.episodiosWd, 20);
  assert.equal(s.tmdbId, 300);
  assert.equal(s.imdb, 'tt1234567');
  assert.equal(s.sitelinks, 103);
  assert.equal(s.en, 'Show');
});

const base = (extra = {}) => ({ qid: 'Q1079', pt: 'Breaking Bad', en: null, anoInicio: 2008, anoFimWd: null, temporadasWd: null, episodiosWd: null, tmdbId: 1396, imdb: 'tt0903747', generos: ['Q1366112', 'Q9335577'], sitelinks: 103, ...extra });
const tmdb = (extra = {}) => ({ name: 'Liberdade Vigiada', originalName: 'Breaking Bad', status: 'Ended', temporadas: 5, episodios: 62, ultimaExibicao: '2013-09-29', keywords: [], ...extra });

test('AC-11: Três casos de título', () => {
  const a = aplicarTmdb(base(), tmdb());
  assert.equal(a.titulo, 'Liberdade Vigiada');
  assert.equal(a.tituloOriginal, 'Breaking Bad');
  const b = aplicarTmdb(base({ pt: 'Friends' }), tmdb({ name: 'Friends', originalName: 'Friends' }));
  assert.equal(b.titulo, 'Friends');
  assert.ok(!('tituloOriginal' in b));
  const c = aplicarFallback(base({ pt: 'Firefly', imdb: null, tmdbId: 7 }));
  assert.equal(c.titulo, 'Firefly');
  assert.ok(!('tituloOriginal' in c));
  assert.equal(c.tmdbId, null);
});

test('AC-11: Status do TMDB prevalece sobre P582', () => {
  const a = aplicarTmdb(base({ anoFimWd: 2020 }), tmdb({ status: 'Returning Series', ultimaExibicao: '2023-01-01' }));
  assert.equal(a.situacao, 'em-andamento');
  assert.equal(a.anoFim, null);
  for (const status of ['In Production', 'Planned', 'Pilot']) assert.equal(aplicarTmdb(base(), tmdb({ status })).situacao, 'em-andamento', status);
  assert.equal(aplicarTmdb(base(), tmdb({ status: 'Rumored' })).situacao, null);
  assert.equal(situacaoDoStatus('Canceled'), 'cancelada');
  assert.equal(situacaoDoStatus('Ended'), 'finalizada');
  assert.equal(situacaoDoStatus(null), null);
});

test('AC-11: Fontes do ano de fim', () => {
  assert.equal(aplicarTmdb(base(), tmdb({ status: 'Ended', ultimaExibicao: '2013-09-29' })).anoFim, 2013);
  assert.equal(aplicarTmdb(base({ anoInicio: 2000, anoFimWd: 2004 }), tmdb({ status: 'Ended', ultimaExibicao: null })).anoFim, 2004);
  assert.equal(aplicarTmdb(base(), tmdb({ status: 'Canceled', ultimaExibicao: null })).anoFim, null);
  assert.equal(aplicarTmdb(base({ anoInicio: 1995, anoFimWd: 1990 }), tmdb({ status: 'Ended', ultimaExibicao: null })).anoFim, null);
});

test('AC-11: TMDB sem temporadas', () => {
  const a = aplicarTmdb(base({ temporadasWd: 3, episodiosWd: 71 }), tmdb({ temporadas: null, episodios: 0 }));
  assert.equal(a.temporadas, 3);
  assert.equal(a.episodios, 71);
  const b = aplicarTmdb(base(), tmdb({ temporadas: null, episodios: null }));
  assert.equal(b.temporadas, null);
  assert.equal(b.episodios, null);
});

test('AC-11: Fallback do Wikidata', () => {
  const a = aplicarFallback(base({ pt: 'A', anoFimWd: 2010, anoInicio: 2000 }));
  assert.equal(a.situacao, 'finalizada');
  assert.equal(a.anoFim, 2010);
  const b = aplicarFallback(base({ pt: 'B' }));
  assert.equal(b.situacao, 'em-andamento');
  assert.equal(b.anoFim, null);
  const c = aplicarFallback(base({ pt: 'C', temporadasWd: 2, episodiosWd: 20 }));
  assert.equal(c.temporadas, 2);
  assert.equal(c.episodios, 20);
  for (const x of [a, b, c]) assert.equal(x.tmdbId, null);
});

test('AC-11: item de série sem chave de nota nem de prêmio e com campos opcionais só com valor', () => {
  const a = aplicarTmdb(base({ imdb: null }), tmdb({ originalName: 'Liberdade Vigiada' }));
  assert.ok(!('imdb' in a) && !('tituloOriginal' in a));
  for (const k of Object.keys(a)) assert.ok(!/^(nota|oscar|emmy)/.test(k), k);
});

// ---- montarSeries (tarefa 3.3) ----
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { montarSeries, tagsDaSerie } from '../scripts/lib/series.mjs';
import { criarClienteSeries } from '../scripts/lib/series-tmdb.mjs';

const lerJson = (rel) => JSON.parse(readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8'));
const tabelaSeries = lerJson('data/humores-series.json');
const climaSeries = lerJson('data/clima-series.json');
const temas = lerJson('data/temas.json');
const shaTemas = () => createHash('sha256').update(readFileSync(new URL('../data/temas.json', import.meta.url))).digest('hex');
const resp = (corpo, status = 200) => ({ ok: status < 300, status, headers: { get: () => null }, json: async () => corpo });

// tmdb: { id: corpo | número (status) | Error }
function cliente(tmdbPorId) {
  const urls = [];
  const fetch = async (url) => {
    urls.push(url);
    const id = Number(/\/tv\/(\d+)/.exec(url)[1]);
    const r = tmdbPorId[id];
    if (r instanceof Error) throw r;
    if (typeof r === 'number') return resp({}, r);
    return resp(r);
  };
  return { cliente: criarClienteSeries({ token: 'tok-teste-123', fetch, esperar: async () => {} }), urls };
}
const corpoTv = (extra = {}) => ({ name: 'S', original_name: 'S', status: 'Ended', number_of_seasons: 1, number_of_episodes: 10, last_air_date: '2012-01-01', keywords: { results: [] }, ...extra });
const montar = (linhas, tmdb, extra = {}) => {
  const c = cliente(tmdb);
  return montarSeries({ linhas, tabela: tabelaSeries, clima: climaSeries, temas, cliente: c.cliente, ...extra }).then((r) => ({ ...r, urls: c.urls }));
};

test('AC-11: Contagem de chamadas', async () => {
  const linhas = [linha('Q1', 'Q1366112', { tmdb: v(11) }), linha('Q2', 'Q1366112', { tmdb: v(12) }), linha('Q3', 'Q343782', { tmdb: v(13) }), linha('Q4', 'Q343782')];
  const { contagens, urls, series } = await montar(linhas, { 11: corpoTv(), 12: corpoTv(), 13: corpoTv() });
  assert.equal(series.length, 4);
  assert.equal(urls.length, 3);
  assert.equal(contagens.chamadasTmdb, 3);
  assert.equal(contagens.semTmdbId, 1);
  assert.equal(contagens.fallbackWikidata, 0);
  assert.ok(urls.every((u) => /\/tv\/1[123]\?/.test(u)));
});

test('AC-11: Três séries de fixture', async () => {
  const linhas = [
    linha('Q1079', 'Q9335577', { tmdb: v(1396), imdb: v('tt0903747'), sl: v(103), inicio: v('2008-01-20T00:00:00Z') }),
    linha('Q1079', 'Q1366112', { tmdb: v(1396), sl: v(103) }),
    linha('Q1', 'Q1366112', { tmdb: v(1437), sl: v(60), inicio: v('2002-09-20T00:00:00Z') }),
    linha('Q2', 'Q343782', { tmdb: v(77), sl: v(40), inicio: v('2015-01-01T00:00:00Z') }),
  ];
  const { series } = await montar(linhas, {
    1396: corpoTv({ name: 'Breaking Bad', original_name: 'Breaking Bad', number_of_seasons: 5, number_of_episodes: 62, last_air_date: '2013-09-29' }),
    1437: corpoTv({ status: 'Canceled', number_of_seasons: 1, number_of_episodes: 11, last_air_date: '2003-02-01' }),
    77: corpoTv({ status: 'Returning Series', last_air_date: '2024-01-01' }),
  });
  const [bb, ff, nova] = series;
  assert.deepEqual(bb, {
    qid: 'Q1079', titulo: 'Breaking Bad', anoInicio: 2008, anoFim: 2013, situacao: 'finalizada', temporadas: 5, episodios: 62,
    generos: ['Q1366112', 'Q9335577'], sitelinks: 103, tmdbId: 1396, imdb: 'tt0903747',
  });
  assert.equal(ff.situacao, 'cancelada');
  assert.equal(ff.temporadas, 1);
  assert.equal(ff.episodios, 11);
  assert.equal(nova.situacao, 'em-andamento');
  assert.equal(nova.anoFim, null);
  for (const s of series) for (const k of Object.keys(s)) assert.ok(!/^(nota|oscar|emmy)/.test(k), k);
});

test('AC-11: Fallback do Wikidata na montagem, sem lançar', async () => {
  const linhas = [
    linha('Q1', 'Q1366112', { tmdb: v(1), fim: v('2010-01-01T00:00:00Z'), tpt: v('Firefly'), sl: v(90) }),
    linha('Q2', 'Q1366112', { tmdb: v(2), tpt: v('Dois'), sl: v(80) }),
    linha('Q3', 'Q1366112', { tmdb: v(3), temp: v(2), ep: v(20), tpt: v('Três'), sl: v(70) }),
  ];
  const { series, contagens } = await montar(linhas, { 1: 404, 2: 500, 3: new Error('rede') });
  assert.deepEqual(series.map((s) => s.situacao), ['finalizada', 'em-andamento', 'em-andamento']);
  assert.equal(series[2].temporadas, 2);
  assert.equal(series[2].episodios, 20);
  assert.deepEqual(series.map((s) => s.titulo), ['Firefly', 'Dois', 'Três']);
  assert.ok(series.every((s) => s.tmdbId === null));
  assert.equal(contagens.fallbackWikidata, 3);
});

test('AC-11: Palavras-chave em results geram tag; array no formato de filme não, e temas.json não muda', async () => {
  const antes = shaTemas();
  const witch = temas.temas.find((t) => t.keywords.includes('witch')).id;
  const linhas = [linha('Q1', 'Q1366112', { tmdb: v(1), sl: v(90) }), linha('Q2', 'Q1366112', { tmdb: v(2), sl: v(80) })];
  const tmdb = { 1: corpoTv({ keywords: { results: [{ name: 'witch' }] } }), 2: corpoTv({ keywords: [{ name: 'witch' }] }) };
  // limiar 20 zera as tags de 1 série; por isso a verificação é feita com tagsDaSerie e com 20 séries abaixo.
  assert.deepEqual(tagsDaSerie({ keywords: ['witch'], generos: ['Q1366112'], temas, clima: climaSeries }).tags, [witch]);
  assert.deepEqual(tagsDaSerie({ keywords: [], generos: ['Q1366112'], temas, clima: climaSeries }).tags, []);
  const muitas = Array.from({ length: 20 }, (_, i) => linha(`Q${100 + i}`, 'Q1366112', { tmdb: v(100 + i), sl: v(50) }));
  const tmdbMuitas = Object.fromEntries(muitas.map((l, i) => [100 + i, corpoTv({ keywords: { results: [{ name: 'witch' }] } })]));
  const r = await montar([...linhas, ...muitas], { ...tmdb, ...tmdbMuitas });
  const q1 = r.series.find((s) => s.qid === 'Q1');
  const q2 = r.series.find((s) => s.qid === 'Q2');
  assert.deepEqual(q1.tags, [witch]);
  assert.ok(!('tags' in q2));
  assert.equal(shaTemas(), antes);
});

test('AC-11: Limiar e lista de tags em meta', async () => {
  const [ta, tb] = temas.temas.filter((t) => !t.clima).slice(0, 2);
  const kA = ta.keywords[0];
  const kB = tb.keywords[0];
  const mk = (i, k) => linha(`Q${200 + i}`, 'Q1366112', { tmdb: v(200 + i), sl: v(50) , _k: k });
  const linhas = [];
  const tmdb = {};
  for (let i = 0; i < 20; i++) { linhas.push(mk(i, kA)); tmdb[200 + i] = corpoTv({ keywords: { results: [{ name: kA }] } }); }
  for (let i = 20; i < 39; i++) { linhas.push(mk(i, kB)); tmdb[200 + i] = corpoTv({ keywords: { results: [{ name: kB }] } }); }
  const { series, lista } = await montar(linhas, tmdb);
  const comA = series.filter((s) => s.tags?.includes(ta.id)).length;
  const comB = series.filter((s) => s.tags?.includes(tb.id)).length;
  assert.equal(comA, 20);
  assert.equal(comB, 0);
  const itemA = lista.find((t) => t.id === ta.id);
  assert.deepEqual(itemA, { id: ta.id, rotulo: ta.rotulo, filmes: 20 });
  assert.ok(!lista.some((t) => t.id === tb.id));
});

test('AC-11: série sem P4983 não chama o TMDB, e o prazo (agora >= limite) para antes de cada envio', async () => {
  const linhas = [linha('Q1', 'Q1366112', { tmdb: v(1) }), linha('Q2', 'Q1366112', { tmdb: v(2) })];
  let t = 0;
  await assert.rejects(
    montar(linhas, { 1: corpoTv(), 2: corpoTv() }, { agora: () => (t += 100), limite: 150 }),
    (e) => e.invariante === 'prazo',
  );
});

test('AC-11: generos em ordem crescente do número do QID e série em ordem de sitelinks e QID', async () => {
  const linhas = [linha('Q9', 'Q9335577', { sl: v(30) }), linha('Q9', 'Q1366112', { sl: v(30) }), linha('Q8', 'Q1366112', { sl: v(30) }), linha('Q7', 'Q1366112', { sl: v(99) })];
  const { series } = await montar(linhas, {});
  assert.deepEqual(series.map((s) => s.qid), ['Q7', 'Q8', 'Q9']);
  assert.deepEqual(series[2].generos, ['Q1366112', 'Q9335577']);
});

// ---- validarSeries (tarefa 3.4) ----
import { validarSeries } from '../scripts/lib/series.mjs';

const GENEROS = tabelaSeries.humores.flatMap((h) => h.generos.map((g) => g.qid));
// 1.000 séries: 10 por gênero sobrando, todas com campos preenchidos.
function seriesValidas(n = 1000) {
  return Array.from({ length: n }, (_, i) => ({
    qid: `Q${i + 1}`, titulo: `S${i}`, anoInicio: 2000, anoFim: null, situacao: 'finalizada', temporadas: 1, episodios: 1,
    generos: [GENEROS[i % GENEROS.length]], sitelinks: 30, tmdbId: i + 1,
  }));
}
const invariantes = (r) => r.map((e) => e.invariante);

test('AC-11: validarSeries aceita 1.000 séries válidas', () => {
  assert.deepEqual(validarSeries({ tabela: tabelaSeries, series: seriesValidas(), bytes: 400000 }), []);
});

test('AC-11: cada invariante isolado', () => {
  const t = tabelaSeries;
  assert.deepEqual(invariantes(validarSeries({ tabela: t, series: seriesValidas(999), bytes: 1 })), ['total-minimo']);
  assert.deepEqual(invariantes(validarSeries({ tabela: t, series: seriesValidas(), bytes: 600001 })), ['tamanho-maximo']);
  assert.deepEqual(invariantes(validarSeries({ tabela: t, series: seriesValidas(), bytes: 600000 })), []);
  // mínimo por gênero: 9 séries do primeiro gênero (as demais trocadas para outro gênero do mesmo humor)
  let s = seriesValidas();
  const alvo = GENEROS[0];
  const outro = GENEROS[1];
  let mantidas = 0;
  s = s.map((x) => (x.generos[0] === alvo && ++mantidas > 9 ? { ...x, generos: [outro] } : x));
  assert.deepEqual(invariantes(validarSeries({ tabela: t, series: s, bytes: 1 })), ['minimo-por-genero']);
  // mínimo por humor: humor "medo" (1 gênero) com 39
  const medo = t.humores.find((h) => h.id === 'medo').generos[0].qid;
  let c = 0;
  const s2 = seriesValidas(2000).map((x) => (x.generos[0] === medo && ++c > 39 ? { ...x, generos: [GENEROS[0]] } : x));
  const r2 = invariantes(validarSeries({ tabela: t, series: s2, bytes: 1 }));
  assert.ok(r2.includes('minimo-por-humor'));
  // coberturas
  for (const [campo, inv] of [['situacao', 'cobertura-situacao'], ['temporadas', 'cobertura-temporadas'], ['episodios', 'cobertura-episodios']]) {
    const x = seriesValidas().map((e, i) => (i < 60 ? { ...e, [campo]: null } : e));
    assert.deepEqual(invariantes(validarSeries({ tabela: t, series: x, bytes: 1 })), [inv]);
  }
  // ano-inicio
  const y = seriesValidas().map((e, i) => (i === 0 ? { ...e, anoInicio: null } : e));
  assert.deepEqual(invariantes(validarSeries({ tabela: t, series: y, bytes: 1 })), ['ano-inicio']);
});

test('AC-12: limite de cobertura: 94% reprova e 95% passa', () => {
  const noventaECinco = seriesValidas().map((e, i) => (i < 950 ? e : { ...e, situacao: null }));
  const noventaEQuatro = seriesValidas().map((e, i) => (i < 940 ? e : { ...e, situacao: null }));
  assert.deepEqual(validarSeries({ tabela: tabelaSeries, series: noventaECinco, bytes: 1 }), []);
  assert.deepEqual(invariantes(validarSeries({ tabela: tabelaSeries, series: noventaEQuatro, bytes: 1 })), ['cobertura-situacao']);
});
