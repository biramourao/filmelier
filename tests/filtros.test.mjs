import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recomendar, filtrarFilmes, normalizarFiltros } from '../src/recomendar.mjs';
import { criarGerador } from './apoio/gerador.mjs';

const tabela = JSON.parse(readFileSync(new URL('../data/humores.json', import.meta.url), 'utf8'));
const COMEDIA = 'Q157443';
const ANIMACAO = 'Q202866';
const TERROR = 'Q200092';
const MUSICAL = 'Q842256';
const MSG = 'Nenhum filme com esses filtros. Tente ampliar o período, baixar a nota mínima ou mudar o filtro de Oscar.';

let n = 5000;
function filme(generos, ano, nota, sitelinks = 50, oscar = {}) {
  n += 1;
  const f = { qid: `Q${n}`, titulo: `F${n}`, ano, generos, sitelinks, ...oscar };
  if (nota !== undefined) f.nota = nota;
  return f;
}
const chamar = (filmes, humorId, generoQid, extra = {}) =>
  recomendar({ filmes, humores: tabela, humorId, generoQid, rng: criarGerador(1), ...extra });

test('ano: fronteiras inclusivas em anoDe e anoAte', () => {
  const f = [filme([ANIMACAO], 1989), filme([ANIMACAO], 1990), filme([ANIMACAO], 1999), filme([ANIMACAO], 2000)];
  const r = chamar(f, 'leve', null, { anoDe: 1990, anoAte: 1999 });
  assert.deepEqual(r.filmes.map((x) => x.ano).sort(), [1990, 1999]);
});

test('ano: só anoDe ou só anoAte', () => {
  const f = [filme([ANIMACAO], 1980), filme([ANIMACAO], 2010)];
  assert.deepEqual(chamar(f, 'leve', null, { anoDe: 2000 }).filmes.map((x) => x.ano), [2010]);
  assert.deepEqual(chamar(f, 'leve', null, { anoAte: 1999 }).filmes.map((x) => x.ano), [1980]);
});

test('ano: anoDe maior que anoAte é tratado como engano e os valores são trocados', () => {
  assert.deepEqual(normalizarFiltros({ anoDe: 1999, anoAte: 1990 }), { anoDe: 1990, anoAte: 1999, notaMin: null, oscar: '' });
  const f = [filme([ANIMACAO], 1985), filme([ANIMACAO], 1995)];
  const r = chamar(f, 'leve', null, { anoDe: 1999, anoAte: 1990 });
  assert.deepEqual(r.filmes.map((x) => x.ano), [1995]);
});

test('nota: notaMin inclusivo; filme sem nota é excluído quando notaMin definido', () => {
  const f = [filme([ANIMACAO], 2000, 7), filme([ANIMACAO], 2000, 6.9), filme([ANIMACAO], 2000)];
  assert.deepEqual(filtrarFilmes(f, { notaMin: 7 }).map((x) => x.nota), [7]);
  assert.equal(filtrarFilmes(f, {}).length, 3);
  assert.equal(chamar(f, 'leve', null, { notaMin: 7 }).filmes.length, 1);
  assert.equal(chamar(f, 'leve', null).filmes.length, 3);
});

test('valores vazios (null, undefined, "") equivalem a sem filtro', () => {
  const f = [filme([ANIMACAO], 2000)];
  assert.equal(chamar(f, 'leve', null, { anoDe: '', anoAte: null, notaMin: undefined }).filmes.length, 1);
});

test('combinação com relaxamento: o nível opera sobre o conjunto filtrado', () => {
  const antigoAmbos = filme([TERROR, COMEDIA], 1980, 8);
  const novoSoComedia = filme([COMEDIA], 2005, 8);
  const novoSoTerror = filme([TERROR], 2005, 8);
  const todos = [antigoAmbos, novoSoComedia, novoSoTerror];
  // Sem filtro, humor+genero acharia o antigo; com anoDe 2000 cai para o gênero (aviso do relaxamento atual).
  const r = chamar(todos, 'medo', COMEDIA, { anoDe: 2000 });
  assert.equal(r.nivel, 'genero');
  assert.deepEqual(r.filmes.map((x) => x.qid), [novoSoComedia.qid]);
  assert.match(r.aviso, /Mostrando filmes de Comédia/);
  const r2 = chamar(todos, 'medo', MUSICAL, { anoDe: 2000 });
  assert.equal(r2.nivel, 'humor');
  assert.deepEqual(r2.filmes.map((x) => x.qid), [novoSoTerror.qid]);
});

test('conjunto filtrado sem elegível: nível nenhum com a mensagem dos filtros', () => {
  const r = chamar([filme([ANIMACAO], 1990, 5)], 'leve', null, { notaMin: 9 });
  assert.equal(r.nivel, 'nenhum');
  assert.deepEqual(r.filmes, []);
  assert.equal(r.mensagem, MSG);
  assert.equal(r.aviso, '');
});

test('sem filtros a mensagem de nenhum continua a antiga', () => {
  const r = chamar([], 'leve', null);
  assert.equal(r.mensagem, 'Não encontramos filmes para essa combinação. Escolha outro humor ou gênero.');
});

test('máximo 5, sem repetição, top 40 por sitelinks dentro do filtrado e anteriores respeitados', () => {
  const f = Array.from({ length: 60 }, (_, i) => filme([ANIMACAO], 1990 + (i % 10), 8, i + 1));
  f.push(...Array.from({ length: 20 }, (_, i) => filme([ANIMACAO], 1950, 9, 1000 + i)));
  const extra = { anoDe: 1990, anoAte: 1999, notaMin: 7 };
  const r = chamar(f, 'leve', null, extra);
  assert.equal(r.filmes.length, 5);
  assert.equal(new Set(r.filmes.map((x) => x.qid)).size, 5);
  const top = new Set(f.filter((x) => x.ano >= 1990).sort((a, b) => b.sitelinks - a.sitelinks).slice(0, 40).map((x) => x.qid));
  for (const x of r.filmes) assert.ok(top.has(x.qid));
  const r2 = chamar(f, 'leve', null, { ...extra, anteriores: r.filmes.map((x) => x.qid) });
  assert.equal(r2.filmes.filter((x) => r.filmes.some((y) => y.qid === x.qid)).length, 0);
});

test('oscar: normalização aceita só indicado e vencedor; o resto vale como qualquer', () => {
  assert.equal(normalizarFiltros({ oscar: 'indicado' }).oscar, 'indicado');
  assert.equal(normalizarFiltros({ oscar: 'vencedor' }).oscar, 'vencedor');
  for (const v of ['', undefined, null, 'x', 1]) assert.equal(normalizarFiltros({ oscar: v }).oscar, '');
});

test('oscar: indicado exige oscarIndicacoes > 0 e vencedor exige oscarVitorias > 0', () => {
  const sem = filme([ANIMACAO], 1990);
  const indicado = filme([ANIMACAO], 1990, undefined, 50, { oscarIndicacoes: 3 });
  const vencedor = filme([ANIMACAO], 1990, undefined, 50, { oscarVitorias: 1, oscarIndicacoes: 4 });
  const todos = [sem, indicado, vencedor];
  assert.deepEqual(filtrarFilmes(todos, { oscar: '' }).map((x) => x.qid), todos.map((x) => x.qid));
  assert.deepEqual(filtrarFilmes(todos, { oscar: 'indicado' }).map((x) => x.qid), [indicado.qid, vencedor.qid]);
  assert.deepEqual(filtrarFilmes(todos, { oscar: 'vencedor' }).map((x) => x.qid), [vencedor.qid]);
});

test('oscar: combina com época e nota antes do relaxamento e zera com a mensagem dos filtros', () => {
  const alvo = filme([ANIMACAO], 2005, 8.5, 50, { oscarIndicacoes: 2 });
  const velho = filme([ANIMACAO], 1950, 9, 50, { oscarVitorias: 2, oscarIndicacoes: 2 });
  const baixa = filme([ANIMACAO], 2005, 5, 50, { oscarIndicacoes: 2 });
  const r = chamar([alvo, velho, baixa, filme([ANIMACAO], 2005, 9)], 'leve', null, { anoDe: 2000, anoAte: 2009, notaMin: 8, oscar: 'indicado' });
  assert.deepEqual(r.filmes.map((x) => x.qid), [alvo.qid]);
  const vazio = chamar([alvo, baixa], 'leve', null, { oscar: 'vencedor' });
  assert.equal(vazio.nivel, 'nenhum');
  assert.equal(vazio.mensagem, MSG);
});
