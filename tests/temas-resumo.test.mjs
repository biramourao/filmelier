import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularCobertura } from '../scripts/lib/temas.mjs';
import { mundoSimulado, baseSintetica } from './apoio/mundo-simulado.mjs';
import { rodar, cenario, HUMORES, TOKEN } from './apoio/rodar-temas.mjs';

const CHAVES = [
  'total', 'comTmdbId', 'origemTmdbId', 'coberturaP4947', 'findsNaRodada', 'pendentesFind', 'divergenciaAno', 'semKeywords',
  'falhasKeywords', 'tagsMantidas', 'tagsExpiradas', 'chamadas', 'lotesWdqs', 'porTema', 'porClima', 'abaixoDoLimiar', 'curadoria',
  'cobertura', 'bytes', 'alertaTamanho', 'duracaoMs',
];
const linhasJson = (linhas) => linhas.map((l) => JSON.parse(l));

async function rodadaDeSucesso(extra = {}) {
  const c = cenario(100, { keywords: () => ['school of witchcraft', 'witch'] });
  const mundo = mundoSimulado({ keywords: (id) => (id === 1007 ? 500 : c.keywords[id]) });
  return rodar({ base: c.base, anterior: c.anterior, mundo, ...extra });
}

test('AC-8: o resumo tem exatamente as 21 chaves, e origemTmdbId e curadoria as subchaves exatas', async () => {
  const r = await rodadaDeSucesso();
  assert.equal(r.codigo, 0);
  assert.equal(CHAVES.length, 21);
  assert.deepEqual(Object.keys(r.resumo).sort(), [...CHAVES].sort());
  assert.deepEqual(Object.keys(r.resumo.origemTmdbId).sort(), ['anterior', 'find', 'wikidata']);
  assert.deepEqual(Object.keys(r.resumo.curadoria).sort(), ['aplicadas', 'qidsAusentes']);
  assert.deepEqual(Object.keys(r.resumo.cobertura).sort(), ['comClima', 'comTema', 'temasPorGeneroMin']);
  assert.equal(r.resumo.total, 100);
  assert.equal(r.resumo.comTmdbId, 100);
  assert.equal(r.resumo.chamadas, 102); // 100 filmes + 2 novas tentativas do filme com 500
  assert.equal(r.resumo.coberturaP4947, 0);
  assert.equal(r.resumo.bytes, Buffer.byteLength(r.gravados[0], 'utf8'));
  assert.equal(typeof r.resumo.duracaoMs, 'number');
  assert.equal(r.stdout.length, 1);
});

test('AC-8: coberturaP4947 é resolvidos pela P4947 sobre consultados no WDQS, com 4 casas', async () => {
  const mundo = mundoSimulado({ p4947: { Q1: [10] }, find: () => null });
  const r = await rodar({ base: baseSintetica(3), mundo });
  assert.equal(r.resumo.coberturaP4947, 0.3333);
  assert.deepEqual(r.resumo.origemTmdbId, { anterior: 0, wikidata: 1, find: 0 });
});

test('AC-8: stderr só tem linhas JSON com erro e invariante ou lote, também com falha pontual e com curadoria inválida', async () => {
  const ok = await rodadaDeSucesso();
  assert.ok(ok.stderr.length >= 1);
  for (const l of linhasJson(ok.stderr)) assert.ok('erro' in l && ('invariante' in l || 'lote' in l));
  const c = cenario(3);
  const ruim = await rodar({ base: c.base, anterior: c.anterior, curadoria: { filmes: { Q1: { adicionar: ['xyz'] } } } });
  assert.equal(ruim.stderr.length, 1);
  for (const l of linhasJson(ruim.stderr)) assert.ok('erro' in l && ('invariante' in l || 'lote' in l));
});

test('AC-8: nenhuma linha de stdout ou stderr tem o token nem a keyword bruta', async () => {
  const ok = await rodadaDeSucesso();
  const falha = await rodar({ base: baseSintetica(2), mundo: mundoSimulado({ p4947: () => 504 }) });
  for (const linha of [...ok.stdout, ...ok.stderr, ...falha.stdout, ...falha.stderr]) {
    assert.ok(!linha.includes(TOKEN));
    assert.ok(!linha.includes('school of witchcraft'));
  }
});

test('AC-8: cálculo da cobertura com 10 filmes sintéticos e 2 gêneros', () => {
  const G = (...q) => q;
  const f = (generos, tags, clima) => ({ generos, ...(tags ? { tags } : {}), ...(clima ? { clima } : {}) });
  const A = 'Q157443';
  const B = 'Q860626';
  const filmes = [
    f(G(A, B), ['a', 'b', 'c'], 'leve'), f(G(A, B), ['a', 'b', 'c'], 'leve'), f(G(A, B), ['a', 'b', 'c'], 'sombrio'),
    f(G(A, B), ['a'], 'sombrio'), f(G(A, B), ['a']),
    f(G(A), ['a', 'b', 'c']), f(G(A), ['a', 'b', 'c']),
    f(G(A)), f(G(A)), f(G(A)),
  ];
  const humores = { humores: [{ generos: [{ qid: A }, { qid: B }] }] };
  assert.deepEqual(calcularCobertura(filmes, humores), { comTema: 0.7, temasPorGeneroMin: 1, comClima: 0.4 });
  assert.deepEqual(calcularCobertura([], humores), { comTema: 0, temasPorGeneroMin: 0, comClima: 0 });
  assert.equal(HUMORES.humores.flatMap((h) => h.generos).length > 0, true);
});

test('AC-8: --medir não grava e termina com 1 JSON de exatamente as 4 chaves', async () => {
  const c = cenario(30, { keywords: () => ['witch'] });
  const r = await rodar({ base: c.base, anterior: c.anterior, mundo: mundoSimulado({ keywords: c.keywords }), medir: true });
  assert.equal(r.codigo, 0);
  assert.equal(r.gravados.length, 0);
  assert.equal(r.stdout.length, 1);
  assert.deepEqual(Object.keys(r.resumo).sort(), ['abaixoDoLimiar', 'cobertura', 'porClima', 'porTema']);
  assert.equal(r.resumo.porTema.bruxaria, 30);
});

test('AC-8: --medir mostra a contagem antes do limiar (tema com 5 filmes sai em porTema e em abaixoDoLimiar)', async () => {
  const c = cenario(30, { keywords: (i) => (i <= 5 ? ['vampire'] : []) });
  const r = await rodar({ base: c.base, anterior: c.anterior, mundo: mundoSimulado({ keywords: c.keywords }), medir: true });
  assert.equal(r.resumo.porTema.vampiros, 5);
  assert.ok(r.resumo.abaixoDoLimiar.includes('vampiros'));
});

test('AC-8: --relatorio dentro do repositório é recusado antes da rede', async () => {
  const mundo = mundoSimulado();
  const r = await rodar({ base: baseSintetica(2), mundo, medir: true, relatorio: '/repositorio-ficticio/data/frequencia.json', raiz: '/repositorio-ficticio' });
  assert.notEqual(r.codigo, 0);
  assert.equal(mundo.chamadas.length, 0);
  const linhas = linhasJson(r.stderr);
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].invariante, 'relatorio');
  const relativo = await rodar({ base: baseSintetica(2), mundo, medir: true, relatorio: 'data/frequencia.json', raiz: process.cwd() });
  assert.equal(linhasJson(relativo.stderr)[0].invariante, 'relatorio');
  assert.equal(mundo.chamadas.length, 0);
});

test('AC-8: --relatorio fora do repositório recebe só a frequência das keywords sem tema, em --medir', async () => {
  const relatorios = [];
  const c = cenario(3, { keywords: () => ['witch', 'zebra voadora', 'sequel', 'Zebra Voadora'] });
  const r = await rodar({
    base: c.base, anterior: c.anterior, mundo: mundoSimulado({ keywords: c.keywords }), medir: true,
    relatorio: '/tmp/fora-do-repositorio/frequencia.json', raiz: '/repositorio-ficticio', relatorios,
  });
  assert.equal(r.codigo, 0);
  assert.equal(relatorios.length, 1);
  assert.deepEqual(JSON.parse(relatorios[0]), { 'zebra voadora': 6 });
  const semMedir = await rodar({
    base: c.base, anterior: c.anterior, mundo: mundoSimulado({ keywords: c.keywords }), medir: false,
    relatorio: '/tmp/fora-do-repositorio/frequencia.json', raiz: '/repositorio-ficticio', relatorios: [],
  });
  assert.notEqual(semMedir.codigo, 0);
  assert.equal(linhasJson(semMedir.stderr)[0].invariante, 'relatorio');
  assert.equal(semMedir.gravados.length, 0);
});
