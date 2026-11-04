#!/usr/bin/env node
// CLI que acrescenta o Oscar (vitórias e indicações por categoria, via Wikidata) a data/filmes.json.
// Uso: FILMELIER_CONTATO=voce@exemplo.org node scripts/build-oscar.mjs [--saida arq]

import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { executarOscar } from './lib/oscar.mjs';
import { linhaDeErro } from './lib/resumo.mjs';

const raiz = fileURLToPath(new URL('..', import.meta.url));

function argumento(nome, padrao) {
  const i = process.argv.indexOf(nome);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
}

try {
  const saida = argumento('--saida', `${raiz}data/filmes.json`);
  const dataset = JSON.parse(readFileSync(saida, 'utf8'));
  process.exitCode = await executarOscar({
    dataset,
    contato: process.env.FILMELIER_CONTATO,
    fetch,
    esperar: (ms) => new Promise((resolver) => setTimeout(resolver, ms)),
    stdout: (linha) => process.stdout.write(`${linha}\n`),
    stderr: (linha) => process.stderr.write(`${linha}\n`),
    gravar: async (texto) => {
      writeFileSync(`${saida}.tmp`, texto);
      renameSync(`${saida}.tmp`, saida);
    },
  });
} catch (erro) {
  process.stderr.write(`${linhaDeErro(erro)}\n`);
  process.exitCode = 1;
}
