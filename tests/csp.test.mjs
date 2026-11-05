import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarCsp } from '../src/csp.mjs';
import { URL_WORKER } from '../src/config.mjs';
import { cspEsperada } from './apoio/csp.mjs';

test('AC-17: montarCsp é igual ao oráculo cspEsperada para URL vazia, de exemplo e a real', () => {
  for (const url of ['', 'https://exemplo.workers.dev', URL_WORKER]) assert.equal(montarCsp(url), cspEsperada(url), url);
});

test('AC-17: montarCsp não tem unsafe-inline nem unsafe-eval', () => {
  assert.doesNotMatch(montarCsp(URL_WORKER), /unsafe-(inline|eval)/);
});
