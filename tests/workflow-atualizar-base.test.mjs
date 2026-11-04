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

test('workflow: 3 builds na ordem, suíte antes do commit, e só data/filmes.json é adicionado', () => {
  const i = (t) => yml.indexOf(t);
  const ordem = ['node scripts/build-dataset.mjs', 'node scripts/build-notas.mjs', 'node scripts/build-oscar.mjs',
    'node --test --test-reporter=tap tests/*.test.mjs', 'git commit', 'git push'].map(i);
  assert.ok(ordem.every((n) => n >= 0));
  assert.deepEqual([...ordem].sort((a, b) => a - b), ordem);
  assert.ok(i('git diff --quiet -- data/filmes.json') < i('git add'));
  assert.deepEqual(yml.match(/git add .*/g), ['git add -- data/filmes.json']);
  assert.match(yml, /actions\/checkout@v4/);
  assert.match(yml, /node-version: 24/);
});
