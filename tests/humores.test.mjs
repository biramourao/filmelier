import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { listarGeneros } from '../src/recomendar.mjs';

const tabela = JSON.parse(readFileSync(new URL('../data/humores.json', import.meta.url), 'utf8'));

test('AC-10: esquema da tabela de humores', () => {
  assert.equal(tabela.humores.length, 7);
  for (const h of tabela.humores) {
    assert.ok(h.generos.length >= 1 && h.generos.length <= 4, h.id);
    for (const g of h.generos) {
      assert.match(g.qid, /^Q\d+$/);
      assert.ok(typeof g.rotulo === 'string' && g.rotulo.length > 0);
    }
  }
});

test('AC-1: rótulos e ordem dos humores, ids únicos', () => {
  assert.deepEqual(tabela.humores.map((h) => h.rotulo), [
    'Leve e engraçado',
    'Tenso, quero adrenalina',
    'Quero me emocionar',
    'Quero pensar',
    'Quero sentir medo',
    'Quero aventura e fantasia',
    'Aconchegante, para ver em família',
  ]);
  const ids = tabela.humores.map((h) => h.id);
  assert.equal(new Set(ids).size, 7);
});

test('AC-10: mesmo QID tem o mesmo rótulo em todos os humores', () => {
  const mapa = new Map();
  for (const h of tabela.humores) {
    for (const g of h.generos) {
      if (mapa.has(g.qid)) assert.equal(mapa.get(g.qid), g.rotulo, g.qid);
      mapa.set(g.qid, g.rotulo);
    }
  }
});
test('AC-2: listarGeneros devolve 10 a 16 gêneros únicos em ordem pt-BR', () => {
  const generos = listarGeneros(tabela);
  assert.ok(generos.length >= 10 && generos.length <= 16, String(generos.length));
  assert.equal(new Set(generos.map((g) => g.qid)).size, generos.length);
  const rotulos = generos.map((g) => g.rotulo);
  assert.deepEqual(rotulos, [...rotulos].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  for (const g of generos) {
    const todos = tabela.humores.flatMap((h) => h.generos).filter((x) => x.qid === g.qid);
    assert.ok(todos.every((x) => x.rotulo === g.rotulo));
  }
});

test('AC-1: 7 emojis pictográficos, um por humor, sem repetição', () => {
  const emojis = tabela.humores.map((h) => h.emoji);
  assert.equal(emojis.length, 7);
  for (const e of emojis) assert.match(e, /^\p{Extended_Pictographic}️?$/u);
  assert.equal(new Set(emojis).size, 7);
});

test('AC-15: retrato dos humores sem emoji idêntico ao da FILMELIER-1', () => {
  const retrato = JSON.stringify(tabela.humores.map(({ emoji, ...resto }) => resto));
  const hash = createHash('sha256').update(retrato).digest('hex');
  assert.equal(hash, '8d3a113b544de5f3a3e19a865e30d763c794e45d87fc40ddec75552402011ed5');
});
