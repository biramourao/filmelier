import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarConsulta, MIN_SITELINKS } from '../scripts/lib/consulta.mjs';

const lote = { nome: 'Q157443', qid: 'Q157443' };
const consulta = montarConsulta(lote);

test('AC-11: consulta restrita a instância direta de filme com data de lançamento', () => {
  assert.ok(consulta.includes('wdt:P31 wd:Q11424'));
  assert.ok(consulta.includes('wdt:P577'));
  assert.ok(!consulta.includes('wdt:P279'));
  assert.ok(!consulta.includes('wdt:P31/wdt:P279*'));
});

test('AC-13: sem agregação', () => {
  assert.ok(!consulta.includes('GROUP_CONCAT'));
  assert.ok(!/\bGROUP BY\b|\bCOUNT\(|\bSAMPLE\(/i.test(consulta));
});

test('AC-11 (D-impl-3): lote por gênero, sem filtro de ano, hint optimizer None e corte de sitelinks', () => {
  assert.ok(consulta.includes('VALUES ?g { wd:Q157443 }'));
  assert.ok(!/YEAR\(/.test(consulta));
  assert.ok(consulta.includes('hint:Query hint:optimizer "None"'));
  assert.ok(consulta.includes('wikibase:sitelinks ?sl'));
  assert.ok(consulta.includes(`?sl >= ${MIN_SITELINKS}`));
  assert.ok(Number.isInteger(MIN_SITELINKS) && MIN_SITELINKS >= 10);
  // ordem: gênero, sitelinks, instância de filme, data
  const pos = ['wdt:P136', 'wikibase:sitelinks', 'wdt:P31 wd:Q11424', 'wdt:P577'].map((t) => consulta.indexOf(t));
  assert.deepEqual([...pos].sort((a, b) => a - b), pos);
});

test('AC-11: rejeita QID malformado (evita injeção na consulta)', () => {
  assert.throws(() => montarConsulta({ nome: 'QX', qid: 'QX' }));
});
