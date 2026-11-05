import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// FILMELIER-5 (AC-20): a suíte node:test roda sem `node_modules` (workflow semanal sem `npm ci`),
// então todo import dela é relativo ou `node:`.
const tests = new URL('.', import.meta.url).pathname;

function origens(fonte) {
  const padrao = /^\s*(?:import|export)\s[^'"\n]*?from\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/gm;
  return [...fonte.matchAll(padrao)].map((m) => m[1] ?? m[2] ?? m[3]);
}

function arquivosDe(dir, filtro) {
  return readdirSync(dir).filter(filtro).map((n) => join(dir, n));
}

test('AC-20: todo import de tests/*.test.mjs e tests/apoio/*.mjs é relativo ou node:', () => {
  const alvos = [
    ...arquivosDe(tests, (n) => n.endsWith('.test.mjs')),
    ...arquivosDe(join(tests, 'apoio'), (n) => n.endsWith('.mjs')),
  ];
  assert.ok(alvos.length > 10);
  for (const arq of alvos) {
    for (const origem of origens(readFileSync(arq, 'utf8'))) {
      assert.ok(origem.startsWith('./') || origem.startsWith('../') || origem.startsWith('node:'), `${arq}: ${origem}`);
    }
  }
});

test('AC-20: o detector de imports reconhece pacote npm', () => {
  const amostra = ['imp', "ort x from 'react';\nconst m = await imp", "ort('vite');"].join('');
  assert.deepEqual(origens(amostra), ['react', 'vite']);
});
