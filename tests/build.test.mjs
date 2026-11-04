import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executarBuild, gerarLotes } from '../scripts/lib/build.mjs';
import { listarGeneros } from '../src/recomendar.mjs';

const tabela = JSON.parse(readFileSync(new URL('../data/humores.json', import.meta.url), 'utf8'));
const generos = listarGeneros(tabela).map((g) => g.qid);
const ENT = 'http://www.wikidata.org/entity/';

// 2.000 filmes sintéticos em rodízio de gêneros: atende a todos os invariantes.
const bindings = Array.from({ length: 2000 }, (_, i) => ({
  film: { value: `${ENT}Q${5000 + i}` },
  g: { value: `${ENT}${generos[i % generos.length]}` },
  date: { value: '2001-02-03T00:00:00Z' },
  sl: { value: '25' },
  tpt: { value: `Filme ${i}` },
}));
const corpoOk = { results: { bindings } };

function ambiente(sobrescrever = {}) {
  const saida = { stdout: [], stderr: [], gravados: [], esperas: [] };
  const opcoes = {
    tabela,
    contato: 'teste@example.org',
    fetch: async () => ({ ok: true, status: 200, json: async () => corpoOk }),
    esperar: async (ms) => saida.esperas.push(ms),
    stdout: (linha) => saida.stdout.push(linha),
    stderr: (linha) => saida.stderr.push(linha),
    gravar: async (texto) => saida.gravados.push(texto),
    agora: () => 0,
    relogio: () => new Date('2026-11-20T13:45:00.000Z'),
    ...sobrescrever,
  };
  return { opcoes, saida };
}

function linhasJson(linhas) {
  return linhas.map((l) => JSON.parse(l.replace(/\n$/, '')));
}

test('gerarLotes: 1 lote por QID da tabela, com o QID como nome', () => {
  const lotes = gerarLotes(['Q1', 'Q2']);
  assert.deepEqual(lotes, [{ nome: 'Q1', qid: 'Q1' }, { nome: 'Q2', qid: 'Q2' }]);
});

test('AC-17: sucesso grava o dataset e imprime o resumo na última linha de stdout', async () => {
  const { opcoes, saida } = ambiente();
  const codigo = await executarBuild(opcoes);
  assert.equal(codigo, 0);
  assert.equal(saida.stderr.length, 0);
  assert.equal(saida.gravados.length, 1);
  const dataset = JSON.parse(saida.gravados[0]);
  assert.equal(dataset.meta.total, 2000);
  assert.equal(dataset.meta.fonte, 'Wikidata');
  assert.equal(dataset.meta.licenca, 'CC0 1.0');
  assert.equal(dataset.meta.geradoEm, '2026-11-20T13:45:00.000Z');
  const resumo = JSON.parse(saida.stdout.at(-1));
  assert.deepEqual(Object.keys(resumo).sort(), ['bytes', 'duracaoMs', 'lotes', 'porGenero', 'porHumor', 'total']);
  assert.equal(resumo.total, 2000);
  assert.equal(resumo.lotes.length, generos.length);
});

test('AC-17: lote que rejeita sempre gera 1 linha JSON em stderr com erro e lote, sem gravação', async () => {
  const { opcoes, saida } = ambiente({ fetch: async () => ({ ok: false, status: 504, json: async () => ({}) }) });
  const codigo = await executarBuild(opcoes);
  assert.notEqual(codigo, 0);
  assert.equal(saida.stderr.length, 1);
  const [linha] = linhasJson(saida.stderr);
  assert.ok('erro' in linha && 'lote' in linha);
  assert.equal(saida.gravados.length, 0);
});

test('AC-17: duracaoMs do lote mede só a tentativa que respondeu', async () => {
  let relogio = 0;
  let chamadas = 0;
  const { opcoes, saida } = ambiente({
    agora: () => relogio,
    esperar: async (ms) => { relogio += ms; },
    fetch: async () => {
      chamadas += 1;
      if (chamadas === 1) {
        relogio += 50000;
        return { ok: false, status: 504, json: async () => ({}) };
      }
      relogio += 700;
      return { ok: true, status: 200, json: async () => corpoOk };
    },
  });
  const codigo = await executarBuild(opcoes);
  assert.equal(codigo, 0);
  const resumo = JSON.parse(saida.stdout.at(-1));
  assert.equal(resumo.lotes[0].duracaoMs, 700);
  assert.ok(resumo.duracaoMs > 700);
});

test('AC-13: contato ausente ou vazio falha antes da rede com invariante contato', async () => {
  for (const contato of [undefined, '']) {
    let chamadas = 0;
    const { opcoes, saida } = ambiente({ contato, fetch: async () => { chamadas += 1; } });
    const codigo = await executarBuild(opcoes);
    assert.notEqual(codigo, 0);
    assert.equal(chamadas, 0);
    assert.equal(saida.stderr.length, 1);
    const [linha] = linhasJson(saida.stderr);
    assert.equal(linha.invariante, 'contato');
    assert.ok('erro' in linha);
    assert.equal(saida.gravados.length, 0);
  }
});

test('AC-13 (A-7): esquema-humores vem antes de contato', async () => {
  const ruim = structuredClone(tabela);
  ruim.humores[0].generos[0].qid = 'QX';
  let chamadas = 0;
  const { opcoes, saida } = ambiente({ tabela: ruim, contato: undefined, fetch: async () => { chamadas += 1; } });
  const codigo = await executarBuild(opcoes);
  assert.notEqual(codigo, 0);
  assert.equal(chamadas, 0);
  assert.equal(saida.stderr.length, 1);
  assert.equal(linhasJson(saida.stderr)[0].invariante, 'esquema-humores');
});

test('AC-17: falha de invariante identifica o invariante e não grava', async () => {
  const pouco = { results: { bindings: bindings.slice(0, 100) } };
  const { opcoes, saida } = ambiente({ fetch: async () => ({ ok: true, status: 200, json: async () => pouco }) });
  const codigo = await executarBuild(opcoes);
  assert.notEqual(codigo, 0);
  assert.equal(saida.gravados.length, 0);
  const linhas = linhasJson(saida.stderr);
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].invariante, 'total-minimo');
});

test('AC-17: toda linha de stderr é JSON válido', async () => {
  const { opcoes, saida } = ambiente({ contato: 'sem-formato' });
  await executarBuild(opcoes);
  for (const l of saida.stderr) assert.doesNotThrow(() => JSON.parse(l));
  assert.ok(saida.stderr.length >= 1);
});
