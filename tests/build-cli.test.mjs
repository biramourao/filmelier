import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = new URL('../scripts/build-dataset.mjs', import.meta.url).pathname;
const tabelaReal = JSON.parse(readFileSync(new URL('../data/humores.json', import.meta.url), 'utf8'));

function sha256(arquivo) {
  return createHash('sha256').update(readFileSync(arquivo)).digest('hex');
}

function executar(args, env = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, FILMELIER_CONTATO: 'teste@example.org', ...env },
    timeout: 20000,
  });
}

function linhasDe(texto) {
  return texto.split('\n').filter((l) => l !== '');
}

test('AC-12 e AC-17: tabela com QID malformado falha com esquema-humores e não toca a saída', () => {
  const dir = mkdtempSync(join(tmpdir(), 'filmelier-'));
  const ruim = structuredClone(tabelaReal);
  ruim.humores[0].generos[0].qid = 'QX';
  const humores = join(dir, 'humores.json');
  const saida = join(dir, 'filmes.json');
  writeFileSync(humores, JSON.stringify(ruim));
  writeFileSync(saida, '{"meta":{},"filmes":[]}');
  const antes = sha256(saida);

  const r = executar(['--humores', humores, '--saida', saida]);
  assert.notEqual(r.status, 0);
  const linhas = linhasDe(r.stderr);
  assert.equal(linhas.length, 1);
  const erro = JSON.parse(linhas[0]);
  assert.equal(erro.invariante, 'esquema-humores');
  assert.ok('erro' in erro);
  assert.equal(sha256(saida), antes);
  assert.deepEqual(readdirSync(dir).sort(), ['filmes.json', 'humores.json']);
});

test('AC-17 (N-9): exceção inesperada vira 1 linha JSON em stderr e código != 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'filmelier-'));
  const r = executar(['--humores', join(dir, 'nao-existe.json'), '--saida', join(dir, 'filmes.json')]);
  assert.notEqual(r.status, 0);
  const linhas = linhasDe(r.stderr);
  assert.equal(linhas.length, 1);
  assert.ok('erro' in JSON.parse(linhas[0]));
});

test('AC-13: sem FILMELIER_CONTATO o CLI falha com invariante contato, sem rede', () => {
  const dir = mkdtempSync(join(tmpdir(), 'filmelier-'));
  const r = spawnSync(process.execPath, [script, '--saida', join(dir, 'filmes.json')], {
    encoding: 'utf8', env: { PATH: process.env.PATH }, timeout: 20000,
  });
  assert.notEqual(r.status, 0);
  assert.equal(JSON.parse(linhasDe(r.stderr)[0]).invariante, 'contato');
});
