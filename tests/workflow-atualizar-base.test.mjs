import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const yml = readFileSync(new URL('../.github/workflows/atualizar-base.yml', import.meta.url), 'utf8');

test('workflow: agenda semanal na quinta e disparo manual', () => {
  assert.match(yml, /cron: '0 9 \* \* 4'/);
  assert.match(yml, /workflow_dispatch:/);
  assert.match(yml, /permissions:\s*\n\s+contents: write/);
  assert.match(yml, /group: atualizar-base\s*\n\s+cancel-in-progress: false/);
  assert.match(yml, /timeout-minutes: 60/);
});

test('workflow: contato só pelo segredo; sem e-mail literal nem token', () => {
  assert.match(yml, new RegExp(['FILMELIER_CONTATO: \\$\\{\\{ sec', 'rets\\.FILMELIER_CONTATO \\}\\}'].join('')));
  // O e-mail noreply do bot do GitHub é público e necessário ao commit; qualquer outro e-mail reprova.
  const semBot = yml.replaceAll('41898282+github-actions[bot]@users.noreply.github.com', '');
  assert.doesNotMatch(semBot, /[\w.+-]+@[\w-]+(\.[\w-]+)+/);
  assert.doesNotMatch(yml, new RegExp(['ey', 'J[A-Za-z0-9_-]{10,}|gh[pous]_[A-Za-z0-9]{20,}|github_pat_'].join('')));
  assert.doesNotMatch(yml, /echo[^\n]*\$\{?FILMELIER_CONTATO/);
});

test('workflow: 4 builds na ordem, suíte antes do commit, e só data/filmes.json é adicionado', () => {
  const i = (t) => yml.indexOf(t);
  const ordem = ['node scripts/build-dataset.mjs', 'node scripts/build-notas.mjs', 'node scripts/build-oscar.mjs',
    'node scripts/build-temas.mjs', 'node --test --test-reporter=tap tests/*.test.mjs', 'git commit', 'git push'].map(i);
  assert.ok(ordem.every((n) => n >= 0));
  assert.deepEqual([...ordem].sort((a, b) => a - b), ordem);
  assert.ok(i('git diff --quiet -- data/filmes.json') < i('git add'));
  assert.deepEqual(yml.match(/git add .*/g), ['git add -- data/filmes.json']);
  assert.match(yml, /actions\/checkout@v4/);
  assert.match(yml, /node-version: 24/);
});

const blocoTags = () => {
  const ini = yml.indexOf('- name: Build das tags');
  assert.ok(ini >= 0);
  const prox = yml.indexOf('\n      - ', ini + 1);
  return yml.slice(ini, prox < 0 ? undefined : prox);
};
const SEGREDO_TMDB = ['TMDB', '_TOKEN: ${{ sec', 'rets.TMDB', '_TOKEN }}'].join('');

test('AC-1: cp da base anterior antes do build-dataset e passo de tags com --anterior', () => {
  const cp = 'cp data/filmes.json "$RUNNER_TEMP/filmes-anterior.json"';
  assert.ok(yml.indexOf(cp) >= 0 && yml.indexOf(cp) < yml.indexOf('node scripts/build-dataset.mjs'));
  assert.ok(yml.includes('node scripts/build-temas.mjs --anterior "$RUNNER_TEMP/filmes-anterior.json"'));
});

test('AC-9: passo de tags com timeout de 40 min e job com 60', () => {
  assert.match(blocoTags(), /timeout-minutes: 40/);
  assert.match(yml, /atualizar:\s*\n\s+runs-on: ubuntu-latest\s*\n\s+timeout-minutes: 60/);
});

test('AC-1: segredo do TMDB declarado 1 vez, só no bloco do passo de tags, sem echo e fora do env do job', () => {
  assert.equal(yml.split(SEGREDO_TMDB).length - 1, 1);
  assert.ok(blocoTags().includes(SEGREDO_TMDB));
  const envJob = /\n    env:\n((?:      .*\n)+)/.exec(yml)[1];
  assert.ok(!envJob.includes('TMDB'));
  assert.doesNotMatch(yml, /echo[^\n]*TMDB_TOKEN/);
});

test('AC-1: sem pull_request, pull_request_target nem continue-on-error', () => {
  assert.doesNotMatch(yml, /pull_request|continue-on-error/);
});

test('AC-9: suíte do workflow sem tests/entrega e package.json sem dependencies', () => {
  assert.doesNotMatch(yml, /tests\/entrega/);
  const pacote = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(!('dependencies' in pacote) && !('devDependencies' in pacote));
});
