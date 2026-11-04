import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validarCuradoria, aplicarCuradoria, aplicarLimiar, manterTags } from '../scripts/lib/temas.mjs';

const raiz = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const tabela = JSON.parse(readFileSync(`${raiz}/data/temas.json`, 'utf8'));

test('AC-5: adicionar tema sem keyword inclui o tema', () => {
  const novo = aplicarCuradoria({ tags: [] }, { adicionar: ['conto-de-fadas'] });
  assert.deepEqual(novo.tags, ['conto-de-fadas']);
});

test('AC-5: remover tema casado pela regra', () => {
  const novo = aplicarCuradoria({ tags: ['bruxaria', 'magia'] }, { remover: ['bruxaria'] });
  assert.deepEqual(novo.tags, ['magia']);
});

test('AC-5: clima da curadoria sobrepõe a regra, inclusive `nenhum`', () => {
  assert.equal(aplicarCuradoria({ tags: [], clima: 'leve' }, { clima: 'sombrio' }).clima, 'sombrio');
  assert.ok(!('clima' in aplicarCuradoria({ tags: [], clima: 'leve' }, { clima: 'nenhum' })));
  assert.equal(aplicarCuradoria({ tags: [] }, { clima: 'leve' }).clima, 'leve');
});

test('AC-5: adicionar e remover não recalculam o clima', () => {
  assert.equal(aplicarCuradoria({ tags: [], clima: 'leve' }, { adicionar: ['bruxaria'] }).clima, 'leve');
});

test('AC-5: tema inexistente na curadoria reprova com curadoria-tema', () => {
  const erros = validarCuradoria({ filmes: { Q1: { adicionar: ['xyz'] } } }, tabela);
  assert.equal(erros[0].invariante, 'curadoria-tema');
  assert.equal(validarCuradoria({ filmes: { Q1: { remover: ['xyz'] } } }, tabela)[0].invariante, 'curadoria-tema');
  assert.equal(validarCuradoria({ filmes: { Q1: { clima: 'triste' } } }, tabela)[0].invariante, 'curadoria-tema');
  assert.deepEqual(validarCuradoria({ filmes: { Q999999999: { adicionar: ['conto-de-fadas'], clima: 'nenhum' } } }, tabela), []);
});

test('AC-5: o mesmo tema em adicionar e remover do mesmo QID reprova com curadoria-tema', () => {
  const erros = validarCuradoria({ filmes: { Q1: { adicionar: ['bruxaria'], remover: ['bruxaria'] } } }, tabela);
  assert.equal(erros.length, 1);
  assert.equal(erros[0].invariante, 'curadoria-tema');
  assert.match(erros[0].erro, /Q1.*bruxaria/);
  assert.deepEqual(validarCuradoria({ filmes: { Q1: { adicionar: ['bruxaria'], remover: ['magia'] }, Q2: { remover: ['bruxaria'] } } }, tabela), []);
});

function estadosCom(n, montar) {
  const m = new Map();
  for (let i = 0; i < n; i++) m.set(`Q${i + 1}`, montar(i));
  return m;
}

test('AC-3: tema com 19 filmes some e aparece em abaixoDoLimiar; com 20 fica', () => {
  let r = aplicarLimiar(estadosCom(19, () => ({ tags: ['bruxaria'] })), tabela);
  assert.ok(r.abaixoDoLimiar.includes('bruxaria'));
  assert.ok(![...r.estados.values()].some((e) => e.tags.includes('bruxaria')));
  assert.ok(!r.lista.some((x) => x.id === 'bruxaria'));
  r = aplicarLimiar(estadosCom(20, () => ({ tags: ['bruxaria'] })), tabela);
  assert.ok([...r.estados.values()].every((e) => e.tags.includes('bruxaria')));
  assert.deepEqual(r.lista.find((x) => x.id === 'bruxaria'), { id: 'bruxaria', rotulo: 'Bruxaria', filmes: 20 });
  assert.ok(!r.abaixoDoLimiar.includes('bruxaria'));
});

test('AC-3: clima abaixo do limiar some e o outro fica com a contagem', () => {
  const estados = estadosCom(49, (i) => (i < 19 ? { tags: [], clima: 'leve' } : { tags: [], clima: 'sombrio' }));
  const r = aplicarLimiar(estados, tabela);
  assert.ok(![...r.estados.values()].some((e) => e.clima === 'leve'));
  assert.ok(r.abaixoDoLimiar.includes('leve'));
  assert.deepEqual(r.lista.find((x) => x.id === 'sombrio'), { id: 'sombrio', rotulo: 'Clima sombrio', filmes: 30 });
});

test('AC-5: curadoria conta no limiar (15 pela regra e 5 pela curadoria)', () => {
  const estados = estadosCom(20, (i) => (i < 15 ? { tags: ['bruxaria'] } : aplicarCuradoria({ tags: [] }, { adicionar: ['bruxaria'] })));
  const r = aplicarLimiar(estados, tabela);
  assert.equal([...r.estados.values()].filter((e) => e.tags.includes('bruxaria')).length, 20);
});

test('AC-3: tags mantidas entram na contagem do limiar', () => {
  const estados = estadosCom(20, (i) => (i < 10 ? { tags: ['bruxaria'] } : manterTags({ tags: ['bruxaria'], clima: 'leve' }, tabela)));
  const r = aplicarLimiar(estados, tabela);
  assert.equal(r.lista.find((x) => x.id === 'bruxaria').filmes, 20);
});

test('AC-7: tag mantida de tema removido é descartada', () => {
  const m = manterTags({ tags: ['bruxaria', 'tema-antigo'], clima: 'sombrio' }, tabela);
  assert.deepEqual(m.tags, ['bruxaria']);
  assert.equal(m.clima, 'sombrio');
});

test('AC-3: lista em ordem de id, com rótulo', () => {
  const r = aplicarLimiar(estadosCom(20, () => ({ tags: ['magia', 'bruxaria'], clima: 'sombrio' })), tabela);
  assert.deepEqual(r.lista.map((x) => x.id), ['bruxaria', 'magia', 'sombrio']);
});
