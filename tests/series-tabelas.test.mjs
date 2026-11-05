import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validarTabela } from '../scripts/lib/validar-dataset.mjs';

const ler = (rel) => JSON.parse(readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8'));
const series = ler('data/humores-series.json');
const filmes = ler('data/humores.json');
const clima = ler('data/clima-series.json');

test('AC-4: tabela de humores de séries válida, com os 7 humores de filmes', () => {
  assert.deepEqual(validarTabela(series), []);
  assert.equal(series.humores.length, 7);
  assert.deepEqual(
    series.humores.map(({ id, rotulo, emoji }) => ({ id, rotulo, emoji })),
    filmes.humores.map(({ id, rotulo, emoji }) => ({ id, rotulo, emoji })),
  );
  for (const h of series.humores) assert.ok(h.generos.length >= 1 && h.generos.length <= 4, h.id);
});

test('AC-4: nenhum QID de gênero de séries aparece em humores.json', () => {
  const dosFilmes = new Set(filmes.humores.flatMap((h) => h.generos.map((g) => g.qid)));
  const dasSeries = series.humores.flatMap((h) => h.generos.map((g) => g.qid));
  assert.deepEqual(dasSeries.filter((q) => dosFilmes.has(q)), []);
});

test('AC-4: todo QID de clima-series.json está na tabela de séries', () => {
  const dasSeries = new Set(series.humores.flatMap((h) => h.generos.map((g) => g.qid)));
  for (const [qid, nivel] of Object.entries(clima.generosClima)) {
    assert.ok(dasSeries.has(qid), qid);
    assert.ok(['leve', 'intermediario', 'sombrio'].includes(nivel), qid);
  }
});

test('AC-4: QID de clima fora da tabela de séries é reprovado por validarClimaSeries', async () => {
  const { validarClimaSeries } = await import('../scripts/lib/series.mjs');
  assert.deepEqual(validarClimaSeries(clima, series), []);
  const erros = validarClimaSeries({ generosClima: { ...clima.generosClima, Q99999999: 'leve' } }, series);
  assert.equal(erros.length, 1);
  assert.match(erros[0].erro, /Q99999999/);
  assert.equal(validarClimaSeries({ generosClima: { Q1273568: 'alegre' } }, series).length, 1);
});
