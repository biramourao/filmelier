import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validarDataset, validarTabela } from '../scripts/lib/validar-dataset.mjs';
import { listarGeneros } from '../src/recomendar.mjs';

const tabela = JSON.parse(readFileSync(new URL('../data/humores.json', import.meta.url), 'utf8'));
const generos = listarGeneros(tabela).map((g) => g.qid);
const MUSICAL = 'Q842256';
const TERROR = 'Q200092';
const LIMITE_BYTES = 2621440;

// Gera n filmes distribuindo gêneros em rodízio, evitando os gêneros proibidos.
function gerar(n, { evitar = [], extras = {} } = {}) {
  const usaveis = generos.filter((g) => !evitar.includes(g));
  return Array.from({ length: n }, (_, i) => ({
    qid: `Q${1000 + i}`, titulo: `F${i}`, ano: 2000, sitelinks: 20,
    generos: [usaveis[i % usaveis.length]],
  })).concat(
    Object.entries(extras).flatMap(([g, qtd]) =>
      Array.from({ length: qtd }, (_, i) => ({ qid: `Q${900000 + generos.indexOf(g) * 1000 + i}`, titulo: 'X', ano: 2001, sitelinks: 20, generos: [g] }))),
  );
}
const ids = (erros) => erros.map((e) => e.invariante);

test('AC-12: dataset nos limites exatos não devolve erro', () => {
  const filmes = gerar(2000);
  assert.deepEqual(validarDataset({ tabela, filmes, bytes: LIMITE_BYTES }), []);
});

test('AC-12: 1.999 filmes viola total-minimo', () => {
  assert.deepEqual(ids(validarDataset({ tabela, filmes: gerar(1999), bytes: 1000 })), ['total-minimo']);
});

test('AC-12: humor com 39 elegíveis viola minimo-por-humor', () => {
  const filmes = gerar(2000, { evitar: [TERROR], extras: { [TERROR]: 39 } });
  const erros = validarDataset({ tabela, filmes, bytes: 1000 });
  assert.deepEqual(ids(erros), ['minimo-por-humor']);
});

test('AC-12: gênero com 9 filmes viola minimo-por-genero', () => {
  const filmes = gerar(2000, { evitar: [MUSICAL], extras: { [MUSICAL]: 9 } });
  assert.deepEqual(ids(validarDataset({ tabela, filmes, bytes: 1000 })), ['minimo-por-genero']);
});

test('AC-12: serialização de 2.621.441 bytes viola tamanho-maximo', () => {
  assert.deepEqual(ids(validarDataset({ tabela, filmes: gerar(2000), bytes: LIMITE_BYTES + 1 })), ['tamanho-maximo']);
});

test('AC-12: gênero inexistente (0 filmes) viola minimo-por-genero', () => {
  const alterada = structuredClone(tabela);
  alterada.humores[4].generos.push({ qid: 'Q999999999', rotulo: 'Inexistente' });
  const erros = validarDataset({ tabela: alterada, filmes: gerar(2000), bytes: 1000 });
  assert.ok(ids(erros).includes('minimo-por-genero'));
});

test('AC-12: validarTabela devolve esquema-humores para QID malformado', () => {
  assert.deepEqual(validarTabela(tabela), []);
  const ruim = structuredClone(tabela);
  ruim.humores[0].generos[0].qid = 'QX';
  assert.deepEqual(ids(validarTabela(ruim)), ['esquema-humores']);
  assert.deepEqual(ids(validarTabela({})), ['esquema-humores']);
});
