import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  montarUrlWikidata, lerTitulos, montarUrlResumo, lerResumo, buscarJson, aceitarCapa, aceitarArtigo, SEM_ARTIGO, FORMATO,
} from '../src/wikimedia.mjs';

const QIDS = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'];

test('AC-2: URL do Wikidata com os parâmetros de wbgetentities', () => {
  const url = new URL(montarUrlWikidata(QIDS));
  assert.equal(url.host, 'www.wikidata.org');
  assert.equal(url.pathname, '/w/api.php');
  const p = url.searchParams;
  assert.equal(p.get('action'), 'wbgetentities');
  assert.equal(p.get('ids'), 'Q1|Q2|Q3|Q4|Q5');
  assert.equal(p.get('props'), 'sitelinks');
  assert.equal(p.get('sitefilter'), 'ptwiki|enwiki');
  assert.equal(p.get('format'), 'json');
  assert.equal(p.get('origin'), '*');
});

test('AC-2: escolha do idioma pelo sitelink (pt vence en; só en vira en)', () => {
  const json = { entities: {
    Q1: { sitelinks: { enwiki: { title: 'The Matrix' }, ptwiki: { title: 'Matrix' } } },
    Q2: { sitelinks: { enwiki: { title: 'Only English' } } },
  } };
  const mapa = lerTitulos(json, ['Q1', 'Q2']);
  assert.deepEqual(mapa.get('Q1'), { idioma: 'pt', titulo: 'Matrix' });
  assert.deepEqual(mapa.get('Q2'), { idioma: 'en', titulo: 'Only English' });
});

test('AC-2: sem ptwiki e enwiki ou missing resolve para sem artigo', () => {
  const json = { entities: { Q1: { sitelinks: {} }, Q2: { id: 'Q2', missing: '' } } };
  const mapa = lerTitulos(json, ['Q1', 'Q2']);
  assert.equal(mapa.get('Q1'), SEM_ARTIGO);
  assert.equal(mapa.get('Q2'), SEM_ARTIGO);
});

test('AC-8: QID pedido que não volta em entities é sem artigo; sem sitelinks é formato; entities ausente é null', () => {
  const mapa = lerTitulos({ entities: { Q2: { type: 'item' } } }, ['Q1', 'Q2']);
  assert.equal(mapa.get('Q1'), SEM_ARTIGO);
  assert.equal(mapa.get('Q2'), FORMATO);
  assert.equal(lerTitulos({}, ['Q1']), null);
  assert.equal(lerTitulos({ entities: [] }, ['Q1']), null);
  assert.equal(lerTitulos(null, ['Q1']), null);
});

test('AC-3: URL do resumo pt com título entre parênteses e espaços trocados por sublinhado', () => {
  assert.equal(
    montarUrlResumo('pt', 'Titanic (filme de 1997)'),
    'https://pt.wikipedia.org/api/rest_v1/page/summary/Titanic_(filme_de_1997)',
  );
});

test('AC-3: URL do resumo en e codificação de caracteres especiais', () => {
  const url = new URL(montarUrlResumo('en', 'Amélie/2?'));
  assert.equal(url.host, 'en.wikipedia.org');
  assert.ok(url.pathname.startsWith('/api/rest_v1/page/summary/'));
  assert.ok(url.pathname.endsWith('Am%C3%A9lie%2F2%3F'));
  assert.throws(() => montarUrlResumo('fr', 'X'));
});

const ARTIGO = 'https://pt.wikipedia.org/wiki/Matrix';
const CAPA = 'https://upload.wikimedia.org/wikipedia/en/c/c1/The_Matrix_Poster.jpg';

test('AC-3: só o extract em texto puro, nunca extract_html', () => {
  const r = lerResumo({
    extract: 'Texto puro.', extract_html: '<p>Texto <b>html</b></p>',
    thumbnail: { source: CAPA }, content_urls: { desktop: { page: ARTIGO } },
  });
  assert.deepEqual(r, { sinopse: 'Texto puro.', capaUrl: CAPA, artigoUrl: ARTIGO });
});

test('AC-3: desambiguação anula sinopse e capa; extract vazio ou ausente mantém a capa', () => {
  const comum = { thumbnail: { source: CAPA }, content_urls: { desktop: { page: ARTIGO } } };
  assert.deepEqual(lerResumo({ ...comum, type: 'disambiguation', extract: 'X' }), { sinopse: null, capaUrl: null, artigoUrl: null });
  assert.deepEqual(lerResumo({ ...comum, extract: '' }), { sinopse: null, capaUrl: CAPA, artigoUrl: ARTIGO });
  assert.deepEqual(lerResumo({ ...comum }), { sinopse: null, capaUrl: CAPA, artigoUrl: ARTIGO });
});

test('AC-8: thumbnail que não é objeto ou corpo que não é objeto é formato (null)', () => {
  assert.equal(lerResumo({ extract: 'X', thumbnail: 'x' }), null);
  assert.equal(lerResumo(null), null);
  assert.equal(lerResumo('texto'), null);
});

test('AC-4: capas aceitas', () => {
  for (const u of [
    'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Exemplo.jpg/330px-Exemplo.jpg',
    'https://upload.wikimedia.org/wikipedia/pt/2/22/Titanic_poster.jpg',
    CAPA,
  ]) assert.equal(aceitarCapa(u), true, u);
});

test('AC-4: capas recusadas (host, subdomínio, thumb, http, não URL, ausente, porta, credencial)', () => {
  for (const u of [
    'https://exemplo.com/wikipedia/commons/a/ab/Exemplo.jpg',
    'https://upload.wikimedia.org.exemplo.com/wikipedia/commons/a/ab/Exemplo.jpg',
    'https://thumb.wikimedia.org/wikipedia/commons/a/ab/Exemplo.jpg',
    'http://upload.wikimedia.org/wikipedia/commons/a/ab/Exemplo.jpg',
    'nao-e-url',
    undefined,
    'https://upload.wikimedia.org:8443/wikipedia/commons/a/ab/Exemplo.jpg',
    'https://u:p@upload.wikimedia.org/wikipedia/commons/a/ab/Exemplo.jpg',
    'https://upload.wikimedia.org/outro/commons/a/ab/Exemplo.jpg',
  ]) assert.equal(aceitarCapa(u), false, String(u));
});

test('AC-5: artigo fora de pt/en wikipedia anula a sinopse', () => {
  for (const page of ['https://exemplo.com/wiki/X', undefined, 'https://fr.wikipedia.org/wiki/X', 'http://pt.wikipedia.org/wiki/X']) {
    const r = lerResumo({ extract: 'Texto', content_urls: { desktop: { page } } });
    assert.equal(r.sinopse, null, String(page));
  }
  assert.equal(aceitarArtigo('https://en.wikipedia.org/wiki/X'), true);
});

test('AC-10: capa aceita sem URL de artigo válida vira nula', () => {
  for (const content_urls of [undefined, { desktop: { page: 'https://exemplo.com/wiki/X' } }]) {
    const r = lerResumo({ extract: 'Texto', thumbnail: { source: CAPA }, content_urls });
    assert.equal(r.capaUrl, null);
  }
});

function resposta(status, corpo, cabecalhos = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n) => cabecalhos[n] ?? null },
    json: async () => { if (corpo instanceof Error) throw corpo; return corpo; },
  };
}

test('AC-13: buscarJson chama fetch só com credentials, referrerPolicy e signal', async () => {
  const chamadas = [];
  const fetchImpl = async (url, opcoes) => { chamadas.push([url, opcoes]); return resposta(200, { a: 1 }); };
  const r = await buscarJson('https://x/', { fetchImpl, criarSinal: (ms) => `sinal-${ms}`, timeoutMs: 123 });
  assert.deepEqual(r, { ok: true, json: { a: 1 } });
  assert.deepEqual(chamadas[0][1], { credentials: 'omit', referrerPolicy: 'no-referrer', signal: 'sinal-123' });
});

test('AC-8: buscarJson classifica rede, timeout, http, 429 com Retry-After e formato, sem lançar', async () => {
  const com = (fetchImpl) => buscarJson('https://x/', { fetchImpl });
  assert.equal((await com(async () => { throw new TypeError('Failed to fetch'); })).motivo, 'rede');
  assert.equal((await com(() => { throw new Error('síncrono'); })).motivo, 'rede');
  assert.equal((await com(async () => { throw new DOMException('t', 'TimeoutError'); })).motivo, 'timeout');
  assert.equal((await com(async () => { throw new DOMException('a', 'AbortError'); })).motivo, 'timeout');
  assert.equal((await com(async () => resposta(500, {}))).motivo, 'http-500');
  const r429 = await com(async () => resposta(429, {}, { 'Retry-After': '24' }));
  assert.deepEqual([r429.motivo, r429.status, r429.retryAfter], ['http-429', 429, '24']);
  assert.equal((await com(async () => resposta(200, new SyntaxError('x')))).motivo, 'formato');
});

test('R-nit: QID fora de ^Q\\d+$ não entra na URL do Wikidata', () => {
  for (const ruim of ['q1', 'Q', 'Q1|Q2', 'Q1&origin=x', '../Q1', 'Q1 ', '', 1, null]) {
    assert.throws(() => montarUrlWikidata(['Q5', ruim]), /QID inválido/, String(ruim));
  }
  assert.ok(montarUrlWikidata(['Q5', 'Q123']).includes('ids=Q5%7CQ123'));
});

test('R-nit: aceitarCapa recusa usuário ou senha na URL (via as propriedades da API URL)', () => {
  const base = 'upload.wikimedia.org/wikipedia/commons/a/ab/Exemplo.jpg';
  for (const u of [`https://u@${base}`, `https://u:p@${base}`, `https://:p@${base}`]) assert.equal(aceitarCapa(u), false, u);
  assert.equal(aceitarCapa(`https://${base}`), true);
});
