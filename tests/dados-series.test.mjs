import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { carregarSeries, carregarDados } from '../src/dados.mjs';

const raiz = new URL('..', import.meta.url);
const lerArquivo = (url) => JSON.parse(readFileSync(new URL(url, raiz), 'utf8'));
const ok = (corpo) => ({ ok: true, status: 200, json: async () => corpo });
const mundo = (alvo, comportamento) => async (url) => {
  if (url === alvo) return comportamento(url);
  return ok(lerArquivo(url));
};
const logger = () => {
  const erros = [];
  return { erros, error: (...a) => erros.push(a) };
};
const exatamenteUmErro = (l) => {
  assert.equal(l.erros.length, 1);
  assert.match(String(l.erros[0][0]), /^\[filmelier\]/);
};

test('AC-3: carregarSeries pede exatamente os 2 arquivos e valida os arquivos reais', async () => {
  const pedidos = [];
  const l = logger();
  const dados = await carregarSeries(async (url) => { pedidos.push(url); return ok(lerArquivo(url)); }, l);
  assert.deepEqual([...pedidos].sort(), ['data/humores-series.json', 'data/series.json']);
  assert.equal(dados.erro, null);
  assert.ok(dados.humores.humores.length > 0 && dados.series.series.length > 0);
  assert.equal(l.erros.length, 0);
});

const FALHAS_SERIES = [
  ['rejeição', () => { throw new Error('rede caiu'); }],
  ['HTTP 500', () => ({ ok: false, status: 500, json: async () => ({}) })],
  ['JSON inválido', () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('json'); } })],
  ['sem a lista series', () => ok({ meta: { geradoEm: '2026-11-12T09:31:07.512Z' } })],
];
for (const [nome, falha] of FALHAS_SERIES) {
  test(`AC-3: series.json com ${nome} devolve { erro } sem lançar e com 1 logger.error`, async () => {
    const l = logger();
    const r = await carregarSeries(mundo('data/series.json', falha), l);
    assert.equal(typeof r.erro, 'string');
    assert.ok(r.erro.length > 0);
    assert.equal(r.series, null);
    exatamenteUmErro(l);
  });
}

for (const [nome, falha] of [['rejeição', () => { throw new Error('rede caiu'); }], ['sem a lista humores', () => ok({ outro: [] })]]) {
  test(`AC-3: humores-series.json com ${nome} devolve { erro } sem lançar e com 1 logger.error`, async () => {
    const l = logger();
    const r = await carregarSeries(mundo('data/humores-series.json', falha), l);
    assert.equal(typeof r.erro, 'string');
    exatamenteUmErro(l);
  });
}

test('AC-3: meta.geradoEm inválido em series.json também é falha', async () => {
  const l = logger();
  const base = lerArquivo('data/series.json');
  const r = await carregarSeries(mundo('data/series.json', () => ok({ ...base, meta: { ...base.meta, geradoEm: 'ontem' } })), l);
  assert.match(r.erro, /geradoEm/);
  exatamenteUmErro(l);
});

test('AC-3: carregarDados segue pedindo só os 2 arquivos de filmes', async () => {
  const pedidos = [];
  await carregarDados(async (url) => { pedidos.push(url); return ok(lerArquivo(url)); }, logger());
  assert.deepEqual([...pedidos].sort(), ['data/filmes.json', 'data/humores.json']);
});
