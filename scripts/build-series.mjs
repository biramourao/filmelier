#!/usr/bin/env node
// CLI que gera data/series.json (FILMELIER-6): coorte de séries do Wikidata + leitura do TMDB por série.
// Uso: FILMELIER_CONTATO=voce@exemplo.org TMDB_TOKEN=... node scripts/build-series.mjs [--saida arq]
// Sem contato ou sem token sai com código diferente de 0 antes de qualquer requisição e não cria o arquivo.

import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { executarSeries } from './lib/series.mjs';
import { linhaDeErro } from './lib/resumo.mjs';

const raiz = fileURLToPath(new URL('..', import.meta.url));

function argumento(nome, padrao) {
  const i = process.argv.indexOf(nome);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
}

const lerJson = (caminho) => JSON.parse(readFileSync(caminho, 'utf8'));

try {
  const saida = argumento('--saida', `${raiz}data/series.json`);
  process.exitCode = await executarSeries({
    tabela: lerJson(`${raiz}data/humores-series.json`),
    clima: lerJson(`${raiz}data/clima-series.json`),
    temas: lerJson(`${raiz}data/temas.json`),
    contato: process.env.FILMELIER_CONTATO,
    token: process.env.TMDB_TOKEN,
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
