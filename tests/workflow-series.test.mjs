import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const yml = readFileSync(new URL('../.github/workflows/atualizar-base.yml', import.meta.url), 'utf8');
const inicio = yml.indexOf('\n  atualizar-series:');
assert.ok(inicio >= 0, 'job atualizar-series ausente');
const job = yml.slice(inicio);
const SEGREDO_TMDB = ['TMDB', '_TOKEN: ${{ sec', 'rets.TMDB', '_TOKEN }}'].join('');
const SEGREDO_CONTATO = ['FILMELIER_CONTATO: ${{ sec', 'rets.FILMELIER_CONTATO }}'].join('');

// Divide o job em passos (cada um começa em "      - ").
const passos = job.split(/\n      - /).slice(1).map((p) => `- ${p}`);

test('AC-13: Leitura do YAML do job de séries', () => {
  assert.match(job, /\n    needs: atualizar\n/);
  assert.ok(job.includes('\n    if: ${{ !cancelled() }}\n'));
  assert.doesNotMatch(job, /always\(\)/);
  assert.match(job, /\n    continue-on-error: true\n/);
  assert.match(job, /\n    timeout-minutes: 30\n/);
  const ordem = ['actions/checkout@v4', 'actions/setup-node@v4', 'FILMELIER_CONTATO" ]', 'node scripts/build-series.mjs',
    'node --test --test-reporter=tap tests/*.test.mjs', 'git add -- data/series.json', 'git pull --rebase', 'git push'].map((t) => job.indexOf(t));
  assert.ok(ordem.every((n) => n >= 0), ordem.join(','));
  assert.deepEqual([...ordem].sort((a, b) => a - b), ordem);
  assert.deepEqual(job.match(/git add .*/g), ['git add -- data/series.json']);
  assert.match(job, /node-version: 24/);
  assert.ok(job.indexOf('git diff --quiet -- data/series.json') < job.indexOf('git add'));
});

test('AC-13: name, permissões e checkout do job de séries', () => {
  assert.match(yml, /^name: Atualizar a base de filmes$/m);
  assert.equal((yml.match(/^permissions:/gm) ?? []).length, 1);
  assert.match(yml, /^permissions:\n  contents: write\n/m);
  assert.doesNotMatch(yml.replace(/^permissions:\n  contents: write\n/m, ''), /permissions:/);
  assert.match(job, /actions\/checkout@v4\n        with:\n          ref: main\n          fetch-depth: 0\n/);
});

test('AC-13: Segredos por passo', () => {
  assert.equal(job.split(SEGREDO_TMDB).length - 1, 1);
  const passoBuild = passos.find((p) => p.includes('node scripts/build-series.mjs'));
  assert.ok(passoBuild.includes(SEGREDO_TMDB));
  assert.doesNotMatch(job, /\n    env:/);
  const comContato = passos.filter((p) => p.includes(SEGREDO_CONTATO));
  assert.equal(comContato.length, 2);
  assert.ok(comContato.some((p) => p.includes('Exigir o contato')));
  assert.ok(comContato.includes(passoBuild));
  assert.doesNotMatch(job, /echo[^\n]*(TMDB_TOKEN|FILMELIER_CONTATO\b[^"]*\n)/);
  assert.doesNotMatch(job, /echo[^\n]*\$\{?(TMDB_TOKEN|FILMELIER_CONTATO)/);
});
