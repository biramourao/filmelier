// Testes acrescentados na validação G2: cada um mata uma mutação que sobrevivia à suíte (ver 08-verification.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { criarEnriquecedor } from '../src/enriquecer.mjs';
import { aceitarCapa } from '../src/wikimedia.mjs';
import { carregarDados } from '../src/dados.mjs';
import { montarCard } from '../src/card.mjs';
import { montarItem } from '../src/item.mjs';
import { listarGeneros } from '../src/recomendar.mjs';

const CAPA = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Exemplo.jpg/330px-Exemplo.jpg';
const resposta = (status, corpo, cabecalhos = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (n) => cabecalhos[n] ?? null },
  json: async () => corpo,
});
const entidades = (qids) => ({ entities: Object.fromEntries(qids.map((q) => [q, { id: q, sitelinks: { ptwiki: { title: `Filme ${q}` } } }])) });
const resumoOk = (titulo) => ({
  extract: `Sinopse de ${titulo}`,
  thumbnail: { source: CAPA },
  content_urls: { desktop: { page: `https://pt.wikipedia.org/wiki/${encodeURIComponent(titulo.replaceAll(' ', '_'))}` } },
});
const tituloDaUrl = (url) => decodeURIComponent(new URL(url).pathname.split('/').pop()).replaceAll('_', ' ');

function criarRede({ wikidata, wikipedia } = {}) {
  const chamadas = [];
  const fetchImpl = async (url) => {
    const u = new URL(url);
    chamadas.push({ url, host: u.host });
    if (u.host === 'www.wikidata.org') {
      return wikidata ? wikidata(url) : resposta(200, entidades(u.searchParams.get('ids').split('|')));
    }
    return wikipedia ? wikipedia(url) : resposta(200, resumoOk(tituloDaUrl(url)));
  };
  return {
    fetchImpl,
    chamadas,
    wikidata: () => chamadas.filter((c) => c.host === 'www.wikidata.org'),
    wikipedia: () => chamadas.filter((c) => c.host.endsWith('wikipedia.org')),
  };
}
const logger = () => ({ warn() {}, error() {} });

test('AC-3: resposta pt com HTTP 404 gera 0 chamadas a en.wikipedia.org', async () => {
  const rede = criarRede({ wikipedia: () => resposta(404, {}) });
  const e = criarEnriquecedor({ fetchImpl: rede.fetchImpl, logger: logger() });
  await e.enriquecer(['Q1', 'Q2']);
  assert.equal(rede.wikipedia().length, 2);
  assert.equal(rede.chamadas.filter((c) => c.host === 'en.wikipedia.org').length, 0);
});

test('AC-6: desambiguação e extract vazio entram no cache e não são buscados de novo', async () => {
  const rede = criarRede({
    wikipedia: (url) => resposta(200, tituloDaUrl(url) === 'Filme Q1'
      ? { type: 'disambiguation', extract: 'Pode se referir a', content_urls: { desktop: { page: 'https://pt.wikipedia.org/wiki/Q1' } } }
      : { extract: '', content_urls: { desktop: { page: 'https://pt.wikipedia.org/wiki/Q2' } } }),
  });
  const e = criarEnriquecedor({ fetchImpl: rede.fetchImpl, logger: logger() });
  const r1 = await e.enriquecer(['Q1', 'Q2']);
  assert.equal(r1.get('Q1'), null);
  const base = rede.chamadas.length;
  await e.enriquecer(['Q1']);
  assert.equal(rede.chamadas.length, base);
});

test('AC-7: 429 no Wikidata de uma recomendação não chama a Wikipédia nem para QIDs com título em cache', async () => {
  let wikipedia503 = true;
  const rede = criarRede({
    wikidata: (url) => (new URL(url).searchParams.get('ids') === 'Q1' ? resposta(200, entidades(['Q1'])) : resposta(429, {}, { 'Retry-After': '24' })),
    wikipedia: () => (wikipedia503 ? resposta(503, {}) : resposta(200, resumoOk('Filme Q1'))),
  });
  let t = 0;
  const e = criarEnriquecedor({ fetchImpl: rede.fetchImpl, logger: logger(), agora: () => t });
  await e.enriquecer(['Q1']);
  wikipedia503 = false;
  const base = rede.wikipedia().length;
  await e.enriquecer(['Q1', 'Q2']);
  assert.equal(rede.wikipedia().length, base);
});

test('AC-2 e AC-6: QIDs repetidos viram 1 só id na chamada ao Wikidata e 1 só resumo', async () => {
  const rede = criarRede();
  const e = criarEnriquecedor({ fetchImpl: rede.fetchImpl, logger: logger() });
  await e.enriquecer(['Q1', 'Q1', 'Q2']);
  assert.equal(new URL(rede.wikidata()[0].url).searchParams.get('ids'), 'Q1|Q2');
  assert.equal(rede.wikipedia().length, 2);
});

test('AC-8: exceção inesperada dentro do enriquecimento resolve sem lançar, com 1 warn [filmelier]', async () => {
  const warns = [];
  const fetchImpl = async () => ({ ok: false, status: 500, headers: { get() { throw new Error('boom'); } } });
  const e = criarEnriquecedor({ fetchImpl, logger: { warn: (...a) => warns.push(a), error() {} } });
  const r = await e.enriquecer(['Q1', 'Q2']);
  assert.equal(r.get('Q1'), null);
  assert.equal(warns.length, 1);
  assert.ok(String(warns[0][0]).startsWith('[filmelier]'));
  assert.equal(warns[0][1].erro, 'boom');
  assert.equal(warns[0][1].fonte, 'interno');
});

test('AC-4: capas de outros hosts da Wikimedia (commons, maps, prefixo colado) são recusadas', () => {
  for (const u of [
    'https://commons.wikimedia.org/wikipedia/commons/a/ab/Exemplo.jpg',
    'https://maps.wikimedia.org/wikipedia/commons/a/ab/Exemplo.jpg',
    'https://xupload.wikimedia.org/wikipedia/commons/a/ab/Exemplo.jpg',
    'https://upload.wikimedia.org.exemplo.com/wikipedia/pt/a/ab/Exemplo.jpg',
  ]) assert.equal(aceitarCapa(u), false, u);
  for (const u of [123, null, {}, ['https://upload.wikimedia.org/wikipedia/pt/a.jpg']]) assert.equal(aceitarCapa(u), false);
  assert.equal(aceitarCapa('https://upload.wikimedia.org/wikipedia/pt/a/ab/Exemplo.jpg'), true);
});

test('AC-11: carregarDados usa 15.000 ms por padrão e um sinal de criarSinal em cada um dos 2 arquivos', async () => {
  const humores = { humores: [{ id: 'a', rotulo: 'A', generos: [] }] };
  const filmes = { meta: { geradoEm: '2026-11-20T13:45:00.000Z' }, filmes: [] };
  const prazos = [];
  const marcas = [];
  const fetchImpl = async (url, { signal }) => { marcas.push([url, signal]); return { ok: true, status: 200, json: async () => (url.includes('humores') ? humores : filmes) }; };
  const log = { error() {} };
  // Padrão: não deve lançar com o sinal real.
  assert.equal((await carregarDados(fetchImpl, log)).erro, null);
  marcas.length = 0;
  const r = await carregarDados(fetchImpl, log, { criarSinal: (ms) => { prazos.push(ms); return { ms }; } });
  assert.equal(r.erro, null);
  assert.deepEqual(prazos, [15000, 15000]);
  assert.equal(marcas.length, 2);
  assert.ok(marcas.every(([, s]) => s && s.ms === 15000));
});

test('AC-10: o título do card é sempre o do dataset e capa sem URL de artigo vira placeholder', () => {
  const tabela = JSON.parse(readFileSync(new URL('../data/humores.json', import.meta.url), 'utf8'));
  const item = montarItem({ qid: 'Q83495', titulo: 'Matrix', ano: 1999, generos: ['Q471839'], sitelinks: 90, imdb: 'tt0133093' }, listarGeneros(tabela));
  const c = montarCard(item, { idioma: 'pt', titulo: 'The Matrix (artigo)', sinopse: 'x', capaUrl: CAPA, artigoUrl: 'https://pt.wikipedia.org/wiki/M' });
  assert.equal(c.titulo, 'Matrix');
  const sem = montarCard(item, { idioma: 'pt', sinopse: null, capaUrl: CAPA, artigoUrl: null });
  assert.equal(sem.capa, null);
  assert.equal(sem.placeholder, true);
});
