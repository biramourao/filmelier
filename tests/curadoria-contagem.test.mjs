import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validarCuradoria } from '../scripts/lib/temas.mjs';

const raiz = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { filmes } = JSON.parse(readFileSync(`${raiz}/data/curadoria-temas.json`, 'utf8'));
const tabela = JSON.parse(readFileSync(`${raiz}/data/temas.json`, 'utf8'));
const HARRY_POTTER = ['Q102438', 'Q102244', 'Q102225', 'Q102448', 'Q161687', 'Q102235', 'Q161678', 'Q232009'];
const comTema = (tema) => Object.entries(filmes).filter(([, e]) => (e.adicionar ?? []).includes(tema)).map(([q]) => q);

test('AC-5: no mínimo 20 QIDs com conto-de-fadas e 20 com princesas', () => {
  assert.ok(comTema('conto-de-fadas').length >= 20);
  assert.ok(comTema('princesas').length >= 20);
});

test('AC-5: Alice 2010 em conto-de-fadas e os 8 Harry Potter com clima sombrio e sem conto-de-fadas', () => {
  assert.ok(comTema('conto-de-fadas').includes('Q174385'));
  for (const q of HARRY_POTTER) {
    assert.equal(filmes[q]?.clima, 'sombrio', q);
    assert.ok(!(filmes[q].adicionar ?? []).includes('conto-de-fadas'), q);
  }
});

test('AC-5: a curadoria versionada passa na validação (temas existentes, clima válido)', () => {
  assert.deepEqual(validarCuradoria({ filmes }, tabela), []);
});
