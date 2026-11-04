// Ajudantes dos testes de `executarTemas` (FILMELIER-4): roda a orquestração com mundo simulado e coleta saídas.

import { readFileSync } from 'node:fs';
import { executarTemas } from '../../scripts/lib/temas.mjs';
import { mundoSimulado, baseSintetica } from './mundo-simulado.mjs';

const raizRepo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
export const TABELA = JSON.parse(readFileSync(`${raizRepo}/data/temas.json`, 'utf8'));
export const HUMORES = JSON.parse(readFileSync(`${raizRepo}/data/humores.json`, 'utf8'));
export const TOKEN = 'tok-teste-123';
export const CONTATO = 'teste@exemplo.org';
export const RODADA = new Date('2026-11-04T12:00:00.000Z');

export async function rodar({
  base, anterior = null, mundo = mundoSimulado(), curadoria = { filmes: {} }, tabela = TABELA, token = TOKEN, contato = CONTATO,
  medir = false, relatorio, agora, relogio = () => RODADA, criarSinal, raiz = '/repositorio-ficticio', relatorios,
} = {}) {
  const stdout = [];
  const stderr = [];
  const gravados = [];
  const codigo = await executarTemas({
    dataset: base, anterior, temas: tabela, curadoria, humores: HUMORES, contato, token, medir, relatorio, raiz,
    fetch: mundo.fetch, esperar: mundo.esperar, agora, relogio, criarSinal,
    stdout: (l) => stdout.push(l), stderr: (l) => stderr.push(l),
    gravar: async (texto) => { gravados.push(texto); },
    gravarRelatorio: async (texto) => { (relatorios ?? []).push(texto); },
  });
  const ultimo = stdout.at(-1);
  return {
    codigo, stdout, stderr, gravados, mundo, resumo: ultimo ? JSON.parse(ultimo) : undefined,
    saida: gravados.length > 0 ? JSON.parse(gravados.at(-1)) : undefined,
  };
}

// Cenário com N filmes sintéticos, todos com tmdbId anterior (1000 + índice), keywords por índice e ajustes do anterior.
export function cenario(n, { keywords = () => [], anteriorDe = () => ({}), filmeDe = () => ({}), geradoEmAnterior = '2026-10-28T09:00:00.000Z', semPar } = {}) {
  const base = baseSintetica(n, (i) => filmeDe(i));
  const anterior = {
    meta: { temas: { geradoEm: geradoEmAnterior, lista: [], semPar: semPar ?? {} } },
    filmes: base.filmes.map((f, k) => ({ qid: f.qid, tmdbId: 1000 + k + 1, ...anteriorDe(k + 1) })),
  };
  const mapa = {};
  base.filmes.forEach((_, k) => { mapa[1000 + k + 1] = keywords(k + 1); });
  return { base, anterior, keywords: mapa };
}

// Todas as strings do objeto, em qualquer nível, menos os valores da chave `titulo`.
export function todasAsStrings(valor, saida = [], chave = '') {
  if (typeof valor === 'string') { if (chave !== 'titulo') saida.push(valor); }
  else if (Array.isArray(valor)) valor.forEach((v) => todasAsStrings(v, saida, chave));
  else if (valor && typeof valor === 'object') Object.entries(valor).forEach(([k, v]) => { saida.push(k); todasAsStrings(v, saida, k); });
  return saida;
}

export const todasAsKeywordsDaTabela = (tabela = TABELA) => new Set([
  ...tabela.temas.flatMap((t) => t.keywords), ...tabela.climas.flatMap((c) => c.keywords), ...tabela.ignorar,
]);
