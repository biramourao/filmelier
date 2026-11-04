import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extrairCategorias, montarConsultasOscar, calcularOscar, dividirEmLotes, validarOscar, executarOscar, FONTES, TAMANHO_LOTE,
} from '../scripts/lib/oscar.mjs';

const uri = (q) => ({ value: `http://www.wikidata.org/entity/${q}` });
const par = (film, award) => ({ film: uri(film), award: uri(award) });

test('categorias: QIDs sem repetição', () => {
  assert.deepEqual(extrairCategorias([{ award: uri('Q1') }, { award: uri('Q2') }, { award: uri('Q1') }, {}]), ['Q1', 'Q2']);
});

test('consultas: 4 fontes simples (P166 e P1411, direto e por qualificador P1686) com VALUES de filmes e categorias', () => {
  const consultas = montarConsultasOscar(['Q1', 'Q2'], ['Q10', 'Q11']);
  assert.equal(consultas.length, 4);
  assert.deepEqual(consultas.map((c) => c.fonte.venceu), [true, true, false, false]);
  for (const { consulta } of consultas) {
    assert.match(consulta, /VALUES \?film \{ wd:Q1 wd:Q2 \}/);
    assert.match(consulta, /VALUES \?award \{ wd:Q10 wd:Q11 \}/);
    assert.doesNotMatch(consulta, /UNION/);
  }
  assert.match(consultas[1].consulta, /pq:P1686 \?film ; ps:P166 \?award/);
  assert.match(consultas[2].consulta, /wdt:P1411/);
  assert.equal(FONTES.length, 4);
});

test('cálculo: categorias distintas; vitória também é indicação; mesma categoria em duas fontes conta uma vez', () => {
  const mapa = calcularOscar([
    { venceu: true, bindings: [par('Q1', 'Q10'), par('Q1', 'Q11')] },
    { venceu: true, bindings: [par('Q1', 'Q10')] }, // repetida
    { venceu: false, bindings: [par('Q1', 'Q12'), par('Q1', 'Q10'), par('Q2', 'Q10')] },
  ]);
  assert.deepEqual(mapa.get('Q1'), { vitorias: 2, indicacoes: 3 });
  assert.deepEqual(mapa.get('Q2'), { vitorias: 0, indicacoes: 1 });
  assert.equal(mapa.has('Q3'), false);
});

test('lotes de no máximo 200', () => {
  assert.equal(TAMANHO_LOTE, 200);
  assert.deepEqual(dividirEmLotes(Array.from({ length: 450 }, (_, i) => `Q${i}`)).map((l) => l.length), [200, 200, 50]);
});

test('validarOscar: inteiros positivos e indicações >= vitórias', () => {
  assert.deepEqual(validarOscar([{ qid: 'Q1' }, { qid: 'Q2', oscarIndicacoes: 2 }, { qid: 'Q3', oscarVitorias: 1, oscarIndicacoes: 1 }]), []);
  assert.equal(validarOscar([{ qid: 'Q1', oscarIndicacoes: 0 }]).length, 1);
  assert.equal(validarOscar([{ qid: 'Q1', oscarIndicacoes: 1.5 }]).length, 1);
  assert.equal(validarOscar([{ qid: 'Q1', oscarVitorias: 2, oscarIndicacoes: 1 }]).length, 1);
  assert.equal(validarOscar([{ qid: 'Q1', oscarVitorias: 1 }]).length, 1);
});

function ambiente(extras = {}) {
  const dataset = {
    meta: { geradoEm: '2026-01-01T00:00:00.000Z', fonte: 'Wikidata', licenca: 'CC0 1.0', total: 3 },
    filmes: [
      { qid: 'Q3', titulo: 'C', ano: 2000, generos: ['Q1'], sitelinks: 5 },
      { qid: 'Q1', titulo: 'A', ano: 1990, generos: ['Q1'], sitelinks: 9, imdb: 'tt1', nota: 8 },
      { qid: 'Q2', titulo: 'B', ano: 1980, generos: ['Q1'], sitelinks: 7, oscarIndicacoes: 9 }, // valor antigo é refeito
    ],
  };
  const saidas = [];
  const erros = [];
  const esperas = [];
  const consultas = [];
  const gravados = [];
  const base = {
    dataset,
    contato: 'a@b.org',
    esperar: async (ms) => esperas.push(ms),
    stdout: (l) => saidas.push(l),
    stderr: (l) => erros.push(l),
    gravar: async (t) => gravados.push(t),
    fetch: async (url, opcoes) => {
      const q = new URL(url).searchParams.get('query');
      consultas.push({ q, ua: opcoes.headers['User-Agent'] });
      let bindings = [];
      if (q.includes('wd:Q19020')) bindings = [{ award: uri('Q10') }, { award: uri('Q11') }];
      else if (q.includes('wdt:P166 ')) bindings = [par('Q1', 'Q10'), par('Q1', 'Q11')];
      else if (q.includes('wdt:P1411')) bindings = [par('Q1', 'Q12'), par('Q3', 'Q10')];
      return { ok: true, status: 200, json: async () => ({ results: { bindings } }) };
    },
    ...extras,
  };
  return { base, saidas, erros, esperas, consultas, gravados };
}

test('executarOscar: grava só os campos de Oscar, sem mexer nos outros nem na ordem; meta.oscar; resumo', async () => {
  const a = ambiente();
  assert.equal(await executarOscar(a.base), 0);
  const saida = JSON.parse(a.gravados[0]);
  assert.deepEqual(saida.filmes.map((f) => f.qid), ['Q3', 'Q1', 'Q2']);
  assert.deepEqual(saida.filmes[0], { qid: 'Q3', titulo: 'C', ano: 2000, generos: ['Q1'], sitelinks: 5, oscarIndicacoes: 1 });
  assert.equal(saida.filmes[1].oscarVitorias, 2);
  assert.equal(saida.filmes[1].oscarIndicacoes, 3);
  assert.equal(saida.filmes[1].nota, 8);
  assert.equal(saida.filmes[1].imdb, 'tt1');
  assert.equal('oscarIndicacoes' in saida.filmes[2], false);
  assert.equal(saida.meta.geradoEm, '2026-01-01T00:00:00.000Z');
  assert.equal(saida.meta.oscar.comIndicacao, 2);
  assert.equal(saida.meta.oscar.comVitoria, 1);
  assert.equal(saida.meta.oscar.total, 3);
  assert.match(saida.meta.oscar.geradoEm, /^\d{4}-\d{2}-\d{2}T/);
  const resumo = JSON.parse(a.saidas[0]);
  assert.equal(resumo.comIndicacao, 2);
  assert.equal(resumo.comVitoria, 1);
  assert.match(a.consultas[0].ua, /^filmelier-build\/0\.1 \(\+a@b\.org\)$/);
  assert.equal(a.consultas.length, 5); // categorias + 4 fontes de 1 lote
  assert.deepEqual(a.esperas, [1000, 1000, 1000, 1000]);
});

test('executarOscar: sem contato falha antes de qualquer requisição', async () => {
  const a = ambiente({ contato: undefined });
  assert.equal(await executarOscar(a.base), 1);
  assert.equal(a.consultas.length, 0);
  assert.equal(a.gravados.length, 0);
});

test('executarOscar: falha persistente não grava e vira linha de erro', async () => {
  const a = ambiente({ fetch: async () => ({ ok: false, status: 503, json: async () => ({}) }) });
  assert.equal(await executarOscar(a.base), 1);
  assert.equal(a.gravados.length, 0);
  assert.match(a.erros[0], /oscar-categorias/);
});
