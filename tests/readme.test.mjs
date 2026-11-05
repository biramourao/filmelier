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

// FILMELIER-6 (AC-17): o README descreve a aba Séries, o build, o job semanal, o parâmetro do Worker e o passo manual.
test('AC-17: Textos exigidos no README', () => {
  for (const texto of ['build-series', 'tipo=serie', 'wrangler deploy', 'atualizar-series']) assert.ok(readme.includes(texto), texto);
  assert.match(readme, /^## Rotação da chave do TMDB$/m);
  assert.match(readme, /^## Séries$/m);
  const secao = readme.split('## Séries')[1].split('\n## ')[0];
  assert.match(secao, /Sem nota e sem prêmio/);
  assert.match(secao, /tmdb=/);
  assert.match(secao, /Origin: https:\/\/biramourao\.github\.io/);
  assert.match(secao, /\.series\[:5\]/);
  assert.doesNotMatch(readme, /\b(pago|pagamento|assinatura do serviço|plano pago)\b/i);
});
