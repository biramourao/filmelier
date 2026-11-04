#!/usr/bin/env node
// CLI que acrescenta tags de tema e clima (e o tmdbId) a data/filmes.json (FILMELIER-4).
// Uso: FILMELIER_CONTATO=voce@exemplo.org TMDB_TOKEN=... node scripts/build-temas.mjs
//        [--anterior base-anterior.json] [--saida arq] [--medir [--relatorio arq-fora-do-repositorio]]
// --anterior com arquivo inexistente e --relatorio sem --medir abortam (invariantes `anterior` e `relatorio`).

import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { executarTemas } from './lib/temas.mjs';
import { ErroBuild } from './lib/wdqs.mjs';
import { linhaDeErro } from './lib/resumo.mjs';

const raiz = fileURLToPath(new URL('..', import.meta.url));

function argumento(nome, padrao) {
  const i = process.argv.indexOf(nome);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
}

const lerJson = (caminho) => JSON.parse(readFileSync(caminho, 'utf8'));

try {
  const saida = argumento('--saida', `${raiz}data/filmes.json`);
  const caminhoAnterior = argumento('--anterior', undefined);
  const relatorio = argumento('--relatorio', undefined);
  if (caminhoAnterior !== undefined && !existsSync(caminhoAnterior)) {
    throw new ErroBuild('o arquivo de --anterior não existe', { invariante: 'anterior' });
  }
  process.exitCode = await executarTemas({
    dataset: lerJson(saida),
    anterior: caminhoAnterior ? lerJson(caminhoAnterior) : null,
    temas: lerJson(`${raiz}data/temas.json`),
    curadoria: lerJson(`${raiz}data/curadoria-temas.json`),
    humores: lerJson(`${raiz}data/humores.json`),
    contato: process.env.FILMELIER_CONTATO,
    token: process.env.TMDB_TOKEN,
    medir: process.argv.includes('--medir'),
    relatorio,
    raiz,
    fetch,
    esperar: (ms) => new Promise((resolver) => setTimeout(resolver, ms)),
    stdout: (linha) => process.stdout.write(`${linha}\n`),
    stderr: (linha) => process.stderr.write(`${linha}\n`),
    gravar: async (texto) => {
      writeFileSync(`${saida}.tmp`, texto);
      renameSync(`${saida}.tmp`, saida);
    },
    gravarRelatorio: async (texto) => {
      writeFileSync(relatorio, texto);
    },
  });
} catch (erro) {
  process.stderr.write(`${linhaDeErro(erro)}\n`);
  process.exitCode = 1;
}
