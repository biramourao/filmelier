import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

// FILMELIER-5 (D-12, AC-17): lista fechada de dependências npm; substitui a política "sem dependências" da FILMELIER-1.
const raiz = new URL('..', import.meta.url);
const pacote = JSON.parse(readFileSync(new URL('package.json', raiz), 'utf8'));

const PERMITIDAS_DEV = new Set([
  'vite', '@vitejs/plugin-react', 'typescript', 'vitest', 'jsdom',
  '@testing-library/react', '@testing-library/dom', '@testing-library/user-event',
  '@types/react', '@types/react-dom', '@types/node',
]);

test('AC-17: dependencies são exatamente react e react-dom', () => {
  assert.deepEqual(Object.keys(pacote.dependencies ?? {}).sort(), ['react', 'react-dom']);
});

test('AC-17: devDependencies só da lista fechada de D-12', () => {
  const nomes = Object.keys(pacote.devDependencies ?? {});
  assert.ok(nomes.length > 0);
  for (const nome of nomes) assert.ok(PERMITIDAS_DEV.has(nome), `fora da lista: ${nome}`);
});

test('AC-17: versões exatas, sem wrangler e package-lock.json versionado', () => {
  const todas = { ...pacote.dependencies, ...pacote.devDependencies };
  for (const [nome, versao] of Object.entries(todas)) assert.match(versao, /^\d+\.\d+\.\d+$/, nome);
  assert.doesNotMatch(readFileSync(new URL('package.json', raiz), 'utf8'), /wrangler/);
  assert.ok(existsSync(new URL('package-lock.json', raiz)));
});
