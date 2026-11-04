import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarNota, calcularNotas, suavizarNotas, calcularNotasBrutas, montarConsultaNotas, dividirEmLotes, validarNotas, executarNotas, distribuicao,
} from '../scripts/lib/notas.mjs';

const lig = (qid, score, by) => ({
  film: { value: `http://www.wikidata.org/entity/${qid}` },
  score: { value: score },
  by: { value: `http://www.wikidata.org/entity/${by}` },
});
const RT = 'Q105584';
const MC = 'Q150248';

test('normalização: percentual, fração e descarte', () => {
  assert.equal(normalizarNota('93%'), 9.3);
  assert.equal(normalizarNota('8.4/10'), 8.4);
  assert.equal(normalizarNota('67/100'), 6.7);
  assert.equal(normalizarNota('3.4/5'), 6.8);
  assert.equal(normalizarNota('8,4/10'), 8.4);
  assert.equal(normalizarNota('150%'), null);
  assert.equal(normalizarNota('12/10'), null);
  assert.equal(normalizarNota('5/0'), null);
  assert.equal(normalizarNota('bom'), null);
  assert.equal(normalizarNota(undefined), null);
});

test('média por fonte e depois entre fontes, 1 casa; sem valor válido omite', () => {
  const notas = calcularNotas([
    lig('Q1', '8.4/10', RT), lig('Q1', '80%', RT), lig('Q1', '67/100', MC), // RT 8.2, MC 6.7 -> 7.45 -> 7.5 (arredonda)
    lig('Q2', '9/10', RT), // só RT
    lig('Q3', '150%', RT), // inválido
    lig('Q4', '70/100', 'Q37312'), // fonte fora da lista
  ]);
  assert.equal(notas.get('Q1'), 7.5);
  assert.equal(notas.get('Q2'), 9);
  assert.equal(notas.has('Q3'), false);
  assert.equal(notas.has('Q4'), false);
});

test('consulta com VALUES e lotes de no máximo 300', () => {
  const consulta = montarConsultaNotas(['Q1', 'Q2']);
  assert.match(consulta, /VALUES \?film \{ wd:Q1 wd:Q2 \}/);
  assert.match(consulta, /wd:Q105584 wd:Q150248/);
  assert.match(consulta, /p:P444/);
  assert.match(consulta, /pq:P447/);
  const lotes = dividirEmLotes(Array.from({ length: 650 }, (_, i) => `Q${i}`));
  assert.deepEqual(lotes.map((l) => l.length), [300, 300, 50]);
});

test('validarNotas aceita ausente e 1 casa; recusa fora da faixa e 2 casas', () => {
  assert.deepEqual(validarNotas([{ qid: 'Q1' }, { qid: 'Q2', nota: 7.5 }, { qid: 'Q3', nota: 0 }, { qid: 'Q4', nota: 10 }]), []);
  assert.equal(validarNotas([{ qid: 'Q1', nota: 10.1 }]).length, 1);
  assert.equal(validarNotas([{ qid: 'Q1', nota: 7.55 }]).length, 1);
  assert.equal(validarNotas([{ qid: 'Q1', nota: '7' }]).length, 1);
});

test('distribuição acumulada por faixa', () => {
  assert.deepEqual(distribuicao([{ nota: 9.1 }, { nota: 7 }, { nota: 5 }, {}]), { com6: 2, com7: 2, com8: 1, com9: 1 });
});

function ambiente(extras = {}) {
  const dataset = {
    meta: { geradoEm: '2026-01-01T00:00:00.000Z', fonte: 'Wikidata', licenca: 'CC0 1.0', total: 3, extra: { preservado: true } },
    filmes: [
      { qid: 'Q3', titulo: 'C', ano: 2000, generos: ['Q1'], sitelinks: 5 },
      { qid: 'Q1', titulo: 'A', ano: 1990, generos: ['Q1'], sitelinks: 9, imdb: 'tt1', oscarVitorias: 4, oscarIndicacoes: 4 },
      { qid: 'Q2', titulo: 'B', ano: 1980, generos: ['Q1'], sitelinks: 7 },
    ],
  };
  const saidas = [];
  const erros = [];
  const esperas = [];
  const urls = [];
  const gravados = [];
  const base = {
    dataset,
    contato: 'a@b.org',
    esperar: async (ms) => esperas.push(ms),
    stdout: (l) => saidas.push(l),
    stderr: (l) => erros.push(l),
    gravar: async (t) => gravados.push(t),
    fetch: async (url, opcoes) => {
      urls.push({ url, ua: opcoes.headers['User-Agent'] });
      return { ok: true, status: 200, json: async () => ({ results: { bindings: [lig('Q1', '8/10', RT), lig('Q3', '60%', RT)] } }) };
    },
    ...extras,
  };
  return { base, saidas, erros, esperas, urls, gravados };
}

test('executarNotas: grava nota sem mexer nos outros campos nem na ordem; meta.notas; resumo', async () => {
  const a = ambiente();
  assert.equal(await executarNotas(a.base), 0);
  const saida = JSON.parse(a.gravados[0]);
  assert.deepEqual(saida.filmes.map((f) => f.qid), ['Q3', 'Q1', 'Q2']);
  // sem filme de duas fontes: M = média de todos com nota = 7; fonte única: 0,75 x nota + 0,25 x 7
  assert.equal(saida.filmes[0].nota, 6.3);
  assert.equal(saida.filmes[1].nota, 7.8);
  assert.equal(saida.meta.notas.mediaReferencia, 7);
  assert.equal(saida.meta.notas.fonteUnica, 2);
  assert.deepEqual(saida.meta.extra, { preservado: true });
  assert.equal(saida.filmes[0].titulo, 'C');
  assert.equal('nota' in saida.filmes[2], false);
  assert.equal(saida.filmes[1].imdb, 'tt1');
  assert.equal(saida.filmes[1].oscarVitorias, 4);
  assert.equal(saida.filmes[1].oscarIndicacoes, 4);
  assert.equal(saida.meta.geradoEm, '2026-01-01T00:00:00.000Z');
  assert.equal(saida.meta.notas.com, 2);
  assert.equal(saida.meta.notas.total, 3);
  assert.match(saida.meta.notas.geradoEm, /^\d{4}-\d{2}-\d{2}T/);
  const resumo = JSON.parse(a.saidas[0]);
  assert.equal(resumo.comNota, 2);
  assert.match(a.urls[0].ua, /^filmelier-build\/0\.1 \(\+a@b\.org\)$/);
  assert.deepEqual(a.esperas, []); // 1 lote só: sem pausa
});

test('executarNotas: sem contato falha antes de qualquer requisição', async () => {
  const a = ambiente({ contato: undefined });
  assert.equal(await executarNotas(a.base), 1);
  assert.equal(a.urls.length, 0);
  assert.equal(a.gravados.length, 0);
});

test('executarNotas: pausa de 1 s entre lotes e nenhum lote passa de 300', async () => {
  const filmes = Array.from({ length: 650 }, (_, i) => ({ qid: `Q${i + 1}`, titulo: 't', ano: 2000, generos: ['Q1'], sitelinks: 1 }));
  const a = ambiente();
  a.base.dataset = { meta: { total: 650 }, filmes };
  assert.equal(await executarNotas(a.base), 0);
  assert.equal(a.urls.length, 3);
  assert.deepEqual(a.esperas, [1000, 1000]);
});

test('executarNotas: falha persistente não grava e vira linha de erro', async () => {
  const a = ambiente({ fetch: async () => ({ ok: false, status: 503, json: async () => ({}) }) });
  assert.equal(await executarNotas(a.base), 1);
  assert.equal(a.gravados.length, 0);
  assert.match(a.erros[0], /notas-1/);
});

test('suavização: fonte única 10 com M 6,8 vira 9,2; duas fontes ficam; M só de filmes de duas fontes', () => {
  const brutas = calcularNotasBrutas([
    lig('Q1', '100%', RT), // fonte única 10
    lig('Q2', '60%', RT), lig('Q2', '60/100', MC), // duas fontes 6
    lig('Q3', '76%', RT), lig('Q3', '76/100', MC), // duas fontes 7,6
    lig('Q4', '10%', RT), // fonte única 1: não entra na M
  ]);
  const { notas, mediaReferencia, fonteUnica } = suavizarNotas(brutas);
  assert.equal(mediaReferencia, 6.8);
  assert.equal(fonteUnica, 2);
  assert.equal(notas.get('Q1'), 9.2);
  assert.equal(notas.get('Q2'), 6);
  assert.equal(notas.get('Q3'), 7.6);
  assert.equal(notas.get('Q4'), 2.5); // 0,75 x 1 + 0,25 x 6,8 = 2,45 -> 2,5
});

test('suavização: sem nenhum filme de duas fontes, M é a média de todos com nota', () => {
  const { notas, mediaReferencia, fonteUnica } = suavizarNotas(calcularNotasBrutas([lig('Q1', '100%', RT), lig('Q2', '40%', MC)]));
  assert.equal(mediaReferencia, 7);
  assert.equal(fonteUnica, 2);
  assert.equal(notas.get('Q1'), 9.3); // 7,5 + 1,75 = 9,25 -> 9,3
  assert.equal(notas.get('Q2'), 4.8); // 3 + 1,75
});
