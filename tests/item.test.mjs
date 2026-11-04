import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { montarItem } from '../src/item.mjs';
import { listarGeneros } from '../src/recomendar.mjs';

const tabela = JSON.parse(readFileSync(new URL('../data/humores.json', import.meta.url), 'utf8'));
const generos = listarGeneros(tabela);

const comImdb = { qid: 'Q83495', titulo: 'Matrix', ano: 1999, generos: ['Q471839', 'Q188473'], sitelinks: 90, imdb: 'tt0133093' };
const semImdb = { qid: 'Q1', titulo: 'Sem IMDb', ano: 2001, generos: ['Q130232'], sitelinks: 12 };

test('AC-8: item com título, ano de 4 dígitos, gêneros pt-BR em ordem e links', () => {
  const item = montarItem(comImdb, generos);
  assert.equal(item.titulo, 'Matrix');
  assert.match(item.ano, /^\d{4}$/);
  assert.deepEqual(item.generos, ['Ação', 'Ficção científica']);
  const [wiki, imdb] = item.links;
  assert.match(wiki.href, /^https:\/\/www\.wikidata\.org\/wiki\/Q\d+$/);
  assert.match(imdb.href, /^https:\/\/www\.imdb\.com\/title\/tt\d+\/$/);
});

test('AC-8: sem imdb não há link IMDb', () => {
  const item = montarItem(semImdb, generos);
  assert.equal(item.links.length, 1);
  assert.ok(item.links.every((l) => !l.href.includes('imdb.com')));
});

test('AC-18: links abrem em nova aba com noopener e noreferrer', () => {
  for (const l of montarItem(comImdb, generos).links) {
    assert.equal(l.target, '_blank');
    assert.ok(l.rel.includes('noopener') && l.rel.includes('noreferrer'));
  }
});

test('AC-8: item válido para cada filme do dataset versionado', () => {
  const dataset = JSON.parse(readFileSync(new URL('../data/filmes.json', import.meta.url), 'utf8'));
  for (const f of dataset.filmes) {
    const item = montarItem(f, generos);
    assert.ok(item.titulo.length > 0, f.qid);
    assert.match(item.ano, /^\d{4}$/);
    assert.ok(item.generos.length >= 1, f.qid);
    assert.deepEqual(item.generos, [...item.generos].sort((a, b) => a.localeCompare(b, 'pt-BR')), f.qid);
    assert.match(item.links[0].href, /^https:\/\/www\.wikidata\.org\/wiki\/Q\d+$/);
    const imdb = item.links.find((l) => l.href.includes('imdb.com'));
    if (f.imdb) assert.match(imdb.href, /^https:\/\/www\.imdb\.com\/title\/tt\d+\/$/);
    else assert.equal(imdb, undefined);
  }
});
