import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarUrlLote, criarProvedores } from '../src/provedores.mjs';

const WORKER = 'https://filmelier-provedores.exemplo.workers.dev';
const mudo = { warn() {}, error() {} };
const resposta = (corpo) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => corpo });
const OK = { status: 'ok', link: 'https://www.themoviedb.org/tv/1/watch?locale=BR', flatrate: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/n.jpg', display_priority: 1 }], rent: [], buy: [], ads: [], free: [] };
function espiao() {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    const qids = new URL(url).searchParams.get('qids').split(',');
    return resposta({ resultados: Object.fromEntries(qids.map((q) => [q, OK])) });
  };
  return { fetchImpl, urls };
}
const itens = (...pares) => pares.map(([qid, tmdb, imdb]) => ({ qid, imdb: imdb ?? null, tmdb }));

test('AC-10: URL do lote de séries só com qids, imdb, tipo e tmdb, na ordem', async () => {
  const sp = espiao();
  const cliente = criarProvedores({ urlWorker: WORKER, fetchImpl: sp.fetchImpl, logger: mudo, tipo: 'serie' });
  await cliente.buscar(itens(['Q1', 1396, 'tt0903747'], ['Q2', 1668], ['Q3', 1437]));
  assert.equal(sp.urls.length, 1);
  const u = new URL(sp.urls[0]);
  assert.equal(u.origin + u.pathname, `${WORKER}/providers`);
  assert.deepEqual([...u.searchParams.keys()].sort(), ['imdb', 'qids', 'tipo', 'tmdb']);
  assert.equal(u.searchParams.get('tipo'), 'serie');
  assert.equal(u.searchParams.get('qids'), 'Q1,Q2,Q3');
  assert.equal(u.searchParams.get('tmdb'), '1396,1668,1437');
  assert.equal(u.searchParams.get('imdb'), 'Q1:tt0903747');
});

test('AC-10: sem par de imdb válido a URL de séries não tem imdb', () => {
  const u = new URL(montarUrlLote(WORKER, itens(['Q1', 1], ['Q2', 2]), 'serie'));
  assert.deepEqual([...u.searchParams.keys()], ['qids', 'tipo', 'tmdb']);
});

test('AC-10: Uma série sem tmdbId fica fora do lote e resolve como sem dados', async () => {
  const sp = espiao();
  const cliente = criarProvedores({ urlWorker: WORKER, fetchImpl: sp.fetchImpl, logger: mudo, tipo: 'serie' });
  const mapa = await cliente.buscar(itens(['Q1', 11], ['Q2', null], ['Q3', 33]));
  assert.equal(sp.urls.length, 1);
  const u = new URL(sp.urls[0]);
  assert.equal(u.searchParams.get('qids'), 'Q1,Q3');
  assert.equal(u.searchParams.get('tmdb'), '11,33');
  assert.equal(mapa.get('Q2'), null);
  assert.equal(mapa.get('Q1').status, 'ok');
  for (const ruim of [undefined, 0, -3, 1.5, '12']) {
    const s2 = espiao();
    const c2 = criarProvedores({ urlWorker: WORKER, fetchImpl: s2.fetchImpl, logger: mudo, tipo: 'serie' });
    await c2.buscar([{ qid: 'Q9', imdb: null, tmdb: ruim }, { qid: 'Q8', imdb: null, tmdb: 5 }]);
    assert.equal(new URL(s2.urls[0]).searchParams.get('qids'), 'Q8', String(ruim));
  }
});

test('AC-10: Nenhuma série com tmdbId: 0 chamadas e todas sem dados', async () => {
  const sp = espiao();
  const cliente = criarProvedores({ urlWorker: WORKER, fetchImpl: sp.fetchImpl, logger: mudo, tipo: 'serie' });
  const mapa = await cliente.buscar(itens(['Q1', null], ['Q2', null]));
  assert.equal(sp.urls.length, 0);
  assert.deepEqual([...mapa.entries()], [['Q1', null], ['Q2', null]]);
});

test('AC-10: Cache por tipo no cliente: Q1 ok em filmes e depois pedido em séries faz 1 chamada', async () => {
  const sp = espiao();
  const filmes = criarProvedores({ urlWorker: WORKER, fetchImpl: sp.fetchImpl, logger: mudo });
  const series = criarProvedores({ urlWorker: WORKER, fetchImpl: sp.fetchImpl, logger: mudo, tipo: 'serie' });
  await filmes.buscar([{ qid: 'Q1', imdb: null }]);
  assert.equal(sp.urls.length, 1);
  assert.deepEqual([...new URL(sp.urls[0]).searchParams.keys()], ['qids']);
  await series.buscar(itens(['Q1', 77]));
  assert.equal(sp.urls.length, 2);
  assert.equal(new URL(sp.urls[1]).searchParams.get('tipo'), 'serie');
  await series.buscar(itens(['Q1', 77]));
  assert.equal(sp.urls.length, 2);
});

test('AC-20: URL de filmes continua sem tipo e sem tmdb', () => {
  const u = new URL(montarUrlLote(WORKER, [{ qid: 'Q1', imdb: 'tt0120338', tmdb: 5 }]));
  assert.deepEqual([...u.searchParams.keys()], ['qids', 'imdb']);
});
