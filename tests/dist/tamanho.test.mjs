import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

// FILMELIER-5 (AC-16): tetos de tamanho do pacote inicial, em bytes gzip. Os valores saem como linha `#` do TAP (t.diagnostic).
const dist = new URL('../../dist/', import.meta.url);
const TETO_JS = 92160; // 90 KiB
const TETO_CSS = 15360; // 15 KiB

const html = existsSync(new URL('index.html', dist)) ? readFileSync(new URL('index.html', dist), 'utf8') : '';
const caminhos = (re) => [...html.matchAll(re)].map((m) => m[1]);
const gzip = (caminho) => gzipSync(readFileSync(new URL(caminho.replace(/^\/filmelier\//, ''), dist))).length;

test('AC-16: JS inicial (script e modulepreload do index.html) de no máximo 92.160 bytes gzip', (t) => {
  const js = [
    ...caminhos(/<script\b[^>]*\ssrc="([^"]+)"/g),
    ...caminhos(/<link\b[^>]*rel="modulepreload"[^>]*\shref="([^"]+)"/g),
  ];
  assert.ok(js.length >= 1, 'nenhum JS no index.html: rode npm run build');
  const total = js.reduce((soma, c) => soma + gzip(c), 0);
  t.diagnostic(`JS inicial: ${total} bytes gzip (teto ${TETO_JS})`);
  assert.ok(total <= TETO_JS, `${total} > ${TETO_JS}`);
});

test('AC-16: CSS de no máximo 15.360 bytes gzip', (t) => {
  const css = caminhos(/<link\b[^>]*rel="stylesheet"[^>]*\shref="([^"]+)"/g);
  assert.ok(css.length >= 1, 'nenhum CSS no index.html: rode npm run build');
  const total = css.reduce((soma, c) => soma + gzip(c), 0);
  t.diagnostic(`CSS: ${total} bytes gzip (teto ${TETO_CSS})`);
  assert.ok(total <= TETO_CSS, `${total} > ${TETO_CSS}`);
});
