import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recomendar } from '../../src/recomendar.mjs';
import { listaDeTags, montarChips } from '../../src/tags.mjs';

// Teste de entrega (design D-18): mede o tempo sobre a base versionada, com `performance.now()`.
const raiz = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const base = JSON.parse(readFileSync(`${raiz}/data/filmes.json`, 'utf8'));
const humores = JSON.parse(readFileSync(`${raiz}/data/humores.json`, 'utf8'));
const lista = listaDeTags(base.meta);
const ids = lista.map((t) => t.id);

// Gerador determinístico (mulberry32).
const gerador = (semente) => () => {
  semente |= 0; semente = (semente + 0x6D2B79F5) | 0;
  let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const p95 = (v) => [...v].sort((a, b) => a - b)[Math.ceil(v.length * 0.95) - 1];

test('AC-16: p95 da recomendação com tags de até 50 ms e dos chips de até 20 ms em 1.000 chamadas', () => {
  assert.ok(ids.length > 0);
  const rng = gerador(2026);
  const generos = [null, ...new Set(humores.humores.flatMap((h) => h.generos.map((g) => g.qid)))];
  const pick = (lst) => lst[Math.floor(rng() * lst.length)];
  const tRec = [];
  const tChips = [];
  for (let i = 0; i < 1000; i++) {
    const humor = pick(humores.humores);
    const incluir = Array.from({ length: Math.floor(rng() * 3) }, () => pick(ids));
    const excluir = rng() < 0.5 ? [pick(ids)] : [];
    const t0 = performance.now();
    const r = recomendar({ filmes: base.filmes, humores, humorId: humor.id, generoQid: pick(generos), rng, incluir, excluir, tagsValidas: ids });
    const t1 = performance.now();
    const estado = new Map([...incluir.map((id) => [id, 'incluida']), ...excluir.map((id) => [id, 'excluida'])]);
    montarChips({ candidatos: r.candidatos, estado, lista });
    const t2 = performance.now();
    tRec.push(t1 - t0);
    tChips.push(t2 - t1);
  }
  assert.ok(p95(tRec) <= 50, `p95 da recomendação ${p95(tRec).toFixed(2)} ms`);
  assert.ok(p95(tChips) <= 20, `p95 dos chips ${p95(tChips).toFixed(2)} ms`);
});
