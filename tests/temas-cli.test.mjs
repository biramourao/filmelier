import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const raiz = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

// Filho sem TMDB_TOKEN e sem contato do ambiente real: só o que o teste define entra no env.
function rodarCli(args, extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.TMDB_TOKEN;
  if (!('FILMELIER_CONTATO' in extra)) delete env.FILMELIER_CONTATO;
  else env.FILMELIER_CONTATO = extra.FILMELIER_CONTATO;
  return spawnSync(process.execPath, [`${raiz}/scripts/build-temas.mjs`, ...args], { cwd: raiz, env, encoding: 'utf8', timeout: 60000 });
}

test('AC-1: build-temas sem TMDB_TOKEN sai com código diferente de 0 e linha tmdb-token, antes da rede', () => {
  const r = rodarCli([], { FILMELIER_CONTATO: 'teste@exemplo.org' });
  assert.notEqual(r.status, 0);
  const linhas = r.stderr.trim().split('\n');
  assert.equal(linhas.length, 1);
  assert.equal(JSON.parse(linhas[0]).invariante, 'tmdb-token');
  assert.equal(r.stdout, '');
});

test('AC-2: build-temas sem contato sai com invariante contato', () => {
  const r = rodarCli([]);
  assert.notEqual(r.status, 0);
  assert.equal(JSON.parse(r.stderr.trim().split('\n').at(-1)).invariante, 'contato');
});

test('AC-8: --medir com --relatorio dentro do repositório sai com invariante relatorio, antes da rede', () => {
  const r = rodarCli(['--medir', '--relatorio', 'data/frequencia.json'], { FILMELIER_CONTATO: 'teste@exemplo.org' });
  assert.notEqual(r.status, 0);
  assert.equal(JSON.parse(r.stderr.trim().split('\n').at(-1)).invariante, 'relatorio');
});

test('R-2: --anterior com arquivo inexistente sai com invariante anterior, antes da rede', () => {
  const r = rodarCli(['--anterior', '/tmp/filmelier-nao-existe/anterior.json'], { FILMELIER_CONTATO: 'teste@exemplo.org' });
  assert.notEqual(r.status, 0);
  const linhas = r.stderr.trim().split('\n');
  assert.equal(linhas.length, 1);
  assert.equal(JSON.parse(linhas[0]).invariante, 'anterior');
  assert.equal(r.stdout, '');
});
