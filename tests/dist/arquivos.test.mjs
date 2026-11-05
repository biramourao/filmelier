import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// FILMELIER-5 (AC-13, AC-17): confere o dist/ depois de `npm run build`. node:test puro, sem pacote npm.
const raiz = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const dist = join(raiz, 'dist');
const sha = (caminho) => createHash('sha256').update(readFileSync(caminho)).digest('hex');
// Logo oficial do TMDB, sem alteração (mesmo valor de tests/estatico.test.mjs).
const SHA256_LOGO_TMDB = '8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c';

function arquivos(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? arquivos(join(dir, e.name)) : [join(dir, e.name)]));
}

test('AC-13: dist/ existe (rode npm run build antes)', () => {
  assert.ok(existsSync(join(dist, 'index.html')), 'dist/index.html ausente: rode npm run build');
});

test('AC-13: dist/data/filmes.json e humores.json são cópias idênticas de data/', () => {
  for (const nome of ['filmes.json', 'humores.json']) {
    assert.equal(sha(join(dist, 'data', nome)), sha(join(raiz, 'data', nome)), nome);
  }
});

test('AC-13: favicon na raiz do dist, logo do TMDB com o sha256 do original e link de ícone com href estável', () => {
  assert.ok(statSync(join(dist, 'favicon.svg')).size > 0);
  assert.equal(sha(join(dist, 'assets', 'tmdb-logo.svg')), SHA256_LOGO_TMDB);
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const icone = /<link\s[^>]*rel="icon"[^>]*>/.exec(html);
  assert.ok(icone, 'link rel=icon');
  assert.equal(/href="([^"]+)"/.exec(icone[0])[1], '/filmelier/favicon.svg');
  const hashados = readdirSync(join(dist, 'assets')).filter((n) => /^favicon.*\.svg$/.test(n));
  assert.deepEqual(hashados, []);
});

test('AC-17: nenhum data:image, data:font nem api.themoviedb.org no código publicado (index.html e assets/)', () => {
  const alvos = [join(dist, 'index.html'), ...arquivos(join(dist, 'assets')).filter((a) => /\.(js|css|html|svg)$/.test(a))];
  assert.ok(alvos.length >= 3);
  for (const alvo of alvos) {
    const texto = readFileSync(alvo, 'utf8');
    assert.doesNotMatch(texto, /data:image/i, alvo);
    assert.doesNotMatch(texto, /data:font/i, alvo);
    assert.ok(!texto.includes('api.themoviedb.org'), alvo);
  }
});
