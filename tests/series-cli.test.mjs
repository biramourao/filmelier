import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const raiz = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

// Filho sem contato nem token do ambiente real: só o que o teste define entra no env.
function rodarCli(args, extra = {}) {
  const env = { ...process.env };
  delete env.TMDB_TOKEN;
  delete env.FILMELIER_CONTATO;
  Object.assign(env, extra);
  return spawnSync(process.execPath, [`${raiz}/scripts/build-series.mjs`, ...args], { cwd: raiz, env, encoding: 'utf8', timeout: 60000 });
}

test('AC-11: build-series sem token e sem contato sai com código diferente de 0, 1 linha de erro e não cria a saída', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'series-cli-'));
  const saida = join(pasta, 'series.json');
  const r = rodarCli(['--saida', saida]);
  assert.notEqual(r.status, 0);
  const linhas = r.stderr.trim().split('\n');
  assert.equal(linhas.length, 1);
  assert.equal(JSON.parse(linhas[0]).invariante, 'contato');
  assert.equal(r.stdout, '');
  assert.ok(!existsSync(saida));
  assert.ok(!existsSync(`${saida}.tmp`));
});

test('AC-11: com contato e sem token a linha de erro é tmdb-token, antes da rede', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'series-cli-'));
  const saida = join(pasta, 'series.json');
  const r = rodarCli(['--saida', saida], { FILMELIER_CONTATO: 'teste@exemplo.org' });
  assert.notEqual(r.status, 0);
  assert.equal(JSON.parse(r.stderr.trim().split('\n').at(-1)).invariante, 'tmdb-token');
  assert.ok(!existsSync(saida));
});
