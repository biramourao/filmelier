import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { recomendar, listarGeneros } from '../src/recomendar.mjs';
import { criarGerador } from './apoio/gerador.mjs';

const caminhoFilmes = new URL('../data/filmes.json', import.meta.url);
const tabela = JSON.parse(readFileSync(new URL('../data/humores.json', import.meta.url), 'utf8'));
const dataset = JSON.parse(readFileSync(caminhoFilmes, 'utf8'));
const qidsTabela = new Set(tabela.humores.flatMap((h) => h.generos.map((g) => g.qid)));

test('AC-11: esquema de cada filme do dataset versionado', () => {
  assert.ok(dataset.filmes.length > 0);
  for (const f of dataset.filmes) {
    assert.match(f.qid, /^Q\d+$/);
    assert.ok(typeof f.titulo === 'string' && f.titulo.length > 0, f.qid);
    assert.match(String(f.ano), /^\d{4}$/);
    assert.ok(f.generos.length >= 1 && f.generos.every((q) => qidsTabela.has(q)), f.qid);
    assert.ok(Number.isInteger(f.sitelinks) && f.sitelinks >= 0, f.qid);
    if ('imdb' in f) assert.match(f.imdb, /^tt\d+$/);
  }
});

test('AC-11: sem QID repetido', () => {
  assert.equal(new Set(dataset.filmes.map((f) => f.qid)).size, dataset.filmes.length);
});

test('AC-11: metadados do dataset', () => {
  const { meta } = dataset;
  assert.ok(!Number.isNaN(Date.parse(meta.geradoEm)));
  assert.match(meta.geradoEm, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
  assert.equal(meta.fonte, 'Wikidata');
  assert.equal(meta.licenca, 'CC0 1.0');
  assert.equal(meta.total, dataset.filmes.length);
});

test('AC-12: tamanho do dataset versionado até 2.621.440 bytes', () => {
  assert.ok(statSync(caminhoFilmes).size <= 2621440);
});

const generos = listarGeneros(tabela);

function elegivelNoNivel(f, nivel, humor, generoQid) {
  const doHumor = f.generos.some((q) => humor.generos.some((g) => g.qid === q));
  if (nivel === 'humor') return doHumor;
  if (nivel === 'genero') return f.generos.includes(generoQid);
  return doHumor && f.generos.includes(generoQid);
}

test('AC-4: 7 x (1 + nº de gêneros) combinações devolvem de 1 a 5 filmes elegíveis', () => {
  let n = 0;
  for (const humor of tabela.humores) {
    for (const generoQid of [null, ...generos.map((g) => g.qid)]) {
      const r = recomendar({ filmes: dataset.filmes, humores: tabela, humorId: humor.id, generoQid, rng: criarGerador(n + 1) });
      const rotulo = `${humor.id}/${generoQid}`;
      assert.ok(r.filmes.length >= 1 && r.filmes.length <= 5, rotulo);
      assert.equal(new Set(r.filmes.map((f) => f.qid)).size, r.filmes.length, rotulo);
      for (const f of r.filmes) assert.ok(elegivelNoNivel(f, r.nivel, humor, generoQid), `${rotulo} ${f.qid}`);
      n += 1;
    }
  }
  assert.equal(n, 7 * (1 + generos.length));
});

test('AC-16: p95 de 1.000 chamadas de recomendar até 50 ms', () => {
  const duracoes = [];
  for (let i = 0; i < 1000; i++) {
    const humor = tabela.humores[i % tabela.humores.length];
    const generoQid = i % 3 === 0 ? null : generos[i % generos.length].qid;
    const inicio = performance.now();
    recomendar({ filmes: dataset.filmes, humores: tabela, humorId: humor.id, generoQid, rng: criarGerador(i) });
    duracoes.push(performance.now() - inicio);
  }
  duracoes.sort((a, b) => a - b);
  assert.ok(duracoes[Math.floor(0.95 * duracoes.length) - 1] <= 50);
});
