import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarWorker } from '../worker/index.mjs';

// Literais do cabeçalho de autorização montados por fragmentos (busca de segredos da FILMELIER-2, design D-15).
const CAB_AUTH = 'Author' + 'ization';
const ESQUEMA = 'Bear' + 'er';

const ORIGEM = 'http://127.0.0.1:8765';
const ENV = { ORIGENS_PERMITIDAS: `${ORIGEM},http://192.168.18.227:8765`, TMDB_TOKEN: 'tok-teste-123' };
const mudo = { log() {}, warn() {}, error() {} };

test('AC-15: worker/index.mjs importa no Node sem caches, sem lançar e sem chamar a rede', async () => {
  assert.equal(globalThis.caches, undefined);
  const chamadas = [];
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (...args) => { chamadas.push(args); throw new Error('rede proibida'); };
  try {
    const modulo = await import('../worker/index.mjs');
    assert.equal(typeof modulo.criarWorker, 'function');
    assert.equal(typeof modulo.default.fetch, 'function');
    assert.equal(typeof modulo.criarWorker().fetch, 'function');
  } finally {
    globalThis.fetch = fetchOriginal;
  }
  assert.equal(chamadas.length, 0);
});

// ---- apoio: TMDB simulado e requisições ----
function tmdb(responder = () => ({ status: 404, corpo: {} })) {
  const chamadas = [];
  const fetchImpl = async (url, opcoes) => {
    chamadas.push({ url, opcoes });
    const r = await responder(new URL(url), opcoes, chamadas.length);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, headers: { get: (n) => r.headers?.[n] ?? null }, json: async () => { if (r.invalido) throw new SyntaxError('x'); return r.corpo; } };
  };
  return { fetchImpl, chamadas };
}
// `esperar` padrão dos testes nunca dispara (o prazo de 4 s só é exercitado nos testes que o injetam).
const novoWorker = (sim, extras = {}) => criarWorker({ fetchImpl: sim.fetchImpl, logger: mudo, esperar: () => new Promise(() => {}), ...extras });
const pedir = (worker, caminho, { metodo = 'GET', origem = ORIGEM, env = ENV } = {}) => {
  const headers = origem === null ? {} : { Origin: origem };
  return worker.fetch(new Request(`https://filmelier-provedores.exemplo.workers.dev${caminho}`, { method: metodo, headers }), env);
};

// ---- P-21: rota, método e ordem das validações ----
for (const metodo of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
  test(`AC-9: ${metodo} /providers dá 405 com Allow: GET e 0 chamadas ao TMDB`, async () => {
    const sim = tmdb();
    const r = await pedir(novoWorker(sim), '/providers?qids=Q1', { metodo });
    assert.equal(r.status, 405);
    assert.equal(r.headers.get('Allow'), 'GET');
    assert.equal(r.headers.get('Content-Type'), 'application/json');
    assert.deepEqual(await r.json(), { erro: 'metodo' });
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), null);
    assert.equal(sim.chamadas.length, 0);
  });
}

for (const caminho of ['/', '/outra', '/providers/', '/Providers']) {
  test(`AC-9: GET ${caminho} com origem permitida dá 404 e 0 chamadas`, async () => {
    const sim = tmdb();
    const r = await pedir(novoWorker(sim), caminho);
    assert.equal(r.status, 404);
    assert.deepEqual(await r.json(), { erro: 'rota' });
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), null);
    assert.equal(sim.chamadas.length, 0);
  });
}

// ---- P-22: CORS por ORIGENS_PERMITIDAS e validação dos parâmetros ----
for (const origem of [ORIGEM, 'http://192.168.18.227:8765']) {
  test(`AC-9: origem permitida ${origem} recebe ACAO igual, Vary: Origin e Expose-Headers com Retry-After`, async () => {
    const r = await pedir(novoWorker(tmdb()), '/providers?qids=Q1', { origem });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), origem);
    assert.equal(r.headers.get('Vary'), 'Origin');
    assert.match(r.headers.get('Access-Control-Expose-Headers'), /Retry-After/);
    assert.equal(r.headers.get('Content-Type'), 'application/json');
  });
}

for (const [nome, origem] of [['evil.example', 'https://evil.example'], ['null', 'null'], ['sem Origin', null], ['porta diferente', 'http://127.0.0.1:9999']]) {
  test(`AC-9: origem recusada (${nome}) dá 403 sem ACAO e 0 chamadas ao TMDB`, async () => {
    const sim = tmdb();
    const r = await pedir(novoWorker(sim), '/providers?qids=Q1', { origem });
    assert.equal(r.status, 403);
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), null);
    assert.equal(sim.chamadas.length, 0);
  });
}

for (const [nome, env] of [['ausente', { TMDB_TOKEN: 'tok-teste-123' }], ['vazia', { ORIGENS_PERMITIDAS: '', TMDB_TOKEN: 'tok-teste-123' }], ['só vírgulas e espaços', { ORIGENS_PERMITIDAS: ' , ,', TMDB_TOKEN: 'tok-teste-123' }]]) {
  test(`AC-9: ORIGENS_PERMITIDAS ${nome} dá 403 para todos`, async () => {
    const sim = tmdb();
    const r = await pedir(novoWorker(sim), '/providers?qids=Q1', { env });
    assert.equal(r.status, 403);
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), null);
    assert.equal(sim.chamadas.length, 0);
  });
}

test('AC-9: nunca ACAO *, em nenhuma resposta', async () => {
  const w = novoWorker(tmdb());
  for (const [caminho, opcoes] of [['/providers?qids=Q1', {}], ['/providers?qids=Q1', { origem: 'https://evil.example' }], ['/x', {}], ['/providers?qids=', {}], ['/providers?qids=Q1', { metodo: 'POST' }]]) {
    assert.notEqual((await pedir(w, caminho, opcoes)).headers.get('Access-Control-Allow-Origin'), '*');
  }
});

test('AC-9: imdb vazio é tratado como ausente, com 200', async () => {
  const r = await pedir(novoWorker(tmdb()), '/providers?qids=Q1&imdb=');
  assert.equal(r.status, 200);
});

const parametrosInvalidos = {
  'qids ausente': '',
  'qids vazio': '?qids=',
  'qids com 6 itens': '?qids=Q1,Q2,Q3,Q4,Q5,Q6',
  'qids minúsculo': '?qids=q1',
  'qids Q1x': '?qids=Q1x',
  'qids Q1;DROP': '?qids=Q1;DROP',
  'qids repetido': '?qids=Q1,Q1',
  'imdb de QID fora de qids': '?qids=Q1&imdb=Q9:tt0120338',
  'imdb inválido': '?qids=Q1&imdb=Q1:abc',
};
for (const [nome, consulta] of Object.entries(parametrosInvalidos)) {
  test(`AC-9: parâmetro inválido (${nome}) dá 400 com corpo exato e 0 chamadas`, async () => {
    const sim = tmdb();
    const r = await pedir(novoWorker(sim), `/providers${consulta}`);
    assert.equal(r.status, 400);
    assert.equal(await r.text(), '{"erro":"parametros"}');
    assert.equal(r.headers.get('Content-Type'), 'application/json');
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGEM);
    assert.equal(r.headers.get('Vary'), 'Origin');
    assert.equal(sim.chamadas.length, 0);
  });
}

test('AC-9: imdb com mesmo QID duas vezes ou formato com 6 ou 9 dígitos dá 400', async () => {
  const w = novoWorker(tmdb());
  for (const imdb of ['Q1:tt0120338,Q1:tt0120339', 'Q1:tt012033', 'Q1:tt012033812', 'Q1tt0120338']) {
    assert.equal((await pedir(w, `/providers?qids=Q1&imdb=${imdb}`)).status, 400, imdb);
  }
  assert.equal((await pedir(w, '/providers?qids=Q1,Q2&imdb=Q1:tt0120338,Q2:tt01203381')).status, 200);
});

// ---- P-23: resolução do tmdb_id e filtro BR ----
const LINK_BR = 'https://www.themoviedb.org/movie/597-titanic/watch?locale=BR';
const NETFLIX = { logo_path: '/t2yyOv40HZeVlLjYsCsPHnWLk4W.jpg', provider_id: 8, provider_name: 'Netflix', display_priority: 1, display_priorities: { BR: 1 }, extra: 'x' };
const OK_BR = { results: { BR: { link: LINK_BR, flatrate: [NETFLIX], rent: [{ provider_id: 2, provider_name: 'Apple TV', logo_path: null }] }, US: { link: 'https://www.themoviedb.org/US', flatrate: [{ provider_id: 99, provider_name: 'SoNosEUA', logo_path: '/u.jpg', display_priority: 1 }] } } };

// Simulador de rotas: finds por wikidata_id e por imdb_id; provedores por id de filme.
function tmdbRotas({ wikidata = {}, imdb = {}, provedores = {}, falhaFind = [], titulos = {} } = {}) {
  return tmdb((u) => {
    const caminho = u.pathname;
    const fonte = u.searchParams.get('external_source');
    if (caminho.startsWith('/3/find/')) {
      const ref = caminho.slice('/3/find/'.length);
      if (falhaFind.includes(ref)) return { status: 500, corpo: {} };
      const id = (fonte === 'wikidata_id' ? wikidata : imdb)[ref];
      return { status: 200, corpo: { movie_results: id ? [{ id, ...(titulos[id] ?? {}) }] : [] } };
    }
    const m = /^\/3\/movie\/(\d+)\/watch\/providers$/.exec(caminho);
    if (m) return { status: 200, corpo: provedores[m[1]] ?? { results: {} } };
    return { status: 404, corpo: {} };
  });
}
const corpoDe = async (r) => (await r.json()).resultados;

test('AC-10: achado por wikidata_id faz 1 find e 1 chamada de provedores', async () => {
  const sim = tmdbRotas({ wikidata: { Q44578: 597 }, provedores: { 597: OK_BR } });
  const r = await pedir(novoWorker(sim), '/providers?qids=Q44578');
  assert.equal(r.status, 200);
  assert.deepEqual(sim.chamadas.map((c) => c.url), [
    'https://api.themoviedb.org/3/find/Q44578?external_source=wikidata_id&language=pt-BR',
    'https://api.themoviedb.org/3/movie/597/watch/providers',
  ]);
  const entrada = (await corpoDe(r)).Q44578;
  assert.equal(entrada.status, 'ok');
  assert.equal(entrada.link, LINK_BR);
  assert.deepEqual(Object.keys(entrada).sort(), ['ads', 'buy', 'flatrate', 'free', 'link', 'rent', 'status']);
});

test('AC-10: find usa language=pt-BR e a entrada ok traz titulo e tituloOriginal', async () => {
  const sim = tmdbRotas({ wikidata: { Q1: 597 }, provedores: { 597: OK_BR }, titulos: { 597: { title: 'Jogos Mortais', original_title: 'Saw' } } });
  const entrada = (await corpoDe(await pedir(novoWorker(sim), '/providers?qids=Q1'))).Q1;
  assert.equal(entrada.titulo, 'Jogos Mortais');
  assert.equal(entrada.tituloOriginal, 'Saw');
  assert.equal(sim.chamadas.length, 2);
  assert.ok(sim.chamadas[0].url.endsWith('&language=pt-BR'));
});

test('AC-10: sem-br também traz os títulos; fallback pelo IMDb também usa pt-BR', async () => {
  const sim = tmdbRotas({ imdb: { tt0120338: 597 }, titulos: { 597: { title: 'Titanic', original_title: 'Titanic' } } });
  const entrada = (await corpoDe(await pedir(novoWorker(sim), '/providers?qids=Q1&imdb=Q1:tt0120338'))).Q1;
  assert.deepEqual(entrada, { status: 'sem-br', titulo: 'Titanic', tituloOriginal: 'Titanic' });
  assert.ok(sim.chamadas[1].url.includes('external_source=imdb_id&language=pt-BR'));
});

test('AC-10: título ausente, vazio, não string ou com mais de 200 caracteres é omitido', async () => {
  const sim = tmdbRotas({ wikidata: { Q1: 1, Q2: 2, Q3: 3 }, titulos: {
    1: { title: '', original_title: 5 }, 2: { title: 'x'.repeat(201), original_title: 'y'.repeat(200) }, 3: {},
  } });
  const r = await corpoDe(await pedir(novoWorker(sim), '/providers?qids=Q1,Q2,Q3'));
  assert.deepEqual(r.Q1, { status: 'sem-br' });
  assert.deepEqual(r.Q2, { status: 'sem-br', tituloOriginal: 'y'.repeat(200) });
  assert.deepEqual(r.Q3, { status: 'sem-br' });
});

test('AC-11: o cache guarda os títulos (2ª requisição sem chamadas ao TMDB)', async () => {
  const sim = tmdbRotas({ wikidata: { Q1: 597 }, provedores: { 597: OK_BR }, titulos: { 597: { title: 'A', original_title: 'B' } } });
  const w = novoWorker(sim);
  await pedir(w, '/providers?qids=Q1');
  const n = sim.chamadas.length;
  const e = (await corpoDe(await pedir(w, '/providers?qids=Q1'))).Q1;
  assert.equal(sim.chamadas.length, n);
  assert.equal(e.titulo, 'A');
  assert.equal(e.tituloOriginal, 'B');
});

test('AC-10: fallback pelo IMDb faz 2 finds (o 2º com imdb_id) e 1 chamada de provedores', async () => {
  const sim = tmdbRotas({ imdb: { tt0120338: 597 }, provedores: { 597: OK_BR } });
  const r = await pedir(novoWorker(sim), '/providers?qids=Q44578&imdb=Q44578:tt0120338');
  assert.deepEqual(sim.chamadas.map((c) => c.url), [
    'https://api.themoviedb.org/3/find/Q44578?external_source=wikidata_id&language=pt-BR',
    'https://api.themoviedb.org/3/find/tt0120338?external_source=imdb_id&language=pt-BR',
    'https://api.themoviedb.org/3/movie/597/watch/providers',
  ]);
  assert.equal((await corpoDe(r)).Q44578.status, 'ok');
});

test('AC-10: sem resultado e sem IMDb faz 1 find, 0 de provedores e status sem-tmdb', async () => {
  const sim = tmdbRotas();
  const r = await pedir(novoWorker(sim), '/providers?qids=Q44578');
  assert.equal(sim.chamadas.length, 1);
  assert.deepEqual((await corpoDe(r)).Q44578, { status: 'sem-tmdb' });
});

test('AC-10: sem resultado nem no fallback dá sem-tmdb com 2 finds e 0 de provedores', async () => {
  const sim = tmdbRotas();
  const r = await pedir(novoWorker(sim), '/providers?qids=Q44578&imdb=Q44578:tt0120338');
  assert.equal(sim.chamadas.length, 2);
  assert.deepEqual((await corpoDe(r)).Q44578, { status: 'sem-tmdb' });
});

test('AC-10: só BR na saída, com exatamente 4 campos por provedor e display_priority nulo quando ausente', async () => {
  const sim = tmdbRotas({ wikidata: { Q1: 597 }, provedores: { 597: OK_BR } });
  const r = await pedir(novoWorker(sim), '/providers?qids=Q1');
  const texto = JSON.stringify(await corpoDe(r));
  assert.ok(!texto.includes('US') && !texto.includes('SoNosEUA') && !texto.includes('themoviedb.org/US'));
  const entrada = JSON.parse(texto).Q1;
  for (const p of [...entrada.flatrate, ...entrada.rent]) {
    assert.deepEqual(Object.keys(p).sort(), ['display_priority', 'logo_path', 'provider_id', 'provider_name']);
  }
  assert.equal(entrada.flatrate[0].display_priority, 1);
  assert.equal(entrada.rent[0].display_priority, null);
  assert.deepEqual([entrada.buy, entrada.ads, entrada.free], [[], [], []]);
});

test('AC-10: sem BR, BR só com link e BR sem listas com itens dão exatamente {"status":"sem-br"}', async () => {
  for (const corpo of [{ results: { US: { flatrate: [{ provider_id: 1, provider_name: 'X' }] } } }, { results: { BR: { link: LINK_BR } } }, { results: { BR: { link: LINK_BR, flatrate: [], rent: [] } } }, {}]) {
    const sim = tmdbRotas({ wikidata: { Q1: 597 }, provedores: { 597: corpo } });
    const r = await pedir(novoWorker(sim), '/providers?qids=Q1');
    assert.equal(JSON.stringify((await corpoDe(r)).Q1), '{"status":"sem-br"}');
  }
});

test('AC-10: lote de 5 com 500 no find de 1 dá 200 JSON, 5 chaves, 4 definitivas e 1 erro', async () => {
  const qids = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'];
  const sim = tmdbRotas({ wikidata: { Q1: 11, Q2: 12, Q3: 13, Q4: 14, Q5: 15 }, provedores: { 11: OK_BR, 12: OK_BR, 13: OK_BR, 14: OK_BR, 15: OK_BR }, falhaFind: ['Q3'] });
  const r = await pedir(novoWorker(sim), `/providers?qids=${qids.join(',')}`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('Content-Type'), /application\/json/);
  const resultados = await corpoDe(r);
  assert.deepEqual(Object.keys(resultados), qids);
  assert.deepEqual(resultados.Q3, { status: 'erro' });
  assert.deepEqual(qids.filter((q) => resultados[q].status === 'ok'), ['Q1', 'Q2', 'Q4', 'Q5']);
});

// ---- P-24: cache do isolate, erros sem vazamento e prazos ----
function relogio(inicio = 5_000_000) {
  let t = inicio;
  return { agora: () => t, avancar: (s) => { t += s * 1000; } };
}
const SIM_OK = () => tmdbRotas({ wikidata: { Q1: 597, Q2: 598 }, provedores: { 597: OK_BR, 598: OK_BR } });

test('AC-11: cache do isolate: 86.400 s depois 0 chamadas; 86.401 s depois chama', async () => {
  const r = relogio();
  const sim = SIM_OK();
  const w = novoWorker(sim, { agora: r.agora });
  await pedir(w, '/providers?qids=Q1');
  const depoisDaPrimeira = sim.chamadas.length;
  assert.equal(depoisDaPrimeira, 2);
  r.avancar(86400);
  const a = await pedir(w, '/providers?qids=Q1');
  assert.equal(sim.chamadas.length, depoisDaPrimeira);
  assert.equal((await corpoDe(a)).Q1.status, 'ok');
  r.avancar(1);
  await pedir(w, '/providers?qids=Q1');
  assert.ok(sim.chamadas.length > depoisDaPrimeira);
});

test('AC-11: sem-br e sem-tmdb também entram no cache; a chave inclui o IMDb informado', async () => {
  const sim = tmdbRotas({ wikidata: { Q1: 597 }, provedores: { 597: {} } });
  const w = novoWorker(sim);
  await pedir(w, '/providers?qids=Q1,Q2');
  const n = sim.chamadas.length;
  await pedir(w, '/providers?qids=Q1,Q2');
  assert.equal(sim.chamadas.length, n);
  await pedir(w, '/providers?qids=Q2&imdb=Q2:tt0120338');
  assert.ok(sim.chamadas.length > n, 'IMDb novo é outra chave');
});

test('AC-11: erro não entra no cache e o QID é consultado de novo', async () => {
  let falhar = true;
  const sim = tmdb((u) => {
    if (u.pathname.startsWith('/3/find/')) return falhar ? { status: 500, corpo: {} } : { status: 200, corpo: { movie_results: [{ id: 597 }] } };
    return { status: 200, corpo: OK_BR };
  });
  const w = novoWorker(sim);
  assert.deepEqual((await corpoDe(await pedir(w, '/providers?qids=Q1'))).Q1, { status: 'erro' });
  const n = sim.chamadas.length;
  falhar = false;
  const r = await pedir(w, '/providers?qids=Q1');
  assert.ok(sim.chamadas.length > n);
  assert.equal((await corpoDe(r)).Q1.status, 'ok');
});

const falhasTmdb = {
  'HTTP 401 com status_message': () => ({ status: 401, corpo: { status_code: 7, status_message: 'Invalid API key: You must be granted a valid key.' } }),
  'HTTP 500': () => ({ status: 500, corpo: {} }),
  'corpo x': () => ({ status: 200, invalido: true }),
  'rejeição com Error segredo-interno': () => { throw new Error('segredo-interno'); },
};
for (const [nome, responder] of Object.entries(falhasTmdb)) {
  test(`AC-11: ${nome} vira {"status":"erro"} sem vazar detalhes do TMDB`, async () => {
    const sim = tmdb(responder);
    const r = await pedir(novoWorker(sim), '/providers?qids=Q1');
    assert.equal(r.status, 200);
    const corpo = await r.text();
    assert.deepEqual(JSON.parse(corpo).resultados.Q1, { status: 'erro' });
    const cabecalhos = JSON.stringify([...r.headers.entries()]);
    for (const proibido of ['Invalid API key', 'status_message', 'status_code', 'api.themoviedb.org', 'segredo-interno']) {
      assert.ok(!corpo.includes(proibido) && !cabecalhos.includes(proibido), proibido);
    }
  });
}

test('AC-11: TMDB que nunca responde dá 200 em 4.000 ms simulados com todos erro e sinal de 3.000 ms por chamada', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const sinais = [];
  const sim = tmdb(() => new Promise(() => {}));
  const w = criarWorker({
    fetchImpl: sim.fetchImpl, logger: mudo, criarSinal: (ms) => { sinais.push(ms); return undefined; },
  });
  const promessa = pedir(w, '/providers?qids=Q1,Q2,Q3');
  await new Promise((resolver) => setImmediate(resolver));
  assert.equal(sim.chamadas.length, 3);
  t.mock.timers.tick(3999);
  let resolvida = false;
  promessa.then(() => { resolvida = true; });
  await new Promise((resolver) => setImmediate(resolver));
  assert.equal(resolvida, false, 'ainda dentro do prazo');
  t.mock.timers.tick(1);
  const r = await promessa;
  assert.equal(r.status, 200);
  const resultados = await corpoDe(r);
  assert.deepEqual(Object.values(resultados), [{ status: 'erro' }, { status: 'erro' }, { status: 'erro' }]);
  assert.deepEqual(sinais, [3000, 3000, 3000]);
});

test('AC-11: resultado que chega depois do prazo não entra no cache', async () => {
  const liberar = [];
  const sim = tmdb((u) => new Promise((resolver) => liberar.push(() => resolver(u.pathname.startsWith('/3/find/') ? { status: 200, corpo: { movie_results: [{ id: 597 }] } } : { status: 200, corpo: OK_BR }))));
  let disparar;
  const prazo = new Promise((resolver) => { disparar = resolver; });
  const w = criarWorker({ fetchImpl: sim.fetchImpl, logger: mudo, esperar: () => prazo });
  const promessa = pedir(w, '/providers?qids=Q1');
  await new Promise((resolver) => setImmediate(resolver));
  disparar();
  assert.deepEqual((await corpoDe(await promessa)).Q1, { status: 'erro' });
  liberar.forEach((f) => f());
  await new Promise((resolver) => setImmediate(resolver));
  await new Promise((resolver) => setImmediate(resolver));
  const n = sim.chamadas.length;
  const segundo = pedir(w, '/providers?qids=Q1');
  await new Promise((resolver) => setImmediate(resolver));
  assert.ok(sim.chamadas.length > n, 'não veio do cache');
  disparar();
  await segundo;
});

test('AC-11: os finds dos 5 QIDs são disparados antes da 1ª resposta do TMDB', async () => {
  const liberar = [];
  const sim = tmdb(() => new Promise((resolver) => liberar.push(() => resolver({ status: 200, corpo: { movie_results: [] } }))));
  const promessa = pedir(novoWorker(sim), '/providers?qids=Q1,Q2,Q3,Q4,Q5');
  await new Promise((resolver) => setImmediate(resolver));
  assert.equal(sim.chamadas.length, 5);
  assert.ok(sim.chamadas.every((c) => c.url.includes('/3/find/Q')));
  liberar.forEach((f) => f());
  const r = await promessa;
  assert.equal(r.status, 200);
});

// ---- P-25: respeito ao 429 do TMDB ----
const tick = () => new Promise((resolver) => setImmediate(resolver));
const find429 = (headers) => ({ status: 429, corpo: { status_code: 25, status_message: 'limite' }, headers });
const findOk = { status: 200, corpo: { movie_results: [{ id: 597 }] } };

test('AC-12: 429 no 1º find de 3 QIDs: 3 chamadas (todas finds), 0 depois do 429, 3 limite e retryAfter 24', async () => {
  const pendentes = [];
  const sim = tmdb((u) => new Promise((resolver) => pendentes.push({ u, resolver })));
  const promessa = pedir(novoWorker(sim), '/providers?qids=Q1,Q2,Q3');
  await tick();
  assert.equal(pendentes.length, 3);
  pendentes[0].resolver(find429({ 'Retry-After': '24' }));
  await tick();
  pendentes[1].resolver(findOk);
  pendentes[2].resolver(findOk);
  const r = await promessa;
  assert.equal(sim.chamadas.length, 3);
  assert.ok(sim.chamadas.every((c) => c.url.includes('/3/find/')));
  const corpo = await r.json();
  assert.deepEqual(Object.values(corpo.resultados), [{ status: 'limite' }, { status: 'limite' }, { status: 'limite' }]);
  assert.equal(corpo.retryAfter, 24);
});

test('AC-12: 10 s depois do 429 0 chamadas (cache servido, demais limite); 25 s depois volta a chamar', async () => {
  const relogioW = relogio();
  let limitar = false;
  const sim = tmdb((u) => {
    if (u.pathname.startsWith('/3/find/')) return limitar ? find429({ 'Retry-After': '24' }) : { status: 200, corpo: { movie_results: [{ id: 597 }] } };
    return { status: 200, corpo: OK_BR };
  });
  const w = novoWorker(sim, { agora: relogioW.agora });
  await pedir(w, '/providers?qids=Q1');
  limitar = true;
  const primeira = await (await pedir(w, '/providers?qids=Q2')).json();
  assert.deepEqual(primeira.resultados.Q2, { status: 'limite' });
  assert.equal(primeira.retryAfter, 24);
  const n = sim.chamadas.length;
  relogioW.avancar(10);
  const meio = await (await pedir(w, '/providers?qids=Q1,Q3')).json();
  assert.equal(sim.chamadas.length, n, '0 chamadas durante a suspensão');
  assert.equal(meio.resultados.Q1.status, 'ok');
  assert.deepEqual(meio.resultados.Q3, { status: 'limite' });
  assert.equal(meio.retryAfter, 14);
  relogioW.avancar(15);
  limitar = false;
  const depois = await (await pedir(w, '/providers?qids=Q3')).json();
  assert.ok(sim.chamadas.length > n, 'volta a chamar o TMDB');
  assert.equal(depois.resultados.Q3.status, 'ok');
  assert.equal(depois.retryAfter, undefined);
});

for (const [nome, headers, esperado] of [['sem Retry-After', {}, 30], ['Retry-After abc', { 'Retry-After': 'abc' }, 30], ['Retry-After 999999999', { 'Retry-After': '999999999' }, 300], ['Retry-After 0', { 'Retry-After': '0' }, 30]]) {
  test(`AC-12: 429 ${nome} dá retryAfter ${esperado} no corpo`, async () => {
    const sim = tmdb(() => find429(headers));
    const corpo = await (await pedir(novoWorker(sim), '/providers?qids=Q1')).json();
    assert.equal(corpo.retryAfter, esperado);
    assert.deepEqual(corpo.resultados.Q1, { status: 'limite' });
  });
}

test('AC-12: limite não entra no cache e resposta sem suspensão não traz retryAfter', async () => {
  const sim = SIM_OK();
  const corpo = await (await pedir(novoWorker(sim), '/providers?qids=Q1')).json();
  assert.ok(!('retryAfter' in corpo));
});

// ---- P-26: token e log ----
const TOKEN = 'tok-teste-123';
const logadora = () => {
  const linhas = [];
  return { linhas, log: (...a) => linhas.push(a), warn: (...a) => linhas.push(a), error: (...a) => linhas.push(a) };
};
const comLog = (sim, extras = {}) => {
  const l = logadora();
  return { l, w: criarWorker({ fetchImpl: sim.fetchImpl, logger: l, esperar: () => new Promise(() => {}), ...extras }) };
};

test('AC-13: toda chamada ao TMDB leva o token no cabeçalho de autorização e nada na URL; resposta e log sem o token', async () => {
  const sim = tmdbRotas({ wikidata: { Q1: 597, Q2: 598 }, provedores: { 597: OK_BR, 598: OK_BR } });
  const { l, w } = comLog(sim);
  const r = await pedir(w, '/providers?qids=Q1,Q2');
  assert.ok(sim.chamadas.length >= 4);
  for (const c of sim.chamadas) {
    assert.equal(c.opcoes.headers[CAB_AUTH], `${ESQUEMA} ${TOKEN}`);
    assert.ok(!c.url.includes(TOKEN) && !c.url.includes('api' + '_key'));
  }
  const corpo = await r.text();
  assert.ok(!corpo.includes(TOKEN));
  assert.ok(!JSON.stringify([...r.headers.entries()]).includes(TOKEN));
  assert.ok(!JSON.stringify(l.linhas).includes(TOKEN));
});

test('AC-13: sem TMDB_TOKEN dá 200 com todos os QIDs em erro e 0 chamadas ao TMDB', async () => {
  const sim = tmdbRotas({ wikidata: { Q1: 597 }, provedores: { 597: OK_BR } });
  const r = await pedir(novoWorker(sim), '/providers?qids=Q1,Q2', { env: { ORIGENS_PERMITIDAS: ORIGEM } });
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).resultados, { Q1: { status: 'erro' }, Q2: { status: 'erro' } });
  assert.equal(sim.chamadas.length, 0);
});

test('AC-14: 5 QIDs com IMDb e fallback em todos fazem no máximo 15 chamadas ao TMDB', async () => {
  const qids = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'];
  const imdbs = ['tt0000001', 'tt0000002', 'tt0000003', 'tt0000004', 'tt0000005'];
  const sim = tmdbRotas({ imdb: Object.fromEntries(imdbs.map((t, i) => [t, 600 + i])), provedores: Object.fromEntries(imdbs.map((t, i) => [600 + i, OK_BR])) });
  const pares = qids.map((q, i) => `${q}:${imdbs[i]}`).join(',');
  const r = await pedir(novoWorker(sim), `/providers?qids=${qids.join(',')}&imdb=${pares}`);
  assert.equal(sim.chamadas.length, 15);
  assert.ok(Object.values((await r.json()).resultados).every((e) => e.status === 'ok'));
});

test('AC-14: 1 linha JSON por requisição com as 6 chaves, sem token, IP, Origin nem corpo do TMDB', async () => {
  const sim = tmdb((u) => (u.pathname.startsWith('/3/find/') ? { status: 200, corpo: { movie_results: [{ id: 597 }], status_message: 'corpo-do-tmdb' } } : { status: 200, corpo: OK_BR }));
  const { l, w } = comLog(sim);
  const req = new Request('https://filmelier-provedores.exemplo.workers.dev/providers?qids=Q1', { headers: { Origin: ORIGEM, 'cf-connecting-ip': '203.0.113.7', Cookie: 'sessao=abc' } });
  await w.fetch(req, ENV);
  assert.equal(l.linhas.length, 1);
  assert.equal(l.linhas[0].length, 1);
  const linha = JSON.parse(l.linhas[0][0]);
  assert.deepEqual(Object.keys(linha).sort(), ['acertosCache', 'chamadasTmdb', 'duracaoMs', 'http', 'qids', 'status']);
  assert.equal(linha.http, 200);
  assert.deepEqual(linha.qids, ['Q1']);
  assert.deepEqual(linha.status, { Q1: 'ok' });
  assert.equal(linha.acertosCache, 0);
  assert.equal(linha.chamadasTmdb, 2);
  assert.equal(typeof linha.duracaoMs, 'number');
  for (const proibido of [TOKEN, '203.0.113.7', ORIGEM, 'status_message', 'corpo-do-tmdb', 'sessao=abc']) assert.ok(!l.linhas[0][0].includes(proibido), proibido);
});

test('AC-14: a linha de log também sai nas recusas (405, 404, 403, 400) com qids vazio, e traz acertosCache no cache', async () => {
  const sim = SIM_OK();
  const { l, w } = comLog(sim);
  await pedir(w, '/providers?qids=Q1', { metodo: 'POST' });
  await pedir(w, '/x');
  await pedir(w, '/providers?qids=Q1', { origem: 'https://evil.example' });
  await pedir(w, '/providers?qids=q1');
  assert.equal(l.linhas.length, 4);
  assert.deepEqual(l.linhas.map((x) => JSON.parse(x[0]).http), [405, 404, 403, 400]);
  assert.ok(l.linhas.every((x) => JSON.parse(x[0]).qids.length === 0));
  assert.ok(l.linhas.every((x) => !x[0].includes('evil.example')));
  await pedir(w, '/providers?qids=Q1');
  await pedir(w, '/providers?qids=Q1');
  assert.equal(JSON.parse(l.linhas.at(-1)[0]).acertosCache, 1);
  assert.equal(JSON.parse(l.linhas.at(-1)[0]).chamadasTmdb, 0);
});

test('AC-14: cookies e IPs diferentes dão resposta idêntica (status, cabeçalhos e corpo)', async () => {
  const instantaneo = [];
  for (const [ip, cookie] of [['203.0.113.7', 'a=1'], ['198.51.100.9', 'b=2']]) {
    const sim = SIM_OK();
    const w = novoWorker(sim, { agora: relogio().agora });
    const r = await w.fetch(new Request('https://filmelier-provedores.exemplo.workers.dev/providers?qids=Q1,Q2', { headers: { Origin: ORIGEM, 'cf-connecting-ip': ip, Cookie: cookie } }), ENV);
    instantaneo.push(JSON.stringify([r.status, [...r.headers.entries()], await r.text()]));
  }
  assert.equal(instantaneo[0], instantaneo[1]);
});

test('AC-9: ordem das validações: 405, 404 e 403 com origem alheia, todas com 0 chamadas ao TMDB', async () => {
  const sim = tmdb();
  const w = novoWorker(sim);
  const alheia = 'https://evil.example';
  const a = await pedir(w, '/outra', { metodo: 'POST', origem: alheia });
  const b = await pedir(w, '/outra', { origem: alheia });
  const c = await pedir(w, '/providers?qids=q1', { origem: alheia });
  assert.deepEqual([a.status, b.status, c.status], [405, 404, 403]);
  assert.deepEqual(await c.json(), { erro: 'origem' });
  assert.equal(c.headers.get('Content-Type'), 'application/json');
  assert.equal(sim.chamadas.length, 0);
});

// ---- R-2 e R-4 do review (FILMELIER-3) ----
test('R-2: cache do isolate com teto de entradas descarta a mais antiga pela ordem de inserção', async () => {
  const cache = new Map();
  const sim = tmdbRotas({ wikidata: { Q1: 1, Q2: 2, Q3: 3, Q4: 4 }, provedores: { 1: OK_BR, 2: OK_BR, 3: OK_BR, 4: OK_BR } });
  const w = novoWorker(sim, { cache, limiteCache: 3 });
  await pedir(w, '/providers?qids=Q1,Q2,Q3');
  assert.deepEqual([...cache.keys()].sort(), ['Q1|', 'Q2|', 'Q3|']);
  await pedir(w, '/providers?qids=Q4');
  assert.equal(cache.size, 3);
  assert.ok(!cache.has('Q1|'), 'a mais antiga saiu');
  assert.ok(cache.has('Q4|'));
});

test('R-2: o teto padrão do cache é 2000 entradas', async () => {
  const cache = new Map();
  for (let i = 0; i < 2000; i += 1) cache.set(`Q${i + 10}|`, { entrada: { status: 'sem-tmdb' }, gravadoEm: 5_000_000 });
  const sim = tmdbRotas({ wikidata: { Q1: 1 }, provedores: { 1: OK_BR } });
  await pedir(novoWorker(sim, { cache, agora: () => 5_000_000 }), '/providers?qids=Q1');
  assert.equal(cache.size, 2000);
  assert.ok(cache.has('Q1|'));
  assert.ok(!cache.has('Q10|'));
});

test('R-4: exceção não tratada vira 500 JSON genérico com CORS para origem permitida', async () => {
  const env = { ORIGENS_PERMITIDAS: ORIGEM, get TMDB_TOKEN() { throw new Error('segredo-interno'); } };
  const r = await pedir(novoWorker(tmdb()), '/providers?qids=Q1', { env });
  assert.equal(r.status, 500);
  assert.equal(r.headers.get('Content-Type'), 'application/json');
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGEM);
  assert.equal(r.headers.get('Vary'), 'Origin');
  const corpo = await r.text();
  assert.deepEqual(JSON.parse(corpo), { erro: 'interno' });
  assert.ok(!corpo.includes('segredo-interno'));
});

test('R-4: exceção com a própria leitura das origens quebrada dá 500 sem Access-Control-Allow-Origin e a linha de log sai', async () => {
  const linhas = [];
  const env = { get ORIGENS_PERMITIDAS() { throw new Error('x'); } };
  const w = criarWorker({ fetchImpl: tmdb().fetchImpl, logger: { log: (l) => linhas.push(l) }, esperar: () => new Promise(() => {}) });
  const r = await pedir(w, '/providers?qids=Q1', { env });
  assert.equal(r.status, 500);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), null);
  assert.deepEqual(await r.json(), { erro: 'interno' });
  assert.equal(JSON.parse(linhas[0]).http, 500);
});
