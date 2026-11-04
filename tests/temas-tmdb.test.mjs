import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarClienteTmdb, buscarKeywords, exigirToken, esperaRetryAfter } from '../scripts/lib/temas.mjs';
import { ErroBuild } from '../scripts/lib/wdqs.mjs';

const TOKEN = 'tok-teste-123';
// Literais de autorização montados por fragmentos (design D-11).
const CABECALHO = ['Author', 'ization'].join('');
const ESQUEMA = ['Bear', 'er'].join('');
const CHAVE_NA_URL = ['api', '_key'].join('');

const json = (corpo, status = 200, cabecalhos = {}) => ({
  ok: status >= 200 && status < 300, status, headers: { get: (n) => cabecalhos[n.toLowerCase()] ?? null }, json: async () => corpo,
});
const kw = (...nomes) => ({ keywords: nomes.map((name, id) => ({ id, name })) });
const montar = (respostas, extra = {}) => {
  const chamadas = [];
  const esperas = [];
  let i = 0;
  const fetch = async (url, init) => {
    chamadas.push({ url, init });
    const r = respostas[Math.min(i, respostas.length - 1)];
    i += 1;
    if (r instanceof Error) throw r;
    return r;
  };
  const cliente = criarClienteTmdb({ token: TOKEN, fetch, esperar: async (ms) => { esperas.push(ms); }, ...extra });
  return { cliente, chamadas, esperas };
};

test('AC-7: token ausente, vazio ou só espaços lança tmdb-token sem chamar o fetch', () => {
  for (const token of [undefined, '', '   ']) {
    let chamadas = 0;
    assert.throws(
      () => criarClienteTmdb({ token, fetch: async () => { chamadas += 1; }, esperar: async () => {} }),
      (e) => e instanceof ErroBuild && e.invariante === 'tmdb-token',
    );
    assert.equal(chamadas, 0);
  }
  assert.throws(() => exigirToken(undefined), (e) => e.invariante === 'tmdb-token');
});

test('AC-7: HTTP 401 e HTTP 403 abortam na 1ª resposta com tmdb-autorizacao', async () => {
  for (const status of [401, 403]) {
    const { cliente, chamadas } = montar([json({}, status)]);
    await assert.rejects(cliente.pedir('/movie/1/keywords'), (e) => e instanceof ErroBuild && e.invariante === 'tmdb-autorizacao');
    assert.equal(chamadas.length, 1);
  }
});

test('AC-7: HTTP 429 espera o Retry-After (7 s = 7.000 ms) e tenta de novo o mesmo filme', async () => {
  const { cliente, chamadas, esperas } = montar([json({}, 429, { 'retry-after': '7' }), json(kw('witch'))]);
  const r = await buscarKeywords(cliente, 671);
  assert.deepEqual(r, { ok: true, keywords: ['witch'] });
  assert.deepEqual(esperas, [7000]);
  assert.equal(chamadas.length, 2);
  assert.ok(chamadas.every((c) => c.url.endsWith('/movie/671/keywords')));
});

test('AC-7: Retry-After acima de 60 vira 60.000 e ausente ou inválido vira 10.000', () => {
  assert.equal(esperaRetryAfter('7'), 7000);
  assert.equal(esperaRetryAfter('0'), 0);
  assert.equal(esperaRetryAfter('60'), 60000);
  assert.equal(esperaRetryAfter('3600'), 60000);
  assert.equal(esperaRetryAfter(undefined), 10000);
  assert.equal(esperaRetryAfter('amanhã'), 10000);
  assert.equal(esperaRetryAfter('-3'), 10000);
});

test('AC-7: 429 conta como tentativa (3 respostas 429 esgotam)', async () => {
  const { cliente, chamadas } = montar([json({}, 429)]);
  const r = await cliente.pedir('/movie/1/keywords');
  assert.equal(r.ok, false);
  assert.equal(chamadas.length, 3);
});

test('AC-7: 504 constante esgota 3 tentativas com esperas de 2.000 e 4.000 ms', async () => {
  const { cliente, chamadas, esperas } = montar([json({}, 504)]);
  const r = await buscarKeywords(cliente, 5);
  assert.deepEqual(r, { ok: false, motivo: 'http-504' });
  assert.equal(chamadas.length, 3);
  assert.deepEqual(esperas, [2000, 4000]);
});

test('AC-7: erro de rede e timeout também têm 3 tentativas', async () => {
  const { cliente, chamadas } = montar([new TypeError('fetch failed')]);
  assert.equal((await cliente.pedir('/x')).ok, false);
  assert.equal(chamadas.length, 3);
  const erroTimeout = Object.assign(new Error('t'), { name: 'TimeoutError' });
  const t = montar([erroTimeout]);
  assert.deepEqual(await t.cliente.pedir('/x'), { ok: false, motivo: 'rede: timeout' });
});

test('AC-7: 404 em /keywords é "não encontrado" com 1 só requisição', async () => {
  const { cliente, chamadas } = montar([json({}, 404)]);
  assert.deepEqual(await buscarKeywords(cliente, 9), { ok: false, naoEncontrado: true });
  assert.equal(chamadas.length, 1);
});

test('AC-8: cabeçalho de acesso com o token, Accept json, sem chave nem token na URL, sinal de 10.000 ms', async () => {
  const pedidos = [];
  const { cliente, chamadas } = montar([json(kw())], { criarSinal: (ms) => { pedidos.push(ms); return AbortSignal.timeout(ms); } });
  await buscarKeywords(cliente, 42);
  const { url, init } = chamadas[0];
  assert.equal(init.headers[CABECALHO], `${ESQUEMA} ${TOKEN}`);
  assert.equal(init.headers.Accept, 'application/json');
  assert.ok(url.startsWith('https://api.themoviedb.org/3/movie/42/keywords'));
  assert.ok(!url.includes(CHAVE_NA_URL) && !url.includes(TOKEN));
  assert.deepEqual(pedidos, [10000]);
});

test('AC-9: a requisição 12.001 não é enviada e vira teto-tmdb', async () => {
  const { cliente, chamadas } = montar([json(kw())]);
  for (let i = 0; i < 12000; i++) await cliente.pedir('/x');
  assert.equal(chamadas.length, 12000);
  await assert.rejects(cliente.pedir('/x'), (e) => e instanceof ErroBuild && e.invariante === 'teto-tmdb');
  assert.equal(chamadas.length, 12000);
  assert.equal(cliente.requisicoes(), 12000);
});

test('AC-9: antesDeEnviar (prazo global) interrompe antes de enviar', async () => {
  const { cliente, chamadas } = montar([json(kw())], { antesDeEnviar: () => { throw new ErroBuild('prazo', { invariante: 'prazo' }); } });
  await assert.rejects(cliente.pedir('/x'), (e) => e.invariante === 'prazo');
  assert.equal(chamadas.length, 0);
});

test('AC-7: keywords: lista vazia é sucesso; formato inesperado vira lista vazia', async () => {
  assert.deepEqual(await buscarKeywords(montar([json(kw())]).cliente, 1), { ok: true, keywords: [] });
  assert.deepEqual(await buscarKeywords(montar([json({})]).cliente, 1), { ok: true, keywords: [] });
});
