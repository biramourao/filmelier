import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { montarCard, URL_LICENCA } from '../src/card.mjs';
import { montarItem } from '../src/item.mjs';
import { lerResumo } from '../src/wikimedia.mjs';
import { listarGeneros } from '../src/recomendar.mjs';

const tabela = JSON.parse(readFileSync(new URL('../data/humores.json', import.meta.url), 'utf8'));
const generos = listarGeneros(tabela);
const filme = { qid: 'Q83495', titulo: 'Matrix', ano: 1999, generos: ['Q471839', 'Q188473'], sitelinks: 90, imdb: 'tt0133093' };
const item = montarItem(filme, generos);

const ARTIGO = 'https://pt.wikipedia.org/wiki/The_Matrix_(filme)';
const CAPA = 'https://upload.wikimedia.org/wikipedia/en/c/c1/The_Matrix_Poster.jpg';
const completo = { idioma: 'pt', sinopse: 'Um hacker descobre a verdade.', capaUrl: CAPA, artigoUrl: ARTIGO };

test('AC-10: card enriquecido traz o título do dataset, ano, gêneros e links do item', () => {
  const c = montarCard(item, completo);
  assert.equal(c.titulo, 'Matrix');
  assert.equal(c.ano, '1999');
  assert.deepEqual(c.generos, ['Ação', 'Ficção científica']);
  assert.deepEqual(c.links, item.links);
  assert.equal(c.sinopse, 'Um hacker descobre a verdade.');
});

test('AC-5: crédito exato da sinopse, URL do artigo e da licença, links com target e rel', () => {
  const c = montarCard(item, completo);
  assert.equal(c.creditoTexto, 'Sinopse: Wikipédia (CC BY-SA)');
  assert.equal(c.creditoUrl, ARTIGO);
  assert.equal(c.licencaUrl, 'https://creativecommons.org/licenses/by-sa/4.0/deed.pt-br');
  assert.equal(c.licencaUrl, URL_LICENCA);
  assert.equal(c.atributosLink.target, '_blank');
  assert.ok(c.atributosLink.rel.includes('noopener') && c.atributosLink.rel.includes('noreferrer'));
});

test('AC-5: marca (en) e lang en só na sinopse en; pt tem os dois nulos', () => {
  const en = montarCard(item, { ...completo, idioma: 'en' });
  assert.equal(en.marcaIdioma, '(en)');
  assert.equal(en.lang, 'en');
  const pt = montarCard(item, completo);
  assert.equal(pt.marcaIdioma, null);
  assert.equal(pt.lang, null);
});

test('AC-10: crédito da imagem "Imagem: Wikipédia" com a URL do artigo', () => {
  const c = montarCard(item, completo);
  assert.equal(c.creditoImagemTexto, 'Imagem: Wikipédia');
  assert.equal(c.creditoImagemUrl, ARTIGO);
});

test('AC-4: atributos da capa aceita', () => {
  const c = montarCard(item, completo);
  assert.deepEqual(c.capa, { src: CAPA, alt: '', width: 160, height: 240, loading: 'lazy', referrerPolicy: 'no-referrer' });
  assert.equal(c.placeholder, false);
});

test('AC-4: sem enriquecimento ou sem capa, placeholder com capa nula e sem crédito da imagem', () => {
  for (const e of [null, undefined, { idioma: 'pt', sinopse: 'S', capaUrl: null, artigoUrl: ARTIGO }]) {
    const c = montarCard(item, e);
    assert.equal(c.capa, null);
    assert.equal(c.placeholder, true);
    assert.equal(c.creditoImagemTexto, null);
    assert.equal(c.creditoImagemUrl, null);
  }
  const vazio = montarCard(item, null);
  assert.equal(vazio.sinopse, null);
  assert.equal(vazio.creditoTexto, null);
  assert.equal(vazio.titulo, 'Matrix');
});

test('AC-5 e AC-10: em 20 respostas sintéticas toda sinopse e toda capa carregam URL de artigo válida', () => {
  const paginas = [ARTIGO, 'https://en.wikipedia.org/wiki/X', 'https://exemplo.com/wiki/X', undefined, 'http://pt.wikipedia.org/wiki/X'];
  const capas = [CAPA, 'https://exemplo.com/a.jpg', undefined, 'https://thumb.wikimedia.org/wikipedia/commons/a.jpg'];
  const extracts = ['Texto', '', undefined];
  let n = 0;
  for (let i = 0; i < 20; i += 1) {
    const json = {
      extract: extracts[i % 3],
      thumbnail: capas[i % 4] === undefined ? undefined : { source: capas[i % 4] },
      content_urls: { desktop: { page: paginas[i % 5] } },
    };
    const resumo = lerResumo(json);
    const c = montarCard(item, { idioma: i % 2 ? 'en' : 'pt', ...resumo });
    n += 1;
    if (c.sinopse !== null) {
      assert.match(c.creditoUrl, /^https:\/\/(pt|en)\.wikipedia\.org\/wiki\//);
      assert.equal(c.creditoTexto, 'Sinopse: Wikipédia (CC BY-SA)');
    }
    if (c.capa !== null) {
      assert.match(c.creditoImagemUrl, /^https:\/\/(pt|en)\.wikipedia\.org\/wiki\//);
      assert.equal(c.creditoImagemTexto, 'Imagem: Wikipédia');
    }
  }
  assert.equal(n, 20);
});

test('AC-13: todo link do item sai com target _blank e rel noopener noreferrer', () => {
  for (const l of montarCard(item, completo).links) {
    assert.equal(l.target, '_blank');
    assert.ok(l.rel.includes('noopener') && l.rel.includes('noreferrer'));
  }
});
