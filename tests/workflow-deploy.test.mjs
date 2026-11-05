import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// FILMELIER-5 (AC-14, AC-17): leitura de .github/workflows/deploy.yml, no padrão de tests/workflow-atualizar-base.test.mjs.
const yml = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const semComentarios = yml.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

test('AC-14: gatilhos push na main, workflow_dispatch e workflow_run do semanal concluído', () => {
  assert.match(semComentarios, /on:\s*\n\s+push:\s*\n\s+branches: \[main\]/);
  assert.match(semComentarios, /\n\s+workflow_dispatch:/);
  assert.match(semComentarios, /workflow_run:\s*\n\s+workflows: \["Atualizar a base de filmes"\]\s*\n\s+types: \[completed\]\s*\n\s+branches: \[main\]/);
  assert.match(semComentarios, /if: github\.event_name != 'workflow_run' \|\| github\.event\.workflow_run\.conclusion == 'success'/);
});

test('AC-14: o nome do workflow citado em workflow_run é o do workflow semanal', () => {
  const semanal = readFileSync(new URL('../.github/workflows/atualizar-base.yml', import.meta.url), 'utf8');
  assert.match(semanal, /^name: Atualizar a base de filmes$/m);
});

test('AC-14: ordem dos passos npm ci, npm test, npm run build, npm run test:dist, upload com path dist e deploy', () => {
  const i = (t) => semComentarios.indexOf(t);
  const ordem = ['- run: npm ci', '- run: npm test', '- run: npm run build', '- run: npm run test:dist',
    'actions/upload-pages-artifact@v3', 'actions/deploy-pages@v4'].map(i);
  assert.ok(ordem.every((n) => n >= 0), JSON.stringify(ordem));
  assert.deepEqual([...ordem].sort((a, b) => a - b), ordem);
  assert.match(semComentarios, /upload-pages-artifact@v3\s*\n\s+with:\s*\n\s+path: dist/);
  assert.match(semComentarios, /deploy:\s*\n\s+needs: build/);
  assert.ok(i('npm audit --omit=dev --audit-level=high') > i('npm ci') && i('npm audit --omit=dev --audit-level=high') < i('npm test'));
});

test('AC-17: permissões exatas, concurrency sem cancelar, 0 referências a segredos e só actions do dono actions/', () => {
  assert.match(semComentarios, /permissions:\s*\n\s+contents: read\s*\n\s+pages: write\s*\n\s+id-token: write\s*\n\n/);
  assert.equal((semComentarios.match(/^permissions:/gm) ?? []).length, 1);
  assert.match(semComentarios, /concurrency:\s*\n\s+group: pages\s*\n\s+cancel-in-progress: false/);
  // Fragmentos: este arquivo não pode casar com a própria busca de segredos de tests/estatico.test.mjs.
  assert.ok(!yml.includes(['sec', 'rets.'].join('')));
  const usos = [...semComentarios.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
  assert.ok(usos.length >= 4);
  for (const uso of usos) assert.ok(uso.startsWith('actions/'), uso);
  const runners = [...semComentarios.matchAll(/runs-on:\s*(\S+)/g)].map((m) => m[1]);
  assert.deepEqual(runners, ['ubuntu-latest', 'ubuntu-latest']);
});
