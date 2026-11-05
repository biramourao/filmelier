import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarWorker } from '../worker/index.mjs';

const ORIGEM = 'http://127.0.0.1:8765';
const ENV = { ORIGENS_PERMITIDAS: ORIGEM, TMDB_TOKEN: 'tok-teste-123' };
const mudo = { log() {}, warn() {}, error() {} };
const OK_BR = { results: { BR: { link: 'https://www.themoviedb.org/x', flatrate: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/n.jpg', display_priority: 1 }] } } };

function tmdb(responder = () => ({ status: 404, corpo: {} })) {
  const chamadas = [];
  const fetchImpl = async (url, opcoes) => {
    chamadas.push({ url, opcoes });
    const r = await responder(new URL(url), opcoes, chamadas.length);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, headers: { get: (n) => r.headers?.[n] ?? null }, json: async () => r.corpo };
  };
  return { fetchImpl, chamadas };
}
const novoWorker = (sim, extras = {}) => criarWorker({ fetchImpl: sim.fetchImpl, logger: mudo, esperar: () => new Promise(() => {}), ...extras });
const pedir = (worker, caminho, { origem = ORIGEM } = {}) =>
  worker.fetch(new Request(`https://filmelier-provedores.exemplo.workers.dev${caminho}`, { headers: origem === null ? {} : { Origin: origem } }), ENV);
// Rotas de filme: /find devolve o filme 597 e /movie/597/watch/providers devolve OK_BR.
const simFilme = () => tmdb((u) => (u.pathname.startsWith('/3/find/') ? { status: 200, corpo: { movie_results: [{ id: 597, title: 'Titanic', original_title: 'Titanic' }] } } : { status: 200, corpo: OK_BR }));

test('AC-14: Sem tipo e tipo=filme idênticos a hoje', async () => {
  const resultados = [];
  for (const sufixo of ['', '&tipo=', '&tipo=filme', '&tipo=filme&tmdb=1396']) {
    const sim = simFilme();
    const r = await pedir(novoWorker(sim), `/providers?qids=Q1${sufixo}`);
    resultados.push({ status: r.status, corpo: await r.json(), urls: sim.chamadas.map((c) => c.url) });
  }
  for (const x of resultados.slice(1)) assert.deepEqual(x, resultados[0]);
  assert.equal(resultados[0].status, 200);
  assert.deepEqual(resultados[0].urls, [
    'https://api.themoviedb.org/3/find/Q1?external_source=wikidata_id&language=pt-BR',
    'https://api.themoviedb.org/3/movie/597/watch/providers',
  ]);
});

test('AC-14: Tipo fora da lista fechada', async () => {
  for (const tipo of ['tv', 'Serie', 'filme,serie']) {
    const sim = simFilme();
    const r = await pedir(novoWorker(sim), `/providers?qids=Q1&tipo=${encodeURIComponent(tipo)}`);
    assert.equal(r.status, 400, tipo);
    assert.equal(await r.text(), '{"erro":"parametros"}');
    assert.equal(sim.chamadas.length, 0);
  }
});

test('AC-14: tmdb inválido com tipo=serie', async () => {
  for (const tmdb of [null, '', '1396,abc', '1396', '1396,0', '1396,1668,1437']) {
    const sim = simFilme();
    const extra = tmdb === null ? '' : `&tmdb=${tmdb}`;
    const r = await pedir(novoWorker(sim), `/providers?qids=Q1,Q2&tipo=serie${extra}`);
    assert.equal(r.status, 400, String(tmdb));
    assert.equal(await r.text(), '{"erro":"parametros"}');
    assert.equal(sim.chamadas.length, 0);
  }
});

test('AC-14: a ordem 405, 404, 403, 400 vale para séries', async () => {
  const sim = simFilme();
  const w = novoWorker(sim);
  assert.equal((await pedir(w, '/providers?qids=Q1&tipo=serie', { origem: 'https://evil.example' })).status, 403);
  assert.equal((await pedir(w, '/x?qids=Q1&tipo=serie')).status, 404);
  assert.equal(sim.chamadas.length, 0);
});

// ---- tarefa 5.2: resolução de séries ----
const simSerie = (extra = {}) => tmdb((u) => {
  const m = /^\/3\/tv\/(\d+)\/watch\/providers$/.exec(u.pathname);
  if (m && extra[m[1]]) return extra[m[1]];
  return m ? { status: 200, corpo: OK_BR } : { status: 404, corpo: {} };
});
const comLog = (sim, extras = {}) => {
  const linhas = [];
  return { linhas, w: criarWorker({ fetchImpl: sim.fetchImpl, logger: { log: (l) => linhas.push(l) }, esperar: () => new Promise(() => {}), ...extras }) };
};

test('AC-14: Série resolvida pelo ID de TV', async () => {
  const sim = simSerie();
  const r = await pedir(novoWorker(sim), '/providers?qids=Q1079&tipo=serie&tmdb=1396');
  assert.equal(r.status, 200);
  assert.deepEqual(sim.chamadas.map((c) => c.url), ['https://api.themoviedb.org/3/tv/1396/watch/providers']);
  const { Q1079 } = (await r.json()).resultados;
  assert.equal(Q1079.status, 'ok');
  assert.equal(Q1079.flatrate.length, 1);
  assert.ok(!('titulo' in Q1079) && !('tituloOriginal' in Q1079));
  assert.ok(!sim.chamadas.some((c) => c.url.includes('/find/')));
});

test('AC-14: ID de TV inexistente', async () => {
  const sim = simSerie({ 999999: { status: 404, corpo: {} } });
  const r = await pedir(novoWorker(sim), '/providers?qids=Q1&tipo=serie&tmdb=999999');
  assert.deepEqual((await r.json()).resultados.Q1, { status: 'sem-tmdb' });
});

test('AC-14: Mesmo QID como filme e como série', async () => {
  const cache = new Map();
  const sim = tmdb((u) => (u.pathname.startsWith('/3/find/') ? { status: 200, corpo: { movie_results: [{ id: 597 }] } } : { status: 200, corpo: OK_BR }));
  const linhas = [];
  const w = criarWorker({ cache, fetchImpl: sim.fetchImpl, logger: { log: (l) => linhas.push(JSON.parse(l)) }, esperar: () => new Promise(() => {}) });
  await pedir(w, '/providers?qids=Q1');
  const aposFilme = sim.chamadas.length;
  assert.equal(aposFilme, 2);
  assert.deepEqual([...cache.keys()], ['Q1|']);
  await pedir(w, '/providers?qids=Q1&tipo=serie&tmdb=1396');
  assert.equal(sim.chamadas.length, 3);
  assert.deepEqual([...cache.keys()].sort(), ['Q1|', 'serie|Q1|1396']);
  await pedir(w, '/providers?qids=Q1&tipo=serie&tmdb=1396');
  assert.equal(sim.chamadas.length, 3);
  assert.equal(linhas.at(-1).acertosCache, 1);
  assert.equal(linhas.at(-1).chamadasTmdb, 0);
});

test('AC-14: Linha de série com 7 chaves, e a de filme com 6', async () => {
  const sim = simSerie();
  const { linhas, w } = comLog(sim);
  const req = (caminho) => new Request(`https://filmelier-provedores.exemplo.workers.dev${caminho}`, { headers: { Origin: ORIGEM, 'cf-connecting-ip': '203.0.113.7', Cookie: 'sessao=abc' } });
  await w.fetch(req('/providers?qids=Q1&tipo=serie&tmdb=1396'), ENV);
  assert.equal(linhas.length, 1);
  const linha = JSON.parse(linhas[0]);
  assert.deepEqual(Object.keys(linha).sort(), ['acertosCache', 'chamadasTmdb', 'duracaoMs', 'http', 'qids', 'status', 'tipo']);
  assert.equal(linha.tipo, 'serie');
  assert.equal(linha.chamadasTmdb, 1);
  for (const proibido of ['tok-teste-123', '203.0.113.7', ORIGEM, 'sessao=abc']) assert.ok(!linhas[0].includes(proibido), proibido);
  // recusa de tipo inválido: 6 chaves e http 400
  await w.fetch(req('/providers?qids=Q1&tipo=tv'), ENV);
  const recusada = JSON.parse(linhas[1]);
  assert.equal(recusada.http, 400);
  assert.ok(!('tipo' in recusada));
});

test('AC-14: Cinco séries: exatamente 5 chamadas, todas a /tv/{id}/watch/providers', async () => {
  const sim = simSerie();
  const ids = [11, 22, 33, 44, 55];
  const r = await pedir(novoWorker(sim), `/providers?qids=Q1,Q2,Q3,Q4,Q5&tipo=serie&tmdb=${ids.join(',')}`);
  assert.equal(r.status, 200);
  assert.equal(sim.chamadas.length, 5);
  assert.deepEqual(sim.chamadas.map((c) => new URL(c.url).pathname).sort(), ids.map((i) => `/3/tv/${i}/watch/providers`).sort());
});

test('AC-14: 429 em série: limite, retryAfter e suspensão sem nova chamada', async () => {
  let t = 1_000_000;
  const sim = simSerie({ 11: { status: 429, corpo: {}, headers: { 'Retry-After': '20' } } });
  const w = novoWorker(sim, { agora: () => t });
  const r = await pedir(w, '/providers?qids=Q1,Q2&tipo=serie&tmdb=11,22');
  const corpo = await r.json();
  assert.equal(corpo.resultados.Q1.status, 'limite');
  assert.equal(corpo.retryAfter, 20);
  const antes = sim.chamadas.length;
  t += 10_000;
  const r2 = await pedir(w, '/providers?qids=Q3&tipo=serie&tmdb=33');
  assert.equal(sim.chamadas.length, antes);
  assert.equal((await r2.json()).resultados.Q3.status, 'limite');
});
