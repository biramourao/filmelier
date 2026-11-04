#!/usr/bin/env node
// CLI do build do dataset. Só lê argumentos e ambiente e chama executarBuild.
// Uso: FILMELIER_CONTATO=voce@exemplo.org node scripts/build-dataset.mjs [--humores arq] [--saida arq]

import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { executarBuild } from './lib/build.mjs';
import { linhaDeErro } from './lib/resumo.mjs';

const raiz = fileURLToPath(new URL('..', import.meta.url));

function argumento(nome, padrao) {
  const i = process.argv.indexOf(nome);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
}

try {
  const humores = argumento('--humores', `${raiz}data/humores.json`);
  const saida = argumento('--saida', `${raiz}data/filmes.json`);
  const tabela = JSON.parse(readFileSync(humores, 'utf8'));

  process.exitCode = await executarBuild({
    tabela,
    contato: process.env.FILMELIER_CONTATO,
    fetch,
    esperar: (ms) => new Promise((resolver) => setTimeout(resolver, ms)),
    stdout: (linha) => process.stdout.write(`${linha}\n`),
    stderr: (linha) => process.stderr.write(`${linha}\n`),
    // Grava em arquivo temporário e renomeia: falha antes do rename deixa a saída intacta.
    gravar: async (texto) => {
      writeFileSync(`${saida}.tmp`, texto);
      renameSync(`${saida}.tmp`, saida);
    },
  });
} catch (erro) {
  process.stderr.write(`${linhaDeErro(erro)}\n`);
  process.exitCode = 1;
}
