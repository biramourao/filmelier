import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const dir = new URL('../src/', import.meta.url);

test('AC-1: nenhum arquivo de src/ contém caractere Extended_Pictographic (emoji só em data/)', () => {
  const arquivos = readdirSync(dir).filter((n) => n.endsWith('.mjs'));
  assert.ok(arquivos.length > 0);
  for (const nome of arquivos) {
    const texto = readFileSync(new URL(nome, dir), 'utf8');
    assert.doesNotMatch(texto, /\p{Extended_Pictographic}/u, nome);
  }
});
