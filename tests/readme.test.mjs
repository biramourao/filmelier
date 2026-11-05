import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// FILMELIER-5 (AC-15): o README descreve o fluxo com npm, a prova sem rede e a publicação por Actions.
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

test('AC-15: README traz os comandos npm ci, dev, build, preview e test', () => {
  for (const comando of ['npm ci', 'npm run dev', 'npm run build', 'npm run preview', 'npm test']) {
    assert.ok(readme.includes(comando), comando);
  }
});

test('AC-15: README explica as etapas de npm test (node:test, Vitest e tsc) e a prova sem rede', () => {
  assert.match(readme, /node:test/);
  assert.match(readme, /Vitest/);
  assert.match(readme, /tsc --noEmit/);
  assert.ok(readme.includes('tests/apoio/sem-rede.mjs'));
});

test('AC-15: README descreve o deploy por GitHub Actions e o passo manual de trocar a fonte do Pages antes do merge', () => {
  assert.ok(readme.includes('.github/workflows/deploy.yml'));
  const publicacao = readme.split('## Publicação')[1].split('\n## ')[0];
  assert.match(publicacao, /GitHub Actions/);
  assert.match(publicacao, /Pages/);
  assert.match(publicacao, /antes do merge/);
});

test('AC-15: README mantém a seção "Rotação da chave do TMDB" e não diz mais "sem dependências e sem etapa de build"', () => {
  assert.match(readme, /^## Rotação da chave do TMDB$/m);
  assert.doesNotMatch(readme, /sem dependências e sem etapa de build/);
  assert.doesNotMatch(readme, /Não há dependências npm/);
});
