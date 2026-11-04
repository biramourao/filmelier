import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { todasAsStrings, todasAsKeywordsDaTabela } from './apoio/rodar-temas.mjs';

// Esquema da base versionada com tags (FILMELIER-4, AC-4). Só o formato: o conteúdo da semana fica em tests/entrega/.
const raiz = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const caminho = `${raiz}/data/filmes.json`;
const base = JSON.parse(readFileSync(caminho, 'utf8'));
const temas = JSON.parse(readFileSync(`${raiz}/data/temas.json`, 'utf8'));
const idsDeTema = new Set(temas.temas.map((t) => t.id));
const CLIMAS = ['leve', 'intermediario', 'sombrio'];
const PERMITIDAS = ['qid', 'titulo', 'ano', 'generos', 'sitelinks', 'imdb', 'nota', 'oscarVitorias', 'oscarIndicacoes', 'tags', 'clima', 'tmdbId', 'tagsEm'];
const DIA = 86400000;

test('AC-4: todo filme só tem as chaves permitidas', () => {
  for (const f of base.filmes) for (const k of Object.keys(f)) assert.ok(PERMITIDAS.includes(k), `${f.qid}: ${k}`);
});

test('AC-4: tags são ids de data/temas.json, sem repetição e em ordem crescente; clima é um dos 3 níveis; tmdbId é inteiro positivo', () => {
  for (const f of base.filmes) {
    if ('tags' in f) {
      assert.ok(Array.isArray(f.tags) && f.tags.length > 0, f.qid);
      for (const id of f.tags) assert.ok(idsDeTema.has(id), `${f.qid}: ${id}`);
      assert.deepEqual(f.tags, [...new Set(f.tags)].sort(), f.qid);
    }
    if ('clima' in f) assert.ok(CLIMAS.includes(f.clima), `${f.qid}: ${f.clima}`);
    if ('tmdbId' in f) assert.ok(Number.isInteger(f.tmdbId) && f.tmdbId > 0, f.qid);
  }
});

test('AC-4: meta.temas.geradoEm é maior ou igual a meta.geradoEm, com diferença de até 24 h (decisão J-1)', () => {
  const a = Date.parse(base.meta.geradoEm);
  const b = Date.parse(base.meta.temas.geradoEm);
  assert.ok(Number.isFinite(a) && Number.isFinite(b));
  assert.ok(b >= a && b - a <= DIA, `${base.meta.geradoEm} / ${base.meta.temas.geradoEm}`);
});

test('AC-4: todo tagsEm casa AAAA-MM-DD e fica a no máximo 28 dias antes de meta.temas.geradoEm', () => {
  const ref = Date.parse(base.meta.temas.geradoEm);
  for (const f of base.filmes.filter((x) => 'tagsEm' in x)) {
    assert.match(f.tagsEm, /^\d{4}-\d{2}-\d{2}$/, f.qid);
    assert.ok((ref - Date.parse(f.tagsEm)) / DIA <= 28 + 1, `${f.qid}: ${f.tagsEm}`);
  }
});

test('AC-3: meta.temas.lista só com itens de no mínimo 20 filmes e igual à contagem real de tags e clima', () => {
  const contagem = new Map();
  for (const f of base.filmes) for (const id of [...(f.tags ?? []), ...(f.clima ? [f.clima] : [])]) contagem.set(id, (contagem.get(id) ?? 0) + 1);
  const { lista } = base.meta.temas;
  assert.ok(lista.length > 0);
  for (const item of lista) {
    assert.ok(item.filmes >= 20, item.id);
    assert.equal(item.filmes, contagem.get(item.id), item.id);
    assert.ok(typeof item.rotulo === 'string' && item.rotulo !== '');
  }
  assert.deepEqual([...contagem.keys()].filter((id) => !lista.some((x) => x.id === id)), []);
  assert.deepEqual(lista.map((x) => x.id), lista.map((x) => x.id).sort());
});

test('AC-4: semPar é objeto de QID da base para data AAAA-MM-DD', () => {
  const qids = new Set(base.filmes.map((f) => f.qid));
  for (const [qid, data] of Object.entries(base.meta.temas.semPar)) {
    assert.ok(qids.has(qid), qid);
    assert.match(data, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test('AC-4: nenhuma string da base fora de titulo é igual a uma keyword de data/temas.json', () => {
  const conhecidas = todasAsKeywordsDaTabela(temas);
  assert.deepEqual(todasAsStrings(base).filter((s) => conhecidas.has(s)), []);
});

test('AC-4: tamanho de data/filmes.json de até 2.621.440 bytes', () => {
  assert.ok(statSync(caminho).size <= 2621440);
});
