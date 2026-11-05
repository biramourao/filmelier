import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { cspEsperada } from '../apoio/csp.mjs';
import { URL_WORKER } from '../../src/config.mjs';

// FILMELIER-5 (AC-13, AC-17): dist/index.html depois de `npm run build`. node:test puro, sem pacote npm.
const arquivo = new URL('../../dist/index.html', import.meta.url);

test('AC-13: dist/index.html existe (rode npm run build antes)', () => {
  assert.ok(existsSync(arquivo), 'dist/index.html ausente: rode npm run build');
});

const html = existsSync(arquivo) ? readFileSync(arquivo, 'utf8') : '';
const tags = (nome) => html.match(new RegExp(`<${nome}\\b[^>]*>`, 'g')) ?? [];
const atributo = (tag, nome) => new RegExp(`\\s${nome}="([^"]*)"`).exec(tag)?.[1];

test('AC-13: todo src e href de JS, CSS e ícone começa com /filmelier/ ou é relativo', () => {
  const alvos = [
    ...tags('script').map((t) => atributo(t, 'src')),
    ...tags('link').filter((t) => /rel="(stylesheet|icon|modulepreload)"/.test(t)).map((t) => atributo(t, 'href')),
  ];
  assert.ok(alvos.length >= 3, `${alvos.length} caminhos`);
  for (const caminho of alvos) {
    assert.ok(caminho, 'caminho ausente');
    assert.ok(caminho.startsWith('/filmelier/') || !/^(\/|[a-z][a-z0-9+.-]*:)/i.test(caminho), caminho);
  }
  assert.ok(alvos.some((c) => /^\/filmelier\/assets\/.+\.js$/.test(c)));
  assert.ok(alvos.some((c) => /^\/filmelier\/assets\/.+\.css$/.test(c)));
  assert.ok(alvos.includes('/filmelier/favicon.svg'));
});

test('AC-17: a CSP é exatamente cspEsperada(URL_WORKER), sem unsafe-inline nem unsafe-eval', () => {
  const metas = tags('meta').filter((t) => /http-equiv="Content-Security-Policy"/.test(t));
  assert.equal(metas.length, 1);
  const csp = atributo(metas[0], 'content').replace(/\s+/g, ' ').trim();
  assert.equal(csp, cspEsperada(URL_WORKER));
  assert.doesNotMatch(csp, /unsafe-(inline|eval)/);
});

test('AC-17: ordem do head: charset, viewport, CSP e referrer no-referrer', () => {
  assert.match(html, /<meta\s+name="referrer"\s+content="no-referrer"\s*\/?>/);
  const ordem = ['<meta charset', 'name="viewport"', 'Content-Security-Policy', 'name="referrer"'].map((t) => html.indexOf(t));
  assert.ok(ordem.every((i) => i >= 0), JSON.stringify(ordem));
  assert.deepEqual(ordem, [...ordem].sort((a, b) => a - b));
});

test('AC-17: 0 scripts sem src (o polyfill de modulepreload do Vite fica no chunk), 0 blocos style e 0 atributos style', () => {
  for (const tag of tags('script')) assert.ok(atributo(tag, 'src'), `script sem src: ${tag}`);
  assert.equal((html.match(/<script\b[^>]*>\s*[^<\s][\s\S]*?<\/script>/g) ?? []).length, 0, 'script com corpo inline');
  assert.equal(tags('style').length, 0);
  assert.doesNotMatch(html, /\sstyle\s*=/i);
});

test('AC-17: 0 script[src] externo (só a própria origem)', () => {
  const externos = tags('script').map((t) => atributo(t, 'src')).filter((s) => /^(https?:)?\/\//.test(s));
  assert.deepEqual(externos, []);
});
