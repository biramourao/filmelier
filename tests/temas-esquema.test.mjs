import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validarTemas } from '../scripts/lib/temas.mjs';

const raiz = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const tabela = JSON.parse(readFileSync(`${raiz}/data/temas.json`, 'utf8'));
const humores = JSON.parse(readFileSync(`${raiz}/data/humores.json`, 'utf8'));
const clonar = () => structuredClone(tabela);
const reprova = (t) => {
  const erros = validarTemas(t, humores);
  assert.ok(erros.length > 0);
  assert.equal(erros[0].invariante, 'esquema-temas');
};

test('AC-3: esquema do arquivo versionado válido, de 40 a 60 temas', () => {
  assert.deepEqual(validarTemas(tabela, humores), []);
  assert.ok(tabela.temas.length >= 40 && tabela.temas.length <= 60);
  assert.equal(tabela.temas.length, 60);
});

test('AC-3: ids únicos no padrão, rótulos únicos e não vazios, no mínimo 1 keyword por tema', () => {
  const ids = tabela.temas.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  const rotulos = [...tabela.temas, ...tabela.climas].map((t) => t.rotulo);
  assert.equal(new Set(rotulos).size, rotulos.length);
  for (const t of tabela.temas) assert.ok(t.rotulo.length > 0 && t.keywords.length >= 1);
});

test('AC-3: nenhuma keyword de `ignorar` aparece em algum tema', () => {
  const doTema = new Set(tabela.temas.flatMap((t) => t.keywords));
  assert.deepEqual(tabela.ignorar.filter((k) => doTema.has(k)), []);
});

test('AC-16: nenhum rótulo é igual a uma keyword do mesmo tema ou nível (sem diferenciar maiúsculas)', () => {
  for (const t of [...tabela.temas, ...tabela.climas]) {
    assert.ok(!t.keywords.some((k) => k.toLowerCase() === t.rotulo.toLowerCase()), t.id);
  }
});

test('AC-3: o tema de máfia tem id crime-organizado e nenhum id é igual a keyword', () => {
  assert.ok(tabela.temas.some((t) => t.id === 'crime-organizado' && t.rotulo === 'Crime organizado'));
  assert.ok(!tabela.temas.some((t) => t.id === 'mafia'));
  const palavras = new Set([...tabela.temas, ...tabela.climas].flatMap((t) => t.keywords).concat(tabela.ignorar));
  for (const id of [...tabela.temas, ...tabela.climas].map((t) => t.id)) assert.ok(!palavras.has(id), id);
});

test('AC-16: rótulos de clima em pt-BR (A-7)', () => {
  const porId = Object.fromEntries(tabela.climas.map((c) => [c.id, c.rotulo]));
  assert.deepEqual(porId, { sombrio: 'Clima sombrio', intermediario: 'Clima intermediário', leve: 'Clima leve' });
});

test('AC-3: generosClima só com QIDs de data/humores.json', () => {
  assert.deepEqual(tabela.generosClima, {
    Q1361932: 'leve', Q202866: 'leve', Q188473: 'intermediario', Q2484376: 'intermediario', Q200092: 'sombrio',
  });
  const t = clonar();
  t.generosClima.Q999 = 'leve';
  reprova(t);
});

test('AC-3: id Bruxaria (maiúscula) reprova', () => {
  const t = clonar();
  t.temas[4].id = 'Bruxaria';
  reprova(t);
});

test('AC-3: id mafia igual à keyword mafia reprova', () => {
  const t = clonar();
  const i = t.temas.findIndex((x) => x.id === 'crime-organizado');
  t.temas[i].id = 'mafia';
  reprova(t);
});

test('AC-3: tema de id sombrio (igual ao de clima) reprova', () => {
  const t = clonar();
  t.temas[0].id = 'sombrio';
  reprova(t);
});

test('AC-3: reprovações do esquema (contagem, repetições, rótulo, keyword, clima, ignorar)', () => {
  let t = clonar(); t.temas = t.temas.slice(0, 39); reprova(t);
  t = clonar(); t.temas[1].id = t.temas[0].id; reprova(t);
  t = clonar(); t.temas[1].rotulo = t.temas[0].rotulo; reprova(t);
  t = clonar(); t.temas[0].rotulo = 'Fairy Tale'; reprova(t);
  t = clonar(); t.temas[0].keywords = []; reprova(t);
  t = clonar(); t.temas[0].keywords = ['Fairy Tale']; reprova(t);
  t = clonar(); t.temas[0].keywords = [' fairy tale']; reprova(t);
  t = clonar(); t.temas[0].clima = 'triste'; reprova(t);
  t = clonar(); t.ignorar.push('witch'); reprova(t);
  t = clonar(); t.climas = t.climas.slice(0, 2); reprova(t);
  reprova(null);
});

test('AC-6: só temas inequívocos definem clima; os ambíguos (bruxaria, magia, fantasmas, vampiros, dragões, mitologia, ocultismo) não', () => {
  const comClima = tabela.temas.filter((t) => 'clima' in t).map((t) => t.id);
  for (const id of ['bruxaria', 'magia', 'fantasmas', 'vampiros', 'lobisomens', 'dragoes-e-criaturas', 'mitologia', 'ocultismo-e-maldicoes', 'escola-de-magia', 'fantasia-epica', 'guerra']) {
    assert.ok(!comClima.includes(id), id);
  }
  for (const id of ['zumbis', 'assassino-em-serie', 'demonios-e-possessao']) assert.ok(comClima.includes(id), id);
  const sombrios = tabela.temas.filter((t) => t.clima === 'sombrio').map((t) => t.id).sort();
  assert.deepEqual(sombrios, ['assassino-em-serie', 'crime-organizado', 'demonios-e-possessao', 'suspense-psicologico', 'zumbis']);
});
