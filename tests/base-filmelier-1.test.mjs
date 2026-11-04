import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// verificação da FILMELIER-2, base 1832cdf. Atualizada no ajuste dos filtros de ano e nota: o dataset foi refeito
// com o campo opcional `nota` e `meta.notas` (scripts/build-notas.mjs); o hash de data/filmes.json é o do dataset com notas.
// Os scripts da FILMELIER-1 seguem idênticos; os arquivos novos de notas não entram na lista de hashes.
// Prova que a demanda não tocou o dataset nem o build (AC-15). Hash por bytes pressupõe fim de linha LF;
// com core.autocrlf=true use `git diff --stat 1832cdf -- data/filmes.json scripts/` (deve sair vazio).
const raiz = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const sha = (rel) => createHash('sha256').update(readFileSync(join(raiz, rel))).digest('hex');

const HASHES = {
  'data/filmes.json': 'c091b55f838fa19795a8e821dbadb7106096ce99b66f822d9553f384190f0991',
  'scripts/build-dataset.mjs': '2e3d5f18dfd67cf2800524aefdb9ad9b9f6a4eabdafb9410ba54947348c0ed40',
  'scripts/lib/build.mjs': '7eb71a9e600232b4c48877b9e659cd8c73c4eceeed0c568f895831a33f9dea18',
  'scripts/lib/consulta.mjs': 'c0d09b9db76cb77d5d602902abd6f32f4dd9ee614725b5f67e794d77f97547b1',
  'scripts/lib/montar-dataset.mjs': '1445b086da018e1b15a04fc830c6db77821276c9c24785b69eed9b11f4abf6f1',
  'scripts/lib/resumo.mjs': 'a6d21cafd1ce5b0615b9aa07b65a27b936d3d704a0c47a033484e41d55d81a98',
  'scripts/lib/validar-dataset.mjs': '5769f36deb27d4081c654b92d6dd87db7770b803ee9b05877d5a13d6cde98f84',
  'scripts/lib/wdqs.mjs': '4568c1b792155bd965f1c22004edb9383cdcbf2cd60df90c4b6710bfc5085977',
};

test('AC-15: data/filmes.json e scripts/ idênticos aos da FILMELIER-1 (sha256 da base 1832cdf)', () => {
  for (const [rel, esperado] of Object.entries(HASHES)) assert.equal(sha(rel), esperado, rel);
});

const NOVOS = ['scripts/build-notas.mjs', 'scripts/lib/notas.mjs'];

test('AC-15: scripts/ tem os arquivos da FILMELIER-1 mais só os do build de notas', () => {
  const lista = (dir) => readdirSync(join(raiz, dir), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? lista(join(dir, e.name)) : [join(dir, e.name)]));
  assert.deepEqual(lista('scripts').sort(), [...Object.keys(HASHES).filter((k) => k.startsWith('scripts/')), ...NOVOS].sort());
});

test('AC-15: filme do dataset sem campo de enriquecimento (esquema da FILMELIER-1)', () => {
  const dataset = JSON.parse(readFileSync(join(raiz, 'data/filmes.json'), 'utf8'));
  const permitidos = new Set(['qid', 'titulo', 'ano', 'generos', 'sitelinks', 'imdb', 'nota']);
  for (const f of dataset.filmes) {
    for (const campo of Object.keys(f)) assert.ok(permitidos.has(campo), `${f.qid}: ${campo}`);
  }
  assert.deepEqual(Object.keys(dataset.meta).sort(), ['fonte', 'geradoEm', 'licenca', 'notas', 'total']);
});
