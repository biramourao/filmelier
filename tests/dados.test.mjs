import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarDados, formatarData } from '../src/dados.mjs';

const humores = { humores: [{ id: 'a', rotulo: 'A', generos: [{ qid: 'Q1', rotulo: 'G' }] }] };
const filmes = { meta: { geradoEm: '2026-11-20T13:45:00.000Z', total: 0 }, filmes: [] };

function loggerEspiao() {
  const chamadas = [];
  return { chamadas, error: (...args) => chamadas.push(args) };
}

function fetchPorUrl(mapa) {
  return async (url) => {
    const r = mapa[url];
    if (r instanceof Error) throw r;
    return r;
  };
}
const ok = (corpo) => ({ ok: true, status: 200, json: async () => corpo });

test('AC-9: carrega os dois JSON por URL relativa', async () => {
  const log = loggerEspiao();
  const r = await carregarDados(fetchPorUrl({ 'data/humores.json': ok(humores), 'data/filmes.json': ok(filmes) }), log);
  assert.equal(r.erro, null);
  assert.deepEqual(r.humores, humores);
  assert.deepEqual(r.filmes, filmes);
  assert.equal(log.chamadas.length, 0);
});

const casos = {
  'fetch rejeitado': { 'data/humores.json': ok(humores), 'data/filmes.json': new Error('Failed to fetch') },
  'JSON inválido': { 'data/humores.json': ok(humores), 'data/filmes.json': { ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token'); } } },
  'falha só de humores.json': { 'data/humores.json': { ok: false, status: 500, json: async () => ({}) }, 'data/filmes.json': ok(filmes) },
  'HTTP 404 em filmes.json': { 'data/humores.json': ok(humores), 'data/filmes.json': { ok: false, status: 404, json: async () => ({}) } },
};

for (const [nome, mapa] of Object.entries(casos)) {
  test(`AC-9 e AC-17: ${nome} gera estado de erro, sem exceção e com 1 console.error [filmelier]`, async () => {
    const log = loggerEspiao();
    const r = await carregarDados(fetchPorUrl(mapa), log);
    assert.ok(typeof r.erro === 'string' && r.erro.length > 0);
    assert.equal(r.humores, null);
    assert.equal(r.filmes, null);
    assert.equal(log.chamadas.length, 1);
    assert.ok(String(log.chamadas[0][0]).startsWith('[filmelier]'));
  });
}

const formasInvalidas = {
  'humores.json igual a objeto vazio': { humores: {}, filmes },
  'filmes.json sem meta': { humores, filmes: { filmes: [] } },
  'meta.geradoEm igual a "x"': { humores, filmes: { meta: { geradoEm: 'x' }, filmes: [] } },
  'filmes.filmes igual a null': { humores, filmes: { meta: filmes.meta, filmes: null } },
};

for (const [nome, { humores: h, filmes: f }] of Object.entries(formasInvalidas)) {
  test(`AC-11: forma inválida (${nome}) vira estado de erro, sem exceção e com 1 console.error [filmelier]`, async () => {
    const log = loggerEspiao();
    const r = await carregarDados(fetchPorUrl({ 'data/humores.json': ok(h), 'data/filmes.json': ok(f) }), log);
    assert.ok(typeof r.erro === 'string' && r.erro.length > 0);
    assert.equal(r.humores, null);
    assert.equal(r.filmes, null);
    assert.equal(log.chamadas.length, 1);
    assert.ok(String(log.chamadas[0][0]).startsWith('[filmelier]'));
  });
}

test('AC-11: sem resposta dentro do timeout injetado de 50 ms resolve em até 1 s com 1 console.error [filmelier]', async () => {
  const log = loggerEspiao();
  const nuncaResponde = (_url, { signal }) => new Promise((_, rejeitar) => {
    signal.addEventListener('abort', () => rejeitar(signal.reason));
  });
  const inicio = Date.now();
  const r = await carregarDados(nuncaResponde, log, {
    timeoutMs: 50,
    criarSinal: (ms) => AbortSignal.timeout(ms),
  });
  assert.ok(Date.now() - inicio <= 1000);
  assert.ok(typeof r.erro === 'string' && r.erro.length > 0);
  assert.equal(r.humores, null);
  assert.equal(r.filmes, null);
  assert.equal(log.chamadas.length, 1);
  assert.ok(String(log.chamadas[0][0]).startsWith('[filmelier]'));
});

test('AC-11: cada fetch recebe um signal e o criarSinal padrão não derruba a carga normal', async () => {
  const log = loggerEspiao();
  const opcoes = [];
  const fetchImpl = async (url, o) => { opcoes.push(o); return ok(url.includes('humores') ? humores : filmes); };
  const r = await carregarDados(fetchImpl, log);
  assert.equal(r.erro, null);
  assert.equal(opcoes.length, 2);
  assert.ok(opcoes.every((o) => o.signal instanceof AbortSignal));
});

test('AC-11: os arquivos versionados passam na validação de forma', async () => {
  const { readFileSync } = await import('node:fs');
  const ler = (n) => JSON.parse(readFileSync(new URL(`../data/${n}`, import.meta.url), 'utf8'));
  const log = loggerEspiao();
  const r = await carregarDados(fetchPorUrl({ 'data/humores.json': ok(ler('humores.json')), 'data/filmes.json': ok(ler('filmes.json')) }), log);
  assert.equal(r.erro, null);
  assert.equal(log.chamadas.length, 0);
});

test('AC-14: formatarData usa UTC e devolve dd/mm/aaaa', () => {
  assert.equal(formatarData('2026-11-20T13:45:00.000Z'), '20/11/2026');
  assert.equal(formatarData('2026-11-20T00:30:00.000Z'), '20/11/2026');
  assert.equal(formatarData('2026-11-20T23:59:59.000Z'), '20/11/2026');
});
