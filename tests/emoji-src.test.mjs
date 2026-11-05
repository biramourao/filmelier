import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const dir = new URL('../src/', import.meta.url);

// Recursivo em src/ (FILMELIER-5: src/ui/*.tsx): `.mjs`, `.ts` e `.tsx`.
function fontes(nome = '') {
  return readdirSync(new URL(nome, dir), { withFileTypes: true }).flatMap((e) => {
    const caminho = `${nome}${e.name}`;
    if (e.isDirectory()) return fontes(`${caminho}/`);
    return /\.(mjs|ts|tsx)$/.test(e.name) ? [caminho] : [];
  });
}

test('AC-1: nenhum arquivo de src/ contém caractere Extended_Pictographic (emoji só em data/)', () => {
  const arquivos = fontes();
  assert.ok(arquivos.length > 0);
  assert.ok(arquivos.some((n) => n.endsWith('.tsx')), 'ao menos 1 .tsx na lista');
  assert.ok(arquivos.some((n) => n.endsWith('.mjs')));
  for (const nome of arquivos) {
    const texto = readFileSync(new URL(nome, dir), 'utf8');
    assert.doesNotMatch(texto, /\p{Extended_Pictographic}/u, nome);
  }
});
