import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { criarEnriquecedor } from '../src/enriquecer.mjs';

const CAPA = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Exemplo.jpg/330px-Exemplo.jpg';
const QIDS = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'];

const resposta = (status, corpo, cabecalhos = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (n) => cabecalhos[n] ?? null },
  json: async () => { if (corpo instanceof Error) throw corpo; return corpo; },
});

const tituloDe = (qid) => `Filme ${qid}`;
const entidades = (qids) => ({ entities: Object.fromEntries(qids.map((q) => [q, { id: q, sitelinks: { ptwiki: { title: tituloDe(q) } } }])) });
const resumoOk = (titulo) => ({
  extract: `Sinopse de ${titulo}`,
  thumbnail: { source: CAPA },
  content_urls: { desktop: { page: `https://pt.wikipedia.org/wiki/${encodeURIComponent(titulo.replaceAll(' ', '_'))}` } },
});

// Rede simulada: registra chamadas e deixa cada teste sobrescrever o comportamento por host.
function criarRede({ wikidata, wikipedia } = {}) {
  const chamadas = [];
  const padraoWikidata = (url) => resposta(200, entidades(new URL(url).searchParams.get('ids').split('|')));
  const padraoWikipedia = (url) => resposta(200, resumoOk(decodeURIComponent(new URL(url).pathname.split('/').pop()).replaceAll('_', ' ')));
  const fetchImpl = async (url, opcoes) => {
    chamadas.push({ url, opcoes, host: new URL(url).host });
    const u = new URL(url);
    const tratar = u.host === 'www.wikidata.org' ? (wikidata ?? padraoWikidata) : (wikipedia ?? padraoWikipedia);
    return tratar(url, opcoes);
  };
  const por = (filtro) => chamadas.filter((c) => filtro(c.host));
  return {
    fetchImpl,
    chamadas,
    wikidata: () => por((h) => h === 'www.wikidata.org'),
    wikipedia: () => por((h) => h.endsWith('wikipedia.org')),
  };
}

const loggerEspiao = () => {
  const warns = [];
  return { warns, warn: (...a) => warns.push(a), error: () => {} };
};

function novo(rede, extra = {}) {
  const logger = extra.logger ?? loggerEspiao();
  return { logger, e: criarEnriquecedor({ fetchImpl: rede.fetchImpl, logger, ...extra }) };
}

test('AC-6: recomendação de 5 filmes novos faz 1 chamada ao Wikidata e 5 à Wikipédia', async () => {
  const rede = criarRede();
  const { e } = novo(rede);
  const r = await e.enriquecer(QIDS);
  assert.equal(rede.wikidata().length, 1);
  assert.ok(rede.wikipedia().length <= 5);
  assert.equal(rede.wikipedia().length, 5);
  assert.deepEqual(r.get('Q1'), {
    idioma: 'pt',
    sinopse: 'Sinopse de Filme Q1',
    capaUrl: CAPA,
    artigoUrl: 'https://pt.wikipedia.org/wiki/Filme_Q1',
  });
  assert.equal(r.size, 5);
});

test('AC-6: a mesma recomendação repetida faz 0 chamadas externas', async () => {
  const rede = criarRede();
  const { e } = novo(rede);
  await e.enriquecer(QIDS);
  const antes = rede.chamadas.length;
  const r = await e.enriquecer(QIDS);
  assert.equal(rede.chamadas.length, antes);
  assert.ok(QIDS.every((q) => r.get(q) !== null));
});

test('AC-6: cache parcial pede ao Wikidata só os 2 novos', async () => {
  const rede = criarRede();
  const { e } = novo(rede);
  await e.enriquecer(['Q1', 'Q2', 'Q3']);
  const base = rede.chamadas.length;
  await e.enriquecer(QIDS);
  const novas = rede.chamadas.slice(base);
  const wd = novas.filter((c) => c.host === 'www.wikidata.org');
  assert.equal(wd.length, 1);
  assert.equal(new URL(wd[0].url).searchParams.get('ids'), 'Q4|Q5');
  assert.ok(novas.filter((c) => c.host.endsWith('wikipedia.org')).length <= 2);
});

test('AC-6 e AC-2: resumo em timeout volta na recomendação seguinte com 1 chamada à Wikipédia e 0 ao Wikidata', async () => {
  let falhar = true;
  const rede = criarRede({ wikipedia: (url) => {
    if (falhar) throw new DOMException('t', 'TimeoutError');
    return resposta(200, resumoOk('Filme Q1'));
  } });
  const { e } = novo(rede);
  const r1 = await e.enriquecer(['Q1']);
  assert.equal(r1.get('Q1'), null);
  falhar = false;
  const base = rede.chamadas.length;
  const r2 = await e.enriquecer(['Q1']);
  const novas = rede.chamadas.slice(base);
  assert.equal(novas.filter((c) => c.host === 'www.wikidata.org').length, 0);
  assert.equal(novas.filter((c) => c.host.endsWith('wikipedia.org')).length, 1);
  assert.notEqual(r2.get('Q1'), null);
});

test('AC-2: com os títulos no cache há 0 chamadas ao Wikidata', async () => {
  const rede = criarRede({ wikipedia: () => resposta(503, {}) });
  const { e } = novo(rede);
  await e.enriquecer(QIDS);
  const base = rede.chamadas.length;
  await e.enriquecer(QIDS);
  assert.equal(rede.chamadas.slice(base).filter((c) => c.host === 'www.wikidata.org').length, 0);
});

test('AC-6: HTTP 404 e entidade missing são definitivos e não voltam a ser buscados', async () => {
  const rede = criarRede({
    wikidata: () => resposta(200, { entities: { Q1: { id: 'Q1', sitelinks: { ptwiki: { title: 'Filme Q1' } } }, Q2: { id: 'Q2', missing: '' } } }),
    wikipedia: () => resposta(404, {}),
  });
  const { e } = novo(rede);
  const r1 = await e.enriquecer(['Q1', 'Q2']);
  assert.equal(r1.get('Q1'), null);
  assert.equal(r1.get('Q2'), null);
  const base = rede.chamadas.length;
  await e.enriquecer(['Q1', 'Q2']);
  assert.equal(rede.chamadas.length, base);
});

test('AC-6: HTTP 503 e 429 do resumo não entram no cache (nova chamada fora da suspensão)', async () => {
  let status = 503;
  let t = 0;
  const rede = criarRede({ wikipedia: () => (status === 200 ? resposta(200, resumoOk('Filme Q1')) : resposta(status, {})) });
  const { e } = novo(rede, { agora: () => t });
  await e.enriquecer(['Q1']);
  status = 429;
  await e.enriquecer(['Q1']);
  t = 60_000;
  status = 200;
  const base = rede.chamadas.length;
  const r = await e.enriquecer(['Q1']);
  assert.equal(rede.chamadas.slice(base).filter((c) => c.host.endsWith('wikipedia.org')).length, 1);
  assert.notEqual(r.get('Q1'), null);
});

test('AC-9: o cache guarda título e resumo dos QIDs resolvidos', async () => {
  const rede = criarRede();
  const { e } = novo(rede);
  await e.enriquecer(['Q1']);
  assert.ok(e.cache.titulos.has('Q1'));
  assert.ok(e.cache.resumos.has('Q1'));
});

// ---- Suspensão por 429 (AC-7) ----

function rede429(retryAfter) {
  let limitado = true;
  const rede = criarRede({ wikipedia: () => (limitado
    ? resposta(429, {}, retryAfter === undefined ? {} : { 'Retry-After': retryAfter })
    : resposta(200, resumoOk('Filme Q1'))) });
  return { rede, liberar: () => { limitado = false; } };
}

test('AC-7: Retry-After 24 suspende por 24 s (10 s: 0 chamadas; 25 s: volta a chamar)', async () => {
  const { rede, liberar } = rede429('24');
  let t = 1000;
  const { e } = novo(rede, { agora: () => t });
  await e.enriquecer(['Q1']);
  liberar();
  t = 1000 + 10_000;
  const base = rede.chamadas.length;
  const r = await e.enriquecer(['Q2']);
  assert.equal(rede.chamadas.length, base);
  assert.equal(r.get('Q2'), null);
  t = 1000 + 25_000;
  await e.enriquecer(['Q2']);
  assert.ok(rede.wikidata().length >= 2);
  assert.ok(rede.chamadas.length > base);
});

for (const valor of [undefined, 'abc', '-3', '1.5', '0', '00', '']) {
  test(`AC-7: Retry-After ${valor === undefined ? 'ausente' : `"${valor}"`} suspende por 30 s (29 s: 0 chamadas; 31 s: volta)`, async () => {
    const { rede, liberar } = rede429(valor);
    let t = 0;
    const { e } = novo(rede, { agora: () => t });
    await e.enriquecer(['Q1']);
    liberar();
    const base = rede.chamadas.length;
    t = 29_000;
    await e.enriquecer(['Q2']);
    assert.equal(rede.chamadas.length, base);
    t = 31_000;
    await e.enriquecer(['Q2']);
    assert.ok(rede.chamadas.length > base);
  });
}

test('AC-7 (R-3): Retry-After acima do teto suspende por 300 s, não pelo valor recebido', async () => {
  const { rede, liberar } = rede429('999999999');
  let t = 0;
  const { e } = novo(rede, { agora: () => t });
  await e.enriquecer(['Q1']);
  liberar();
  const base = rede.chamadas.length;
  t = 299_000;
  await e.enriquecer(['Q2']);
  assert.equal(rede.chamadas.length, base);
  t = 301_000;
  await e.enriquecer(['Q2']);
  assert.ok(rede.chamadas.length > base);
});

for (const valor of ['0', undefined, 'abc']) {
  test(`AC-7 (R-3): 429 no Wikidata com Retry-After ${valor === undefined ? 'ausente' : `"${valor}"`} não chama a Wikipédia nem para QIDs com título em cache`, { timeout: 5000 }, async () => {
    let wikipedia503 = true;
    const cab = valor === undefined ? {} : { 'Retry-After': valor };
    const rede = criarRede({
      wikidata: (url) => (new URL(url).searchParams.get('ids') === 'Q1' ? resposta(200, entidades(['Q1'])) : resposta(429, {}, cab)),
      wikipedia: () => (wikipedia503 ? resposta(503, {}) : resposta(200, resumoOk('Filme Q1'))),
    });
    const { e } = novo(rede, { agora: () => 0 });
    await e.enriquecer(['Q1']);
    wikipedia503 = false;
    const base = rede.wikipedia().length;
    await e.enriquecer(['Q1', 'Q2']);
    assert.equal(rede.wikipedia().length, base);
  });
}

test('AC-7: 429 no Wikidata encerra a recomendação sem chamar a Wikipédia', async () => {
  const rede = criarRede({ wikidata: () => resposta(429, {}, { 'Retry-After': '24' }) });
  const { e } = novo(rede);
  const r = await e.enriquecer(QIDS);
  assert.equal(rede.wikidata().length, 1);
  assert.equal(rede.wikipedia().length, 0);
  assert.ok(QIDS.every((q) => r.get(q) === null));
});

test('AC-7: na suspensão, 0 chamadas; o cache entrega capa e sinopse dos 2 QIDs e os 3 outros saem sem enriquecimento', async () => {
  let t = 0;
  const rede = criarRede();
  const { e } = novo(rede, { agora: () => t });
  await e.enriquecer(['Q1', 'Q2']);
  // Força a suspensão com um 429 do Wikidata para um QID novo.
  const rede2 = criarRede({ wikidata: () => resposta(429, {}, { 'Retry-After': '24' }) });
  const e2 = criarEnriquecedor({ fetchImpl: async (u, o) => (new URL(u).searchParams.get('ids') === 'Q3|Q4|Q5' ? rede2.fetchImpl(u, o) : rede.fetchImpl(u, o)), agora: () => t, logger: loggerEspiao() });
  await e2.enriquecer(['Q1', 'Q2']);
  await e2.enriquecer(['Q3', 'Q4', 'Q5']);
  assert.ok(e2.suspensoAte() > t);
  const base = rede.chamadas.length + rede2.chamadas.length;
  t = 5000;
  const r = await e2.enriquecer(['Q1', 'Q2', 'Q3', 'Q4', 'Q5']);
  assert.equal(rede.chamadas.length + rede2.chamadas.length, base);
  assert.notEqual(r.get('Q1'), null);
  assert.notEqual(r.get('Q2'), null);
  assert.deepEqual(['Q3', 'Q4', 'Q5'].map((q) => r.get(q)), [null, null, null]);
});

test('AC-7: chamadas em andamento seguem depois de um 429 e são aplicadas e guardadas no cache', { timeout: 5000 }, async () => {
  const pendentes = [];
  const rede = criarRede({ wikipedia: () => new Promise((resolve) => pendentes.push(resolve)) });
  const { e } = novo(rede);
  const p = e.enriquecer(QIDS);
  while (pendentes.length < 5) await new Promise((r) => setImmediate(r));
  pendentes[0](resposta(429, {}, { 'Retry-After': '24' }));
  for (let i = 1; i < 5; i += 1) pendentes[i](resposta(200, resumoOk(`Filme Q${i + 1}`)));
  const r = await p;
  assert.equal(r.get('Q1'), null);
  for (const q of ['Q2', 'Q3', 'Q4', 'Q5']) {
    assert.equal(r.get(q).sinopse, `Sinopse de Filme ${q}`);
    assert.ok(e.cache.resumos.has(q));
  }
});

// ---- Timeout e degradação (AC-8, AC-14) ----

const criarSinalSimulado = (ms) => {
  const c = new AbortController();
  setTimeout(() => c.abort(new DOMException('timeout', 'TimeoutError')), ms);
  return c.signal;
};
const nuncaResponde = (_url, { signal }) => new Promise((_, rejeitar) => {
  signal.addEventListener('abort', () => rejeitar(signal.reason));
});

const casosWikidata = {
  rejeicao: { wikidata: () => { throw new TypeError('Failed to fetch'); }, motivo: 'rede' },
  timeout: { wikidata: nuncaResponde, motivo: 'timeout' },
  'HTTP 500': { wikidata: () => resposta(500, {}), motivo: 'http-500' },
  'não JSON': { wikidata: () => resposta(200, new SyntaxError('Unexpected token')), motivo: 'formato' },
  'entities ausente': { wikidata: () => resposta(200, { success: 1 }), motivo: 'formato' },
};

for (const [nome, caso] of Object.entries(casosWikidata)) {
  test(`AC-8: falha do Wikidata (${nome}) resolve sem exceção, 0 chamadas à Wikipédia e 1 warn`, async () => {
    const rede = criarRede({ wikidata: caso.wikidata });
    const { e, logger } = novo(rede, { timeoutMs: 50 });
    const r = await e.enriquecer(QIDS);
    assert.ok(QIDS.every((q) => r.get(q) === null));
    assert.equal(rede.wikipedia().length, 0);
    assert.equal(logger.warns.length, 1);
    assert.ok(logger.warns[0][0].startsWith('[filmelier]'));
    assert.equal(logger.warns[0][1].fonte, 'wikidata');
    assert.deepEqual(logger.warns[0][1].qids, QIDS);
    assert.equal(logger.warns[0][1].motivo, caso.motivo);
  });
}

const casosResumo = {
  rejeicao: () => { throw new TypeError('Failed to fetch'); },
  timeout: nuncaResponde,
  'HTTP 500': () => resposta(500, {}),
  'não JSON': () => resposta(200, new SyntaxError('x')),
  'thumbnail x': () => resposta(200, { extract: 'T', thumbnail: 'x' }),
};

for (const [nome, falhaResumo] of Object.entries(casosResumo)) {
  test(`AC-8: falha do resumo de 1 filme (${nome}) deixa só esse sem enriquecimento`, async () => {
    const rede = criarRede({ wikipedia: (url, opcoes) => (url.includes('Filme_Q3') ? falhaResumo(url, opcoes) : resposta(200, resumoOk(decodeURIComponent(url.split('/').pop()).replaceAll('_', ' ')))) });
    const { e, logger } = novo(rede, { timeoutMs: 50, criarSinal: criarSinalReal });
    const r = await e.enriquecer(QIDS);
    assert.equal(r.get('Q3'), null);
    for (const q of ['Q1', 'Q2', 'Q4', 'Q5']) assert.notEqual(r.get(q), null, q);
    assert.equal(logger.warns.length, 1);
    assert.equal(logger.warns[0][1].qid, 'Q3');
  });
}

function criarSinalReal(ms) { return AbortSignal.timeout(ms); }

test('AC-8: QID pedido que não volta em entities é sem artigo, sem warn, definitivo; os outros seguem', async () => {
  const rede = criarRede({ wikidata: () => resposta(200, entidades(['Q1', 'Q2'])) });
  const { e, logger } = novo(rede);
  const r = await e.enriquecer(['Q1', 'Q2', 'Q3']);
  assert.equal(r.get('Q3'), null);
  assert.notEqual(r.get('Q1'), null);
  assert.equal(logger.warns.length, 0);
  const base = rede.chamadas.length;
  await e.enriquecer(['Q3']);
  assert.equal(rede.chamadas.length, base);
});

test('AC-8: entidade sem sitelinks (não missing) sai sem enriquecimento, fora do cache, e os outros seguem', async () => {
  const rede = criarRede({ wikidata: () => resposta(200, { entities: { ...entidades(['Q1']).entities, Q2: { id: 'Q2', type: 'item' } } }) });
  const { e, logger } = novo(rede);
  const r = await e.enriquecer(['Q1', 'Q2']);
  assert.notEqual(r.get('Q1'), null);
  assert.equal(r.get('Q2'), null);
  assert.ok(!e.cache.titulos.has('Q2'));
  assert.equal(rede.wikipedia().length, 1);
  assert.equal(logger.warns.length, 1);
  assert.deepEqual(logger.warns[0][1], { fonte: 'wikidata', qids: ['Q2'], motivo: 'formato' });
});

test('AC-14: Wikidata em 4.999 ms e Wikipédia sem resposta: resolve em até 10.000 ms simulados, tudo sem enriquecimento', { timeout: 5000 }, async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  try {
    const inicio = Date.now();
    const rede = criarRede({
      wikidata: (url) => new Promise((resolve) => setTimeout(() => resolve(resposta(200, entidades(QIDS))), 4999)),
      wikipedia: nuncaResponde,
    });
    const { e } = novo(rede, { criarSinal: criarSinalSimulado });
    let resolvida = false;
    const p = e.enriquecer(QIDS).then((r) => { resolvida = true; return r; });
    await new Promise((r) => setImmediate(r));
    mock.timers.tick(4999);
    await new Promise((r) => setImmediate(r));
    assert.equal(rede.wikipedia().length, 5);
    mock.timers.tick(5000);
    const r = await p;
    assert.ok(resolvida);
    assert.ok(Date.now() - inicio <= 10_000);
    assert.ok(QIDS.every((q) => r.get(q) === null));
  } finally {
    mock.timers.reset();
  }
});

test('AC-14: Wikidata sem resposta resolve em até 5.000 ms simulados e 0 chamadas à Wikipédia', { timeout: 5000 }, async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  try {
    const inicio = Date.now();
    const rede = criarRede({ wikidata: nuncaResponde });
    const { e } = novo(rede, { criarSinal: criarSinalSimulado });
    const p = e.enriquecer(QIDS);
    await new Promise((r) => setImmediate(r));
    mock.timers.tick(5000);
    const r = await p;
    assert.ok(Date.now() - inicio <= 5000);
    assert.equal(rede.wikipedia().length, 0);
    assert.ok(QIDS.every((q) => r.get(q) === null));
  } finally {
    mock.timers.reset();
  }
});

// ---- Logs (AC-8) ----

test('AC-8: timeout do Wikidata gera 1 warn com fonte, os 5 QIDs e motivo timeout', async () => {
  const rede = criarRede({ wikidata: () => { throw new DOMException('t', 'TimeoutError'); } });
  const { e, logger } = novo(rede);
  await e.enriquecer(QIDS);
  assert.equal(logger.warns.length, 1);
  assert.equal(logger.warns[0][0], '[filmelier] enriquecimento falhou');
  assert.deepEqual(logger.warns[0][1], { fonte: 'wikidata', qids: QIDS, motivo: 'timeout' });
});

test('AC-8: HTTP 500 do resumo gera 1 warn com fonte wikipedia, o QID e motivo http-500', async () => {
  const rede = criarRede({ wikipedia: () => resposta(500, {}) });
  const { e, logger } = novo(rede);
  await e.enriquecer(['Q1']);
  assert.equal(logger.warns.length, 1);
  assert.deepEqual(logger.warns[0][1], { fonte: 'wikipedia', qid: 'Q1', motivo: 'http-500' });
});

test('AC-8: 429 com Retry-After 24 gera a linha de suspensão e nenhuma linha com humor ou gênero', async () => {
  const rede = criarRede({ wikipedia: () => resposta(429, {}, { 'Retry-After': '24' }) });
  const { e, logger } = novo(rede);
  await e.enriquecer(['Q1']);
  const linhas = logger.warns.map((a) => a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  assert.equal(linhas.length, 2);
  assert.ok(linhas.every((l) => l.startsWith('[filmelier]')));
  assert.ok(linhas.some((l) => l.includes('http-429')));
  assert.ok(linhas.some((l) => l.includes('suspensas por 24 s')));
  for (const l of linhas) {
    assert.ok(!l.includes('medo'));
    assert.ok(!l.includes('Q200092'));
  }
});

// ---- Opções das chamadas externas (AC-13) ----

test('AC-13: toda chamada é GET sem headers, credentials omit, no-referrer, só com QIDs da recomendação', async () => {
  const rede = criarRede();
  const { e } = novo(rede);
  await e.enriquecer(QIDS);
  assert.equal(rede.chamadas.length, 6);
  for (const c of rede.chamadas) {
    assert.ok([undefined, 'GET'].includes(c.opcoes.method));
    assert.ok(!('headers' in c.opcoes));
    assert.equal(c.opcoes.credentials, 'omit');
    assert.equal(c.opcoes.referrerPolicy, 'no-referrer');
    assert.ok(c.opcoes.signal instanceof AbortSignal);
    for (const qid of c.url.match(/Q\d+/g) ?? []) assert.ok(QIDS.includes(qid), qid);
    assert.ok(!/medo|Q200092|humor/.test(c.url));
  }
});

// ---- Deduplicação de chamadas em voo (R-5) ----

test('AC-6 (R-5): duas recomendações idênticas disparadas juntas fazem 1 chamada ao Wikidata e 5 à Wikipédia', { timeout: 5000 }, async () => {
  const rede = criarRede();
  const { e } = novo(rede);
  const [a, b] = await Promise.all([e.enriquecer(QIDS), e.enriquecer(QIDS)]);
  assert.equal(rede.wikidata().length, 1);
  assert.equal(rede.wikipedia().length, 5);
  assert.deepEqual(a.get('Q3'), b.get('Q3'));
  assert.ok(QIDS.every((q) => a.get(q) !== null && b.get(q) !== null));
});

test('AC-6 (R-5): recomendações sobrepostas em voo consultam cada QID uma só vez', { timeout: 5000 }, async () => {
  const rede = criarRede();
  const { e } = novo(rede);
  const [a, b] = await Promise.all([e.enriquecer(['Q1', 'Q2', 'Q3']), e.enriquecer(['Q2', 'Q3', 'Q4'])]);
  assert.deepEqual(rede.wikidata().map((c) => new URL(c.url).searchParams.get('ids')), ['Q1|Q2|Q3', 'Q4']);
  assert.equal(rede.wikipedia().length, 4);
  assert.ok(['Q1', 'Q2', 'Q3'].every((q) => a.get(q) !== null));
  assert.ok(['Q2', 'Q3', 'Q4'].every((q) => b.get(q) !== null));
});

test('AC-6 (R-5): o teto de 1 + 5 por recomendação continua valendo com sobreposição', { timeout: 5000 }, async () => {
  const rede = criarRede();
  const { e } = novo(rede);
  await Promise.all([e.enriquecer(QIDS), e.enriquecer(['Q4', 'Q5', 'Q6', 'Q7', 'Q8'])]);
  assert.ok(rede.wikidata().length <= 2);
  assert.ok(rede.wikipedia().length <= 8);
});

test('AC-7 (R-5): 429 do Wikidata em voo encerra também a recomendação que o aguardava', { timeout: 5000 }, async () => {
  const rede = criarRede({ wikidata: () => resposta(429, {}, { 'Retry-After': '0' }) });
  const { e } = novo(rede, { agora: () => 0 });
  const [a, b] = await Promise.all([e.enriquecer(QIDS), e.enriquecer(QIDS)]);
  assert.equal(rede.wikidata().length, 1);
  assert.equal(rede.wikipedia().length, 0);
  assert.ok(QIDS.every((q) => a.get(q) === null && b.get(q) === null));
});

test('AC-6 (R-5): falha em voo não fica presa: a próxima recomendação chama de novo', { timeout: 5000 }, async () => {
  let falhar = true;
  const rede = criarRede({ wikipedia: () => (falhar ? resposta(503, {}) : resposta(200, resumoOk('Filme Q1'))) });
  const { e } = novo(rede);
  await Promise.all([e.enriquecer(['Q1']), e.enriquecer(['Q1'])]);
  assert.equal(rede.wikipedia().length, 1);
  falhar = false;
  const r = await e.enriquecer(['Q1']);
  assert.equal(rede.wikipedia().length, 2);
  assert.notEqual(r.get('Q1'), null);
});

test('R-nit: QID inválido não vira URL: sai sem enriquecimento, com 1 warn, e os válidos seguem', { timeout: 5000 }, async () => {
  const rede = criarRede();
  const { e, logger } = novo(rede);
  const r = await e.enriquecer(['Q1', 'Q2|Q9', 'Q3']);
  assert.equal(new URL(rede.wikidata()[0].url).searchParams.get('ids'), 'Q1|Q3');
  assert.equal(r.get('Q2|Q9'), null);
  assert.notEqual(r.get('Q1'), null);
  assert.equal(logger.warns.length, 1);
  assert.deepEqual(logger.warns[0][1], { fonte: 'interno', qids: ['Q2|Q9'], motivo: 'qid-invalido' });
});
