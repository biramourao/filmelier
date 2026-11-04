import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarUrlWorker, avaliarUrlWorker, montarUrlLote, criarProvedores, montarSecao, SEM_ENTRADA } from '../src/provedores.mjs';
import { montarCard } from '../src/card.mjs';
import { URL_WORKER } from '../src/config.mjs';

const logger = () => {
  const avisos = [];
  const erros = [];
  return { avisos, erros, warn: (...a) => avisos.push(a), error: (...a) => erros.push(a) };
};

// P-32: até a publicação o recurso saía desligado (URL vazia); publicado, a URL precisa ser a origem https
// válida do Worker (a CSP é conferida contra ela em estatico.test.mjs, via cspEsperada).
test('AC-1: src/config.mjs entrega o recurso desligado (URL vazia) ou com a origem válida do Worker publicado', () => {
  assert.ok(URL_WORKER === '' || validarUrlWorker(URL_WORKER), URL_WORKER);
});

test('AC-1: validarUrlWorker aceita só https igual à própria origem', () => {
  assert.equal(validarUrlWorker('https://filmelier-provedores.exemplo.workers.dev'), true);
  for (const ruim of ['', 'http://x', 'https://x/caminho', 'https://x/', 'abc', 'https://x?a=1', 'https://x#f', 'https://u:p@x', 'https://x:8443/a', undefined, null, 5]) {
    assert.equal(validarUrlWorker(ruim), false, String(ruim));
  }
  assert.equal(validarUrlWorker('https://x:8443'), true);
});

test('AC-1: URL vazia desliga sem warn nem error', () => {
  const l = logger();
  assert.equal(avaliarUrlWorker('', l), false);
  assert.equal(l.avisos.length, 0);
  assert.equal(l.erros.length, 0);
});

for (const invalida of ['http://x', 'https://x/caminho', 'abc']) {
  test(`AC-1: URL inválida ${invalida} desliga com exatamente 1 warn [filmelier]`, () => {
    const l = logger();
    assert.equal(avaliarUrlWorker(invalida, l), false);
    assert.equal(l.avisos.length, 1);
    assert.match(String(l.avisos[0][0]), /^\[filmelier\]/);
    assert.equal(l.erros.length, 0);
  });
}

test('AC-1: URL válida liga sem warn', () => {
  const l = logger();
  assert.equal(avaliarUrlWorker('https://filmelier-provedores.exemplo.workers.dev', l), true);
  assert.equal(l.avisos.length, 0);
});

// ---- P-2: URL do lote ----
const WORKER = 'https://filmelier-provedores.exemplo.workers.dev';
const f = (qid, imdb = null) => ({ qid, imdb });
const CINCO = [f('Q44578', 'tt0120338'), f('Q47703', 'tt0068646'), f('Q24871', 'tt0499549'), f('Q83495', null), f('Q128518', 'tt0172495')];

test('AC-2: montarUrlLote com 5 filmes, 1 sem imdb', () => {
  const url = new URL(montarUrlLote(WORKER, CINCO));
  assert.equal(url.origin, WORKER);
  assert.equal(url.pathname, '/providers');
  assert.deepEqual(url.searchParams.get('qids').split(','), ['Q44578', 'Q47703', 'Q24871', 'Q83495', 'Q128518']);
  assert.deepEqual(url.searchParams.get('imdb').split(','), ['Q44578:tt0120338', 'Q47703:tt0068646', 'Q24871:tt0499549', 'Q128518:tt0172495']);
  assert.deepEqual([...url.searchParams.keys()].sort(), ['imdb', 'qids']);
});

test('AC-2: montarUrlLote omite imdb sem pares válidos e ignora imdb fora de ^tt\\d{7,8}$', () => {
  const url = new URL(montarUrlLote(WORKER, [f('Q1', null), f('Q2', 'tt12'), f('Q3', 'xx0120338'), f('Q4', 'tt012033812')]));
  assert.equal(url.searchParams.has('imdb'), false);
  assert.equal(url.searchParams.get('qids'), 'Q1,Q2,Q3,Q4');
  const com8 = new URL(montarUrlLote(WORKER, [f('Q1', 'tt01203381')]));
  assert.equal(com8.searchParams.get('imdb'), 'Q1:tt01203381');
});

// ---- P-3: criarProvedores, cache da aba e chamadas em voo ----
const resp = (corpo, { status = 200, headers = {} } = {}) => ({
  ok: status >= 200 && status < 300, status, headers: { get: (n) => headers[n] ?? null }, json: async () => corpo,
});
const prov = (id, nome, prioridade = id, logo = `/logo${id}.png`) => ({ provider_id: id, provider_name: nome, logo_path: logo, display_priority: prioridade });
const entradaOk = (extra = {}) => ({
  status: 'ok', link: 'https://www.themoviedb.org/movie/597-titanic/watch?locale=BR',
  flatrate: [prov(8, 'Netflix')], rent: [], buy: [], ads: [], free: [], ...extra,
});
const qidsDeUrl = (url) => new URL(url).searchParams.get('qids').split(',');
const respostaLote = (url, entrada = entradaOk) => resp({ resultados: Object.fromEntries(qidsDeUrl(url).map((q) => [q, entrada(q)])) });
const espiao = (responder = (url) => respostaLote(url)) => {
  const chamadas = [];
  const fetchImpl = async (url, opcoes) => {
    chamadas.push({ url, opcoes });
    return responder(url, opcoes);
  };
  return { fetchImpl, chamadas };
};
const mudo = { warn() {}, error() {} };
const filmesQ = (...qids) => qids.map((q) => f(q, 'tt0120338'));
const novoProvedores = (fetchImpl, extra = {}) => criarProvedores({ urlWorker: WORKER, fetchImpl, logger: mudo, ...extra });

test('AC-2: criarProvedores com URL vazia fica inativo e não chama', async () => {
  const { fetchImpl, chamadas } = espiao();
  const p = criarProvedores({ urlWorker: '', fetchImpl, logger: mudo });
  assert.equal(p.ativo, false);
  const mapa = await p.buscar(CINCO);
  assert.equal(chamadas.length, 0);
  assert.equal(mapa.size, 5);
  assert.ok([...mapa.values()].every((v) => v === null));
});

test('AC-2: repetição com os 5 em cache faz 0 chamadas e devolve a entrada do cache', async () => {
  const { fetchImpl, chamadas } = espiao();
  const p = novoProvedores(fetchImpl);
  await p.buscar(CINCO);
  assert.equal(chamadas.length, 1);
  const mapa = await p.buscar(CINCO);
  assert.equal(chamadas.length, 1);
  assert.equal(mapa.size, 5);
  for (const e of mapa.values()) assert.equal(e.status, 'ok');
});

test('AC-2: 3 em cache e 2 novos fazem 1 chamada só com os 2', async () => {
  const { fetchImpl, chamadas } = espiao();
  const p = novoProvedores(fetchImpl);
  await p.buscar(filmesQ('Q1', 'Q2', 'Q3'));
  await p.buscar(filmesQ('Q1', 'Q2', 'Q3', 'Q4', 'Q5'));
  assert.equal(chamadas.length, 2);
  assert.deepEqual(qidsDeUrl(chamadas[1].url), ['Q4', 'Q5']);
});

test('AC-2: ok em Q1 e erro em Q2 levam a 1 chamada só com Q2 na recomendação seguinte', async () => {
  const { fetchImpl, chamadas } = espiao((url) => respostaLote(url, (q) => (q === 'Q2' ? { status: 'erro' } : entradaOk())));
  const p = novoProvedores(fetchImpl);
  const primeira = await p.buscar(filmesQ('Q1', 'Q2'));
  assert.equal(primeira.get('Q1').status, 'ok');
  assert.equal(primeira.get('Q2'), null);
  await p.buscar(filmesQ('Q1', 'Q2'));
  assert.equal(chamadas.length, 2);
  assert.deepEqual(qidsDeUrl(chamadas[1].url), ['Q2']);
});

test('AC-2: sem-br e sem-tmdb entram no cache; limite não', async () => {
  const corpo = { Q1: { status: 'sem-br' }, Q2: { status: 'sem-tmdb' }, Q3: { status: 'limite' } };
  const { fetchImpl, chamadas } = espiao((url) => respostaLote(url, (q) => corpo[q]));
  const p = novoProvedores(fetchImpl);
  const mapa = await p.buscar(filmesQ('Q1', 'Q2', 'Q3'));
  assert.deepEqual(mapa.get('Q1'), { status: 'sem-br' });
  assert.deepEqual(mapa.get('Q2'), { status: 'sem-tmdb' });
  assert.equal(mapa.get('Q3'), null);
  await p.buscar(filmesQ('Q1', 'Q2', 'Q3'));
  assert.deepEqual(qidsDeUrl(chamadas[1].url), ['Q3']);
});

test('AC-2: timeout e rejeição não entram no cache e voltam na recomendação seguinte', async () => {
  for (const nomeErro of ['TimeoutError', 'Error']) {
    let n = 0;
    const chamadas = [];
    const fetchImpl = async (url) => {
      chamadas.push(url);
      n += 1;
      if (n === 1) throw Object.assign(new Error('x'), { name: nomeErro });
      return respostaLote(url);
    };
    const p = novoProvedores(fetchImpl);
    const primeira = await p.buscar(filmesQ('Q1', 'Q2'));
    assert.ok([...primeira.values()].every((v) => v === null));
    const segunda = await p.buscar(filmesQ('Q1', 'Q2'));
    assert.equal(chamadas.length, 2);
    assert.deepEqual(qidsDeUrl(chamadas[1]), ['Q1', 'Q2']);
    assert.equal(segunda.get('Q1').status, 'ok');
  }
});

test('AC-2: 2 recomendações antes da 1ª resposta não repetem QID entre chamadas', async () => {
  const pendentes = [];
  const chamadas = [];
  const fetchImpl = (url) => new Promise((resolve) => {
    chamadas.push(url);
    pendentes.push(() => resolve(respostaLote(url)));
  });
  const p = novoProvedores(fetchImpl);
  const a = p.buscar(filmesQ('Q1', 'Q2'));
  const b = p.buscar(filmesQ('Q2', 'Q3'));
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(chamadas.map(qidsDeUrl), [['Q1', 'Q2'], ['Q3']]);
  pendentes.forEach((liberar) => liberar());
  const [ma, mb] = await Promise.all([a, b]);
  assert.equal(ma.get('Q2').status, 'ok');
  assert.equal(mb.get('Q2').status, 'ok');
  assert.equal(mb.get('Q3').status, 'ok');
  const todos = chamadas.flatMap(qidsDeUrl);
  assert.equal(new Set(todos).size, todos.length);
});

test('AC-14: 10 recomendações de 5 filmes distintos fazem 1 chamada cada, 10 no total', async () => {
  const { fetchImpl, chamadas } = espiao();
  const p = novoProvedores(fetchImpl);
  for (let i = 0; i < 10; i += 1) await p.buscar(filmesQ(...[1, 2, 3, 4, 5].map((k) => `Q${i * 10 + k}`)));
  assert.equal(chamadas.length, 10);
});

// ---- P-4: opções da chamada ----
test('AC-3: GET sem headers nem corpo, credentials omit, referrerPolicy no-referrer; URL só com QIDs da recomendação', async () => {
  const { fetchImpl, chamadas } = espiao();
  const p = novoProvedores(fetchImpl);
  // Humor "medo" e gênero Q130232 escolhidos fora do módulo: só os filmes exibidos entram na API.
  const exibidos = filmesQ('Q44578', 'Q47703');
  await p.buscar(exibidos);
  assert.equal(chamadas.length, 1);
  const { url, opcoes } = chamadas[0];
  assert.ok(opcoes.method === undefined || opcoes.method === 'GET');
  assert.equal(opcoes.headers, undefined);
  assert.equal(opcoes.body, undefined);
  assert.equal(opcoes.credentials, 'omit');
  assert.equal(opcoes.referrerPolicy, 'no-referrer');
  assert.ok(!/medo/.test(url) && !url.includes('Q130232'));
  const exibidosQids = exibidos.map((x) => x.qid);
  assert.ok(qidsDeUrl(url).every((q) => exibidosQids.includes(q)));
  assert.equal(new URL(url).host, 'filmelier-provedores.exemplo.workers.dev');
});

test('AC-3: sem recomendação nenhuma chamada ao Worker é feita pela criação', () => {
  const { fetchImpl, chamadas } = espiao();
  const p = novoProvedores(fetchImpl);
  assert.equal(p.ativo, true);
  assert.equal(chamadas.length, 0);
});

// ---- P-5: timeout e degradação ----
function loggerEspiao() {
  const avisos = [];
  return { avisos, warn: (...a) => avisos.push(a), error: (...a) => avisos.push(['error', ...a]) };
}

test('AC-4: lote que só termina no abort, com timeout de 50 ms, resolve em até 1 s com todos sem dados e 1 warn timeout', { timeout: 3000 }, async () => {
  const fetchImpl = (url, { signal }) => new Promise((_, rejeitar) => {
    signal.addEventListener('abort', () => rejeitar(signal.reason));
  });
  const l = loggerEspiao();
  const p = criarProvedores({ urlWorker: WORKER, fetchImpl, logger: l, timeoutMs: 50 });
  const inicio = Date.now();
  const mapa = await p.buscar(CINCO);
  assert.ok(Date.now() - inicio < 1000);
  assert.equal(mapa.size, 5);
  assert.ok([...mapa.values()].every((v) => v === null));
  assert.equal(l.avisos.length, 1);
  assert.match(String(l.avisos[0][0]), /^\[filmelier\]/);
  assert.equal(l.avisos[0][1].fonte, 'provedores');
  assert.equal(l.avisos[0][1].motivo, 'timeout');
  assert.deepEqual(l.avisos[0][1].qids, CINCO.map((x) => x.qid));
});

test('AC-4: timeout padrão de 5000 ms na fábrica de sinal', async () => {
  const pedidos = [];
  const { fetchImpl } = espiao();
  const p = novoProvedores(fetchImpl, { criarSinal: (ms) => { pedidos.push(ms); return undefined; } });
  await p.buscar(filmesQ('Q1'));
  assert.deepEqual(pedidos, [5000]);
});

const falhasDoLote = {
  rejeição: () => { throw new Error('rede'); },
  'HTTP 500': () => resp({}, { status: 500 }),
  'corpo x': () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => { throw new SyntaxError('x'); } }),
  'objeto vazio': () => resp({}),
};
for (const [nome, responder] of Object.entries(falhasDoLote)) {
  test(`AC-4: falha do lote inteiro (${nome}) não lança e deixa todos sem dados`, async () => {
    const { fetchImpl } = espiao(responder);
    const mapa = await novoProvedores(fetchImpl).buscar(filmesQ('Q1', 'Q2', 'Q3'));
    assert.equal(mapa.size, 3);
    assert.ok([...mapa.values()].every((v) => v === null));
  });
}

test('AC-4: QID ausente da resposta deixa só ele sem dados', async () => {
  const { fetchImpl } = espiao((url) => resp({ resultados: Object.fromEntries(qidsDeUrl(url).filter((q) => q !== 'Q3').map((q) => [q, entradaOk()])) }));
  const mapa = await novoProvedores(fetchImpl).buscar(filmesQ('Q1', 'Q2', 'Q3', 'Q4', 'Q5'));
  assert.equal(mapa.get('Q3'), null);
  for (const q of ['Q1', 'Q2', 'Q4', 'Q5']) assert.equal(mapa.get(q).status, 'ok');
});

test('AC-4: categoria que não é array deixa só o filme afetado sem dados', async () => {
  const { fetchImpl } = espiao((url) => respostaLote(url, (q) => (q === 'Q2' ? entradaOk({ rent: 'x' }) : entradaOk())));
  const mapa = await novoProvedores(fetchImpl).buscar(filmesQ('Q1', 'Q2', 'Q3'));
  assert.equal(mapa.get('Q2'), null);
  assert.equal(mapa.get('Q1').status, 'ok');
  assert.equal(mapa.get('Q3').status, 'ok');
});

test('AC-4: status desconhecido e entrada que não é objeto deixam só o filme afetado sem dados', async () => {
  const corpo = { Q1: { status: 'talvez' }, Q2: 'x', Q3: null, Q4: entradaOk() };
  const { fetchImpl } = espiao((url) => respostaLote(url, (q) => corpo[q]));
  const mapa = await novoProvedores(fetchImpl).buscar(filmesQ('Q1', 'Q2', 'Q3', 'Q4'));
  assert.deepEqual([mapa.get('Q1'), mapa.get('Q2'), mapa.get('Q3')], [null, null, null]);
  assert.equal(mapa.get('Q4').status, 'ok');
});

test('AC-4: provedor sem provider_name é descartado sozinho; sem provider_id inteiro também', async () => {
  const corpo = {
    Q1: entradaOk({ flatrate: [{ provider_id: 9, logo_path: '/a.png', display_priority: 1 }, prov(8, 'Netflix'), prov('x', 'Sem id'), { provider_id: 7, provider_name: '', logo_path: null }, 'lixo', null] }),
    Q2: entradaOk({ flatrate: [{ provider_id: 9, logo_path: '/a.png', display_priority: 1 }] }),
  };
  const { fetchImpl } = espiao((url) => respostaLote(url, (q) => corpo[q]));
  const mapa = await novoProvedores(fetchImpl).buscar(filmesQ('Q1', 'Q2'));
  assert.deepEqual(mapa.get('Q1').flatrate.map((x) => x.provider_name), ['Netflix']);
  assert.deepEqual(mapa.get('Q2').flatrate, []);
});

test('AC-4: provedor normalizado tem exatamente os 4 campos', async () => {
  const corpo = { Q1: entradaOk({ flatrate: [{ ...prov(8, 'Netflix'), extra: 'x' }] }) };
  const { fetchImpl } = espiao((url) => respostaLote(url, (q) => corpo[q]));
  const mapa = await novoProvedores(fetchImpl).buscar(filmesQ('Q1'));
  assert.deepEqual(Object.keys(mapa.get('Q1').flatrate[0]).sort(), ['display_priority', 'logo_path', 'provider_id', 'provider_name']);
});

// ---- P-6: logs ----
test('AC-4: HTTP 500 gera exatamente 1 warn com os 5 QIDs e http-500, sem humor nem gênero', async () => {
  const { fetchImpl } = espiao(() => resp({}, { status: 500 }));
  const l = loggerEspiao();
  await criarProvedores({ urlWorker: WORKER, fetchImpl, logger: l }).buscar(CINCO);
  assert.equal(l.avisos.length, 1);
  const [texto, dados] = l.avisos[0];
  assert.match(texto, /^\[filmelier\]/);
  assert.equal(dados.fonte, 'provedores');
  assert.deepEqual(dados.qids, CINCO.map((x) => x.qid));
  assert.equal(dados.motivo, 'http-500');
  const tudo = JSON.stringify(l.avisos);
  assert.ok(!tudo.includes('medo') && !tudo.includes('Q130232'));
});

test('AC-4: QIDs ausentes ou com entrada inválida geram juntos 1 warn formato', async () => {
  const corpo = { Q1: entradaOk(), Q2: { status: 'talvez' }, Q3: entradaOk({ buy: 3 }) };
  const { fetchImpl } = espiao((url) => resp({ resultados: Object.fromEntries(qidsDeUrl(url).filter((q) => q !== 'Q4').map((q) => [q, corpo[q] ?? entradaOk()])) }));
  const l = loggerEspiao();
  await criarProvedores({ urlWorker: WORKER, fetchImpl, logger: l }).buscar(filmesQ('Q1', 'Q2', 'Q3', 'Q4'));
  assert.equal(l.avisos.length, 1);
  assert.equal(l.avisos[0][1].motivo, 'formato');
  assert.deepEqual(l.avisos[0][1].qids, ['Q2', 'Q3', 'Q4']);
  assert.equal(l.avisos[0][1].fonte, 'provedores');
});

test('AC-4: erro e limite do Worker não geram warn de formato (são estados válidos)', async () => {
  const { fetchImpl } = espiao((url) => respostaLote(url, (q) => ({ status: q === 'Q1' ? 'erro' : 'limite' })));
  const l = loggerEspiao();
  await criarProvedores({ urlWorker: WORKER, fetchImpl, logger: l }).buscar(filmesQ('Q1', 'Q2'));
  assert.equal(l.avisos.length, 0);
});

// ---- P-7: suspensão própria ----
function relogio() {
  let t = 1_000_000;
  return { agora: () => t, avancar: (s) => { t += s * 1000; } };
}

test('AC-12: retryAfter 24 no corpo suspende: 10 s depois 0 chamadas (cache servido), 25 s depois chama', async () => {
  const r = relogio();
  const { fetchImpl, chamadas } = espiao((url) => ({ ...respostaLote(url, (q) => (q === 'Q1' ? entradaOk() : { status: 'limite' })), json: async () => ({ resultados: Object.fromEntries(qidsDeUrl(url).map((q) => [q, q === 'Q1' ? entradaOk() : { status: 'limite' }])), retryAfter: 24 }) }));
  const l = loggerEspiao();
  const p = criarProvedores({ urlWorker: WORKER, fetchImpl, logger: l, agora: r.agora });
  await p.buscar(filmesQ('Q1', 'Q2'));
  assert.equal(chamadas.length, 1);
  assert.equal(l.avisos.length, 1);
  assert.match(String(l.avisos[0][0]), /^\[filmelier\].*24/);
  r.avancar(10);
  const meio = await p.buscar(filmesQ('Q1', 'Q3'));
  assert.equal(chamadas.length, 1);
  assert.equal(meio.get('Q1').status, 'ok');
  assert.equal(meio.get('Q3'), null);
  r.avancar(15);
  await p.buscar(filmesQ('Q1', 'Q3'));
  assert.equal(chamadas.length, 2);
  assert.deepEqual(qidsDeUrl(chamadas[1].url), ['Q3']);
});

const casos429 = [
  ['Retry-After 24', { 'Retry-After': '24' }, 24],
  ['sem Retry-After', {}, 30],
  ['Retry-After abc', { 'Retry-After': 'abc' }, 30],
  ['Retry-After 999999999', { 'Retry-After': '999999999' }, 300],
];
for (const [nome, headers, segundos] of casos429) {
  test(`AC-12: HTTP 429 do Worker (${nome}) suspende por ${segundos} s`, async () => {
    const r = relogio();
    let primeira = true;
    const { fetchImpl, chamadas } = espiao((url) => {
      if (primeira) { primeira = false; return resp({}, { status: 429, headers }); }
      return respostaLote(url);
    });
    const l = loggerEspiao();
    const p = criarProvedores({ urlWorker: WORKER, fetchImpl, logger: l, agora: r.agora });
    await p.buscar(filmesQ('Q1'));
    assert.equal(chamadas.length, 1);
    assert.ok(l.avisos.some(([t]) => new RegExp(`^\\[filmelier\\].*suspensas por ${segundos} s`).test(t)));
    assert.equal(l.avisos.filter(([t]) => /suspensas/.test(t)).length, 1);
    assert.equal(p.suspensoAte(), r.agora() + segundos * 1000);
    r.avancar(segundos - 1);
    await p.buscar(filmesQ('Q1'));
    assert.equal(chamadas.length, 1, 'suspenso 1 s antes do fim');
    r.avancar(2);
    await p.buscar(filmesQ('Q1'));
    assert.equal(chamadas.length, 2, 'volta 1 s depois do fim');
  });
}

test('AC-12: retryAfter 0 ou inválido no corpo suspende por 30 s e 999999999 por 300 s', async () => {
  for (const [bruto, esperado] of [[0, 30], ['abc', 30], [999999999, 300], [24, 24]]) {
    const r = relogio();
    const { fetchImpl } = espiao((url) => ({ ...resp({}), json: async () => ({ resultados: {}, retryAfter: bruto }) }));
    const p = criarProvedores({ urlWorker: WORKER, fetchImpl, logger: mudo, agora: r.agora });
    await p.buscar(filmesQ('Q1'));
    assert.equal(p.suspensoAte(), r.agora() + esperado * 1000, String(bruto));
  }
});

// ---- P-8: montarSecao, categorias e ordem ----
const nomesDe = (secao) => secao.categorias.map((c) => [c.rotulo, c.provedores.map((x) => x.nome)]);

test('AC-5: montarSecao com 4 categorias na ordem Assinatura, Aluguel, Compra e Grátis com anúncios', () => {
  const secao = montarSecao(entradaOk({
    flatrate: [prov(9, 'Prime', 3), prov(8, 'Netflix', 1), prov(337, 'Disney', 2)],
    rent: [prov(2, 'Apple', 5), prov(3, 'Google', 4)],
    buy: [prov(2, 'Apple', 5)],
    ads: [prov(100, 'Pluto', 7)],
    free: [prov(101, 'Tubi', 6)],
  }));
  assert.equal(secao.estado, 'com-dados');
  assert.deepEqual(nomesDe(secao), [
    ['Assinatura', ['Netflix', 'Disney', 'Prime']],
    ['Aluguel', ['Google', 'Apple']],
    ['Compra', ['Apple']],
    ['Grátis com anúncios', ['Tubi', 'Pluto']],
  ]);
  assert.deepEqual(secao.categorias.map((c) => c.chave), ['flatrate', 'rent', 'buy', 'ads']);
});

test('AC-5: categoria vazia é omitida e ads com free unidos não repetem o provedor', () => {
  const secao = montarSecao(entradaOk({ flatrate: [], rent: [], buy: [prov(2, 'Apple')], ads: [prov(100, 'Pluto', 7)], free: [prov(100, 'Pluto', 7)] }));
  assert.deepEqual(nomesDe(secao), [['Compra', ['Apple']], ['Grátis com anúncios', ['Pluto']]]);
});

test('AC-5: provider_id repetido numa categoria mantém o de menor prioridade; não numérico vai ao fim em ordem de chegada', () => {
  const secao = montarSecao(entradaOk({
    flatrate: [prov(1, 'Zeta', null), prov(8, 'Netflix', 9), prov(2, 'Beta', null), prov(8, 'Netflix', 1), prov(3, 'Alfa', 2)],
  }));
  assert.deepEqual(nomesDe(secao), [['Assinatura', ['Netflix', 'Alfa', 'Zeta', 'Beta']]]);
  const ids = secao.categorias[0].provedores.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length);
});

// ---- P-9: logo do provedor ----
test('AC-5: logo_path válido gera imagem w92 de image.tmdb.org com atributos exatos', () => {
  const secao = montarSecao(entradaOk({ flatrate: [prov(8, 'Netflix', 1, '/t2yyOv40HZeVlLjYsCsPHnWLk4W.jpg')] }));
  assert.deepEqual(secao.categorias[0].provedores[0].logo, {
    src: 'https://image.tmdb.org/t/p/w92/t2yyOv40HZeVlLjYsCsPHnWLk4W.jpg',
    alt: 'Netflix', width: 46, height: 46, loading: 'lazy', referrerPolicy: 'no-referrer',
  });
});

test('AC-5: logo_path recusado vira nome em texto, sem URL de imagem', () => {
  for (const ruim of ['//evil.com/a.png', '/a.png?x=1', null, '/a/b.png', '/a.gif', 'a.png', '/a.png#x', '/../a.png']) {
    const provedor = montarSecao(entradaOk({ flatrate: [prov(8, 'Netflix', 1, ruim)] })).categorias[0].provedores[0];
    assert.equal(provedor.logo, null, String(ruim));
    assert.equal(provedor.nome, 'Netflix');
  }
  for (const bom of ['/a.png', '/A_b-1.jpeg', '/x.svg', '/x.jpg']) {
    assert.ok(montarSecao(entradaOk({ flatrate: [prov(8, 'N', 1, bom)] })).categorias[0].provedores[0].logo, bom);
  }
});

// ---- P-10: atribuição e estado sem dados ----
test('AC-6: atribuição com link válido do TMDB', () => {
  const link = 'https://www.themoviedb.org/movie/597-titanic/watch?locale=BR';
  const secao = montarSecao(entradaOk({ link }));
  assert.deepEqual(secao.atribuicao, { texto: 'Onde assistir: JustWatch via TMDB', url: link, target: '_blank', rel: 'noopener noreferrer' });
});

test('AC-6: link recusado deixa o texto com URL nula', () => {
  for (const ruim of ['javascript:alert(1)', 'https://outro.com/', null, 'http://www.themoviedb.org/x', 'https://www.themoviedb.org.evil.com/x']) {
    const secao = montarSecao(entradaOk({ link: ruim }));
    assert.equal(secao.atribuicao.texto, 'Onde assistir: JustWatch via TMDB', String(ruim));
    assert.equal(secao.atribuicao.url, null, String(ruim));
  }
});

const SEM_DADOS = { estado: 'sem-dados', texto: 'Sem dados de onde assistir no Brasil', categorias: [], atribuicao: null };
const casosSemDados = {
  'sem-br': { status: 'sem-br' },
  'sem-tmdb': { status: 'sem-tmdb' },
  erro: { status: 'erro' },
  limite: { status: 'limite' },
  'ok sem categoria': entradaOk({ flatrate: [] }),
  null: null,
};
for (const [nome, entrada] of Object.entries(casosSemDados)) {
  test(`AC-6: estado sem dados para ${nome}`, () => {
    assert.deepEqual(montarSecao(entrada), SEM_DADOS);
  });
}

test('AC-7: estado buscando tem o texto exato', () => {
  assert.deepEqual(montarSecao({ estado: 'buscando' }), { estado: 'buscando', texto: 'Buscando onde assistir no Brasil' });
});

test('AC-6: nome com marcação HTML fica como texto literal no modelo', () => {
  const nome = '<img src=x onerror=alert(1)>';
  const secao = montarSecao(entradaOk({ flatrate: [prov(8, nome)] }));
  assert.equal(secao.categorias[0].provedores[0].nome, nome);
});

// ---- P-11: montarCard com provedores ----
const ITEM = { titulo: 'Titanic', ano: '1997', generos: ['Drama'], links: [{ texto: 'Wikidata', href: 'https://www.wikidata.org/wiki/Q44578', target: '_blank', rel: 'noopener noreferrer' }] };

test('AC-5: com Worker configurado a seção é o último item do card, depois dos links', () => {
  const card = montarCard(ITEM, null, entradaOk());
  const chaves = Object.keys(card);
  assert.equal(chaves.at(-1), 'provedores');
  assert.ok(chaves.indexOf('links') < chaves.indexOf('provedores'));
  assert.equal(card.provedores.estado, 'com-dados');
  assert.deepEqual(card.links, ITEM.links);
});

test('AC-5: card em andamento e card sem dados', () => {
  assert.equal(montarCard(ITEM, null, { estado: 'buscando' }).provedores.texto, 'Buscando onde assistir no Brasil');
  assert.equal(montarCard(ITEM, null, SEM_ENTRADA).provedores.texto, 'Sem dados de onde assistir no Brasil');
});

test('AC-15: com URL vazia (provedores nulo) o card mantém a ordem da FILMELIER-2', () => {
  const card = montarCard(ITEM);
  assert.equal(card.provedores, null);
  assert.deepEqual(Object.keys(card).filter((k) => k !== 'provedores'), [
    'titulo', 'tituloOriginal', 'tituloOriginalTexto', 'ano', 'generos', 'links', 'capa', 'placeholder', 'sinopse', 'marcaIdioma', 'lang', 'creditoTexto',
    'creditoUrl', 'licencaUrl', 'creditoImagemTexto', 'creditoImagemUrl', 'atributosLink',
  ]);
  assert.equal(montarCard(ITEM, null, null).provedores, null);
});

test('AC-13: links de provedores e do card têm target _blank e rel com noopener e noreferrer', () => {
  const card = montarCard(ITEM, { idioma: 'pt', sinopse: 'x', capaUrl: 'https://upload.wikimedia.org/a.jpg', artigoUrl: 'https://pt.wikipedia.org/wiki/X' }, entradaOk());
  for (const l of [...card.links, card.provedores.atribuicao]) {
    assert.equal(l.target, '_blank');
    assert.match(l.rel, /noopener/);
    assert.match(l.rel, /noreferrer/);
  }
  assert.equal(card.atributosLink.target, '_blank');
});

test('título pt-BR: preserva titulo e tituloOriginal validados (trim, até 200) em ok, sem-br e sem-tmdb', async () => {
  const corpo = {
    Q1: { status: 'ok', link: null, flatrate: [], titulo: '  Jogos Mortais ', tituloOriginal: 'Saw' },
    Q2: { status: 'sem-br', titulo: 'x'.repeat(201), tituloOriginal: 7 },
    Q3: { status: 'sem-br', titulo: '   ', tituloOriginal: 'y'.repeat(200) },
    Q4: { status: 'sem-tmdb', titulo: 'Z' },
  };
  const { fetchImpl } = espiao((url) => respostaLote(url, (q) => corpo[q]));
  const mapa = await novoProvedores(fetchImpl).buscar(filmesQ('Q1', 'Q2', 'Q3', 'Q4'));
  assert.equal(mapa.get('Q1').titulo, 'Jogos Mortais');
  assert.equal(mapa.get('Q1').tituloOriginal, 'Saw');
  assert.deepEqual(mapa.get('Q2'), { status: 'sem-br' });
  assert.deepEqual(mapa.get('Q3'), { status: 'sem-br', tituloOriginal: 'y'.repeat(200) });
  assert.equal(mapa.get('Q4').titulo, 'Z');
});

test('título pt-BR: o card usa o título pt-BR e mostra o original só quando difere', () => {
  const c = montarCard(ITEM, null, { ...entradaOk(), titulo: 'Titanic BR', tituloOriginal: 'Titanic Orig' });
  assert.equal(c.titulo, 'Titanic BR');
  assert.equal(c.tituloOriginal, 'Titanic Orig');
  assert.equal(c.tituloOriginalTexto, 'Título original: Titanic Orig');
  const semOriginal = montarCard(ITEM, null, { status: 'sem-br', titulo: 'Titanic BR' });
  assert.equal(semOriginal.tituloOriginal, 'Titanic'); // cai no título do dataset
  const igual = montarCard(ITEM, null, { status: 'sem-br', titulo: 'Titanic', tituloOriginal: 'Titanic' });
  assert.equal(igual.titulo, 'Titanic');
  assert.equal(igual.tituloOriginalTexto, null);
  const igualAoOriginal = montarCard(ITEM, null, { status: 'sem-br', titulo: 'Titanic BR', tituloOriginal: 'Titanic BR' });
  assert.equal(igualAoOriginal.tituloOriginal, null);
});

test('título pt-BR: sem dados do Worker o card fica como antes', () => {
  for (const prov of [null, { estado: 'buscando' }, SEM_ENTRADA, { status: 'sem-br' }]) {
    const c = montarCard(ITEM, null, prov);
    assert.equal(c.titulo, 'Titanic');
    assert.equal(c.tituloOriginal, null);
    assert.equal(c.tituloOriginalTexto, null);
  }
});

// FIM
