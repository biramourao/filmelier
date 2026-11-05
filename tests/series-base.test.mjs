import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { validarSeries } from '../scripts/lib/series.mjs';

const arquivo = new URL('../data/series.json', import.meta.url);
const bruto = readFileSync(arquivo, 'utf8');
const base = JSON.parse(bruto);
const tabela = JSON.parse(readFileSync(new URL('../data/humores-series.json', import.meta.url), 'utf8'));
const cobertura = (campo) => base.series.filter((s) => Number.isInteger(s[campo]) && s[campo] >= 1).length / base.series.length;

test('AC-12: Leitura do arquivo versionado', () => {
  assert.ok(cobertura('temporadas') >= 0.95);
  assert.ok(cobertura('episodios') >= 0.95);
  assert.ok(base.series.filter((s) => s.situacao !== null).length / base.series.length >= 0.95);
  assert.ok(base.series.every((s) => Number.isInteger(s.anoInicio)));
  assert.ok(statSync(arquivo).size <= 600000);
  assert.equal(new Date(base.meta.geradoEm).toISOString(), base.meta.geradoEm);
  assert.equal(base.meta.total, base.series.length);
  assert.ok(base.meta.temas.lista.every((t) => typeof t.id === 'string' && typeof t.rotulo === 'string' && Number.isInteger(t.filmes) && t.filmes >= 20));
  assert.deepEqual(validarSeries({ tabela, series: base.series, bytes: statSync(arquivo).size }), []);
});

test('AC-12: esquema do item: sem nota nem prêmio, generos ordenados por QID e situação válida', () => {
  for (const s of base.series) {
    for (const k of Object.keys(s)) assert.ok(!/^(nota|oscar|emmy)/.test(k), k);
    const nums = s.generos.map((q) => Number(q.slice(1)));
    assert.deepEqual(nums, [...nums].sort((a, b) => a - b), s.qid);
    assert.ok([null, 'em-andamento', 'finalizada', 'cancelada'].includes(s.situacao), s.qid);
    if (s.situacao === 'em-andamento') assert.equal(s.anoFim, null, s.qid);
  }
});

test('AC-20: data/series.json sem TMDB_TOKEN nem JWT', () => {
  assert.equal(bruto.includes('TMDB_TOKEN'), false);
  assert.equal(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./.test(bruto), false);
});
