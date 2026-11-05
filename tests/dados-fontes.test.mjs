import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { carregarDados } from '../src/dados.mjs';

// FILMELIER-5 (AC-13): a carga lê data/humores.json e data/filmes.json, os mesmos arquivos que o build copia para dist/data.
const raiz = new URL('..', import.meta.url);

test('AC-13: carregarDados pede data/humores.json e data/filmes.json e valida os arquivos reais', async () => {
  const pedidos = [];
  const fetchImpl = async (url) => {
    pedidos.push(url);
    return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(new URL(url, raiz), 'utf8')) };
  };
  const dados = await carregarDados(fetchImpl, { error() { throw new Error('não deveria logar'); } });
  assert.deepEqual([...pedidos].sort(), ['data/filmes.json', 'data/humores.json']);
  assert.equal(dados.erro, null);
  assert.ok(dados.humores.humores.length > 0 && dados.filmes.filmes.length > 0);
});

test('AC-13: os 2 arquivos existem em data/ (fonte única do build e do workflow semanal)', () => {
  for (const nome of ['humores.json', 'filmes.json']) assert.ok(existsSync(new URL(`data/${nome}`, raiz)), nome);
});
