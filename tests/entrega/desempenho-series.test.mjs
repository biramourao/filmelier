import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recomendar } from '../../src/recomendar.mjs';
import { TEXTOS_SERIES } from '../../src/serie.mjs';

// Teste de entrega (FILMELIER-6, AC-19): 1.000 recomendações com 2 tags incluídas e 1 excluída sobre 1.750 séries geradas,
// medidas com `performance.now()`, sem rede.
const raiz = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const humores = JSON.parse(readFileSync(`${raiz}/data/humores-series.json`, 'utf8'));
const generos = [...new Set(humores.humores.flatMap((h) => h.generos.map((g) => g.qid)))];
const TAGS = Array.from({ length: 30 }, (_, i) => `tema-${i}`);

const gerador = (semente) => () => {
  semente |= 0; semente = (semente + 0x6D2B79F5) | 0;
  let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const p95 = (v) => [...v].sort((a, b) => a - b)[Math.ceil(v.length * 0.95) - 1];

test('AC-19: p95 da recomendação de séries com 2 tags incluídas e 1 excluída de até 50 ms em 1.000 chamadas sobre 1.750 séries', (t) => {
  const rng = gerador(2026);
  const pick = (lst) => lst[Math.floor(rng() * lst.length)];
  const series = Array.from({ length: 1750 }, (_, i) => ({
    qid: `Q${100000 + i}`, titulo: `Série ${i}`, anoInicio: 1980 + (i % 45), anoFim: null, situacao: 'finalizada', temporadas: 3, episodios: 30,
    generos: [pick(generos)], sitelinks: 20 + Math.floor(rng() * 80), tmdbId: i + 1,
    tags: Array.from({ length: Math.floor(rng() * 4) }, () => pick(TAGS)),
  }));
  const tempos = [];
  for (let i = 0; i < 1000; i++) {
    const humor = pick(humores.humores);
    const incluir = [pick(TAGS), pick(TAGS)];
    const excluir = [pick(TAGS)];
    const t0 = performance.now();
    recomendar({ filmes: series, humores, humorId: humor.id, generoQid: null, rng, incluir, excluir, tagsValidas: TAGS, textos: TEXTOS_SERIES, campoAno: 'anoInicio' });
    tempos.push(performance.now() - t0);
  }
  t.diagnostic(`p95 de recomendar sobre ${series.length} séries: ${p95(tempos).toFixed(2)} ms`);
  assert.ok(p95(tempos) <= 50, `p95 ${p95(tempos).toFixed(2)} ms`);
});
