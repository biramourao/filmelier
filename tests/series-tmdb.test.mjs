import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarClienteSeries, lerSerieTmdb, esperaDe429 } from '../scripts/lib/series-tmdb.mjs';
import { ErroBuild } from '../scripts/lib/wdqs.mjs';

const TOKEN = 'tok-teste-123';
// Literais de autorização montados por fragmentos (design D-12).
const CABECALHO = ['Author', 'ization'].join('');
const ESQUEMA = ['Bear', 'er'].join('');

const json = (corpo, status = 200, cabecalhos = {}) => ({
  ok: status >= 200 && status < 300, status, headers: { get: (n) => cabecalhos[n.toLowerCase()] ?? null }, json: async () => corpo,
});
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
  const cliente = criarClienteSeries({ token: TOKEN, fetch, esperar: async (ms) => { esperas.push(ms); }, ...extra });
  return { cliente, chamadas, esperas };
};
const tv = (extra = {}) => ({ name: 'Liberdade Vigiada', original_name: 'Breaking Bad', status: 'Ended', number_of_seasons: 5, number_of_episodes: 62, last_air_date: '2013-09-29', keywords: { results: [{ id: 1, name: 'witch' }] }, ...extra });

test('AC-11: Retry-After respeitado: 429 com 7 s e depois 200 espera 7.000 ms', async () => {
  const { cliente, esperas, chamadas } = montar([json({}, 429, { 'retry-after': '7' }), json(tv())]);
  const r = await lerSerieTmdb(cliente, 1396);
  assert.equal(r.ok, true);
  assert.deepEqual(esperas, [7000]);
  assert.equal(chamadas.length, 2);
});

test('AC-11: 429 com Retry-After 900 três vezes: 2 esperas de 300.000 ms, 3 chamadas e falha', async () => {
  const { cliente, esperas, chamadas } = montar([json({}, 429, { 'retry-after': '900' })]);
  const r = await lerSerieTmdb(cliente, 1);
  assert.equal(r.ok, false);
  assert.deepEqual(esperas, [300000, 300000]);
  assert.equal(chamadas.length, 3);
});

test('AC-11: Retry-After ausente, zero ou inválido espera 10 s', () => {
  for (const v of [undefined, null, '0', 'abc', '-3', '1.5']) assert.equal(esperaDe429(v), 10000, String(v));
  assert.equal(esperaDe429('1'), 1000);
  assert.equal(esperaDe429('300'), 300000);
});

test('AC-11: espera de 429 além do limite lança prazo sem chamar esperar', async () => {
  const { cliente, esperas, chamadas } = montar([json({}, 429, { 'retry-after': '300' })], { agora: () => 1000, limite: 1000 + 299999 });
  await assert.rejects(lerSerieTmdb(cliente, 1), (e) => e instanceof ErroBuild && e.invariante === 'prazo');
  assert.equal(esperas.length, 0);
  assert.equal(chamadas.length, 1);
});

test('AC-11: 401 lança tmdb-autorizacao sem expor o token', async () => {
  const { cliente } = montar([json({}, 401)]);
  await assert.rejects(lerSerieTmdb(cliente, 1), (e) => e instanceof ErroBuild && e.invariante === 'tmdb-autorizacao' && !e.message.includes(TOKEN));
});

test('AC-11: 404, 500 e outro 4xx devolvem ok false na 1ª falha, sem espera', async () => {
  for (const status of [404, 500, 503, 403]) {
    const { cliente, esperas, chamadas } = montar([json({}, status)]);
    const r = await lerSerieTmdb(cliente, 1);
    assert.equal(r.ok, false, String(status));
    assert.equal(chamadas.length, 1);
    assert.equal(esperas.length, 0);
  }
});

test('AC-11: rejeição, timeout e JSON inválido devolvem ok false', async () => {
  const falha = { ok: true, status: 200, headers: { get: () => null }, json: async () => { throw new SyntaxError('x'); } };
  const timeout = Object.assign(new Error('t'), { name: 'TimeoutError' });
  for (const resposta of [new Error('rede'), timeout, falha]) {
    const { cliente, chamadas } = montar([resposta]);
    const r = await lerSerieTmdb(cliente, 1);
    assert.equal(r.ok, false);
    assert.equal(chamadas.length, 1);
  }
});

test('AC-11: 1 GET /tv/{id} com pt-BR, keywords anexadas, cabeçalho de acesso e sinal de 10 s', async () => {
  const pedidos = [];
  const { cliente, chamadas } = montar([json(tv())], { criarSinal: (ms) => { pedidos.push(ms); return AbortSignal.timeout(ms); } });
  const r = await lerSerieTmdb(cliente, 1396);
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].url, 'https://api.themoviedb.org/3/tv/1396?language=pt-BR&append_to_response=keywords');
  assert.equal(chamadas[0].init.headers[CABECALHO], `${ESQUEMA} ${TOKEN}`);
  assert.deepEqual(pedidos, [10000]);
  assert.deepEqual(r.serie, {
    name: 'Liberdade Vigiada', originalName: 'Breaking Bad', status: 'Ended', temporadas: 5, episodios: 62, ultimaExibicao: '2013-09-29', keywords: ['witch'],
  });
});

test('AC-11: keywords em results viram palavras-chave; array direto (formato de filme) gera 0', async () => {
  const a = montar([json(tv())]);
  assert.deepEqual((await lerSerieTmdb(a.cliente, 1)).serie.keywords, ['witch']);
  const b = montar([json(tv({ keywords: [{ id: 1, name: 'witch' }] }))]);
  assert.deepEqual((await lerSerieTmdb(b.cliente, 1)).serie.keywords, []);
  const c = montar([json(tv({ keywords: undefined }))]);
  assert.deepEqual((await lerSerieTmdb(c.cliente, 1)).serie.keywords, []);
});

test('AC-11: token ausente impede criar o cliente', () => {
  assert.throws(() => criarClienteSeries({ token: '', fetch: async () => {}, esperar: async () => {} }), (e) => e.invariante === 'tmdb-token');
});
