import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mundoSimulado, baseSintetica } from './apoio/mundo-simulado.mjs';
import { rodar, cenario, TABELA, TOKEN, todasAsStrings, todasAsKeywordsDaTabela } from './apoio/rodar-temas.mjs';

const raiz = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const viabilidade = JSON.parse(readFileSync(`${raiz}/tests/fixtures/keywords-viabilidade.json`, 'utf8'));
const BRUXA = ['witch'];
const linhasJson = (linhas) => linhas.map((l) => JSON.parse(l));

// n filmes em que os `quantos` primeiros têm as keywords dadas.
const comKeywords = (n, quantos, kws, opcoes = {}) => cenario(n, { keywords: (i) => (i <= quantos ? kws : []), ...opcoes });

test('AC-3: tag anterior sem keyword atual some, enquanto o tema segue nos demais', async () => {
  const c = cenario(21, { keywords: (i) => (i <= 20 ? ['vampire'] : []), anteriorDe: (i) => (i === 21 ? { tags: ['vampiros'] } : {}) });
  const r = await rodar({ base: c.base, anterior: c.anterior, mundo: mundoSimulado({ keywords: c.keywords }) });
  assert.equal(r.codigo, 0);
  const f21 = r.saida.filmes.find((f) => f.qid === 'Q21');
  assert.ok(!f21.tags);
  assert.deepEqual(r.saida.filmes[0].tags, ['vampiros']);
  assert.equal(r.saida.meta.temas.lista.find((x) => x.id === 'vampiros').filmes, 20);
});

test('AC-3: 1 busca de /keywords por filme com tmdbId (50 filmes, 40 com tmdbId)', async () => {
  const c = cenario(50);
  c.anterior.filmes = c.anterior.filmes.slice(0, 40);
  const mundo = mundoSimulado({ keywords: c.keywords, find: () => null });
  const r = await rodar({ base: c.base, anterior: c.anterior, mundo });
  assert.equal(r.codigo, 0);
  assert.equal(mundo.so('/keywords').length, 40);
});

test('AC-9: nunca 2 requisições em voo (WDQS, find e keywords)', async () => {
  const base = baseSintetica(6);
  const anterior = { meta: {}, filmes: [{ qid: 'Q1', tmdbId: 11 }, { qid: 'Q2', tmdbId: 12 }] };
  const mundo = mundoSimulado({
    p4947: { Q3: [13], Q4: [14, 15] }, find: { Q4: { id: 15, release_date: '2000-01-01' }, Q5: { id: 16, release_date: '2000-01-01' } },
  });
  const r = await rodar({ base, anterior, mundo });
  assert.equal(r.codigo, 0);
  assert.ok(mundo.contagem.wdqs >= 1 && mundo.so('/find/').length >= 2 && mundo.so('/keywords').length >= 4);
  assert.equal(mundo.maxEmVoo(), 1);
});

test('AC-7: 1 falha em 100 não derruba a rodada; stderr tem 1 linha keywords-filme com o QID e sem o token', async () => {
  const c = cenario(100, {});
  const mundo = mundoSimulado({ keywords: (id) => (id === 1050 ? 500 : []) });
  const r = await rodar({ base: c.base, anterior: c.anterior, mundo });
  assert.equal(r.codigo, 0);
  assert.equal(r.resumo.falhasKeywords, 1);
  assert.equal(r.gravados.length, 1);
  const erros = linhasJson(r.stderr);
  assert.equal(erros.length, 1);
  assert.equal(erros[0].invariante, 'keywords-filme');
  assert.ok(erros[0].erro.includes('Q50'));
  assert.ok(!r.stderr.join('\n').includes(TOKEN));
});

const COM_BRUXARIA_E_UM = (extra) => cenario(21, {
  keywords: (i) => (i <= 20 ? [...BRUXA, 'depressing'] : []),
  anteriorDe: (i) => (i === 21 ? extra : {}),
});
const falhaNoUltimo = (c) => mundoSimulado({ keywords: (id) => (id === 1021 ? 504 : c.keywords[id]) });

test('AC-7: tags de 21 dias são mantidas, com tagsEm na data anterior e tagsMantidas 1', async () => {
  const c = COM_BRUXARIA_E_UM({ tags: ['bruxaria'], clima: 'sombrio' });
  const r = await rodar({ base: c.base, anterior: c.anterior, mundo: falhaNoUltimo(c) });
  assert.equal(r.codigo, 0);
  const f = r.saida.filmes.find((x) => x.qid === 'Q21');
  assert.deepEqual(f.tags, ['bruxaria']);
  assert.equal(f.clima, 'sombrio');
  assert.equal(f.tagsEm, '2026-10-28');
  assert.equal(r.resumo.tagsMantidas, 1);
});

test('AC-7: tagsEm anterior é preservado ao manter de novo (até 28 dias)', async () => {
  const c = COM_BRUXARIA_E_UM({ tags: ['bruxaria'], clima: 'sombrio', tagsEm: '2026-10-07' });
  const r = await rodar({ base: c.base, anterior: c.anterior, mundo: falhaNoUltimo(c) });
  assert.equal(r.saida.filmes.find((x) => x.qid === 'Q21').tagsEm, '2026-10-07');
});

test('AC-7: tags de 29 dias expiram: sem tags, sem clima, sem tagsEm e tagsExpiradas 1', async () => {
  const c = COM_BRUXARIA_E_UM({ tags: ['bruxaria'], clima: 'sombrio', tagsEm: '2026-10-06' });
  const r = await rodar({ base: c.base, anterior: c.anterior, mundo: falhaNoUltimo(c) });
  const f = r.saida.filmes.find((x) => x.qid === 'Q21');
  assert.ok(!f.tags && !f.clima && !f.tagsEm);
  assert.equal(r.resumo.tagsExpiradas, 1);
  assert.equal(r.resumo.tagsMantidas, 0);
});

test('AC-7: sem tags anteriores, falha de keywords conta em tagsExpiradas e fica vazio', async () => {
  const c = COM_BRUXARIA_E_UM({});
  const r = await rodar({ base: c.base, anterior: c.anterior, mundo: falhaNoUltimo(c) });
  assert.equal(r.resumo.tagsExpiradas, 1);
});

test('AC-7: sucesso na rodada seguinte remove tagsEm e recalcula', async () => {
  const c = COM_BRUXARIA_E_UM({ tags: ['bruxaria'], tagsEm: '2026-10-20' });
  c.keywords[1021] = ['witch'];
  const r = await rodar({ base: c.base, anterior: c.anterior, mundo: mundoSimulado({ keywords: c.keywords }) });
  const f = r.saida.filmes.find((x) => x.qid === 'Q21');
  assert.ok(!('tagsEm' in f));
  assert.deepEqual(f.tags, ['bruxaria']);
});

test('AC-7: tag mantida de tema removido de temas.json é descartada', async () => {
  const c = COM_BRUXARIA_E_UM({ tags: ['bruxaria', 'tema-antigo'] });
  const r = await rodar({ base: c.base, anterior: c.anterior, mundo: falhaNoUltimo(c) });
  assert.deepEqual(r.saida.filmes.find((x) => x.qid === 'Q21').tags, ['bruxaria']);
});

test('AC-7: 6 falhas em 100 abortam com falhas-keywords; com 5 a saída é 0', async () => {
  const c = cenario(100);
  const r6 = await rodar({ base: c.base, anterior: c.anterior, mundo: mundoSimulado({ keywords: (id) => (id <= 1006 ? 500 : []) }) });
  assert.notEqual(r6.codigo, 0);
  assert.equal(r6.gravados.length, 0);
  assert.ok(linhasJson(r6.stderr).some((l) => l.invariante === 'falhas-keywords'));
  const r5 = await rodar({ base: c.base, anterior: c.anterior, mundo: mundoSimulado({ keywords: (id) => (id <= 1005 ? 500 : []) }) });
  assert.equal(r5.codigo, 0);
  assert.equal(r5.resumo.falhasKeywords, 5);
});

test('AC-7: 404 em /keywords: 1 requisição, falha contada e filme sem tmdbId', async () => {
  const c = cenario(100);
  const mundo = mundoSimulado({ keywords: (id) => (id === 1003 ? 404 : []) });
  const r = await rodar({ base: c.base, anterior: c.anterior, mundo });
  assert.equal(mundo.contagem.keywords.get(1003), 1);
  assert.equal(r.resumo.falhasKeywords, 1);
  assert.ok(!('tmdbId' in r.saida.filmes[2]));
  assert.equal(r.resumo.comTmdbId, 99);
});

test('AC-7: 5xx constante em /keywords: 3 requisições para o filme e falha contada', async () => {
  const c = cenario(100);
  const mundo = mundoSimulado({ keywords: (id) => (id === 1002 ? 504 : []) });
  const r = await rodar({ base: c.base, anterior: c.anterior, mundo });
  assert.equal(mundo.contagem.keywords.get(1002), 3);
  assert.equal(r.resumo.falhasKeywords, 1);
});

test('AC-7: 429 com Retry-After de 7 s espera 7.000 ms e repete o mesmo filme', async () => {
  const c = cenario(3);
  const mundo = mundoSimulado({ keywords: (id, n) => (id === 1001 && n === 1 ? 429 : []) });
  const r = await rodar({ base: c.base, anterior: c.anterior, mundo });
  assert.equal(r.codigo, 0);
  assert.ok(mundo.esperas.includes(7000));
  assert.equal(mundo.contagem.keywords.get(1001), 2);
});

test('AC-7: HTTP 401 e HTTP 403 abortam com 1 requisição ao TMDB e sem gravar', async () => {
  for (const status of [401, 403]) {
    const c = cenario(5);
    const mundo = mundoSimulado({ keywords: () => status });
    const r = await rodar({ base: c.base, anterior: c.anterior, mundo });
    assert.notEqual(r.codigo, 0);
    assert.equal(mundo.so('api.themoviedb.org').length, 1);
    assert.equal(r.gravados.length, 0);
    assert.ok(linhasJson(r.stderr).some((l) => l.invariante === 'tmdb-autorizacao'));
  }
});

test('AC-7: token ausente e vazio: 0 chamadas, 1 linha tmdb-token e saída diferente de 0', async () => {
  for (const token of [null, '']) {
    const mundo = mundoSimulado();
    const r = await rodar({ base: baseSintetica(3), mundo, token });
    assert.notEqual(r.codigo, 0);
    assert.equal(mundo.chamadas.length, 0);
    const linhas = linhasJson(r.stderr);
    assert.equal(linhas.length, 1);
    assert.equal(linhas[0].invariante, 'tmdb-token');
  }
});

test('AC-2: sem contato, 0 chamadas, 1 linha contato e nada gravado', async () => {
  const mundo = mundoSimulado();
  const r = await rodar({ base: baseSintetica(3), mundo, contato: null });
  assert.notEqual(r.codigo, 0);
  assert.equal(mundo.chamadas.length, 0);
  assert.equal(linhasJson(r.stderr)[0].invariante, 'contato');
  assert.equal(r.gravados.length, 0);
});

test('AC-2: rodada sem base anterior consulta os 3 filmes na P4947 e no find', async () => {
  const mundo = mundoSimulado({ find: (id) => ({ id: Number(id.slice(1)) + 50, release_date: '2000-05-05' }) });
  const r = await rodar({ base: baseSintetica(3), anterior: null, mundo });
  assert.equal(r.codigo, 0);
  assert.equal(r.resumo.origemTmdbId.anterior, 0);
  assert.equal(r.resumo.origemTmdbId.find, 3);
  assert.equal(mundo.so('/find/').length, 3);
});

test('AC-2: WDQS com 504 constante: lote tentado 3 vezes, saída diferente de 0, 1 linha com lote e nada gravado', async () => {
  const mundo = mundoSimulado({ p4947: () => 504 });
  const r = await rodar({ base: baseSintetica(3), mundo });
  assert.notEqual(r.codigo, 0);
  assert.equal(mundo.contagem.wdqs, 3);
  const linhas = linhasJson(r.stderr);
  assert.equal(linhas.length, 1);
  assert.ok(linhas[0].erro && linhas[0].lote);
  assert.equal(r.gravados.length, 0);
  assert.equal(mundo.so('api.themoviedb.org').length, 0);
});

test('AC-9: lote do WDQS que nunca responde é abortado pelo sinal de 55.000 ms', async () => {
  const pedidos = [];
  const criarSinal = (ms) => { pedidos.push(ms); return AbortSignal.abort(); };
  const mundo = mundoSimulado();
  const fetchBase = mundo.fetch;
  mundo.fetch = (url, init) => (String(url).includes('query.wikidata.org')
    ? new Promise((_, rejeitar) => { init.signal.addEventListener('abort', () => rejeitar(new Error('abortado'))); if (init.signal.aborted) rejeitar(new Error('abortado')); })
    : fetchBase(url, init));
  const r = await rodar({ base: baseSintetica(2), mundo, criarSinal });
  assert.notEqual(r.codigo, 0);
  assert.ok(pedidos.filter((ms) => ms === 55000).length >= 3);
});

test('AC-9: duracaoMs de todo lote do WDQS fica abaixo de 60.000 em rodada de sucesso', async () => {
  const r = await rodar({ base: baseSintetica(3), mundo: mundoSimulado({ find: () => null }) });
  assert.ok(r.resumo.lotesWdqs.length >= 1);
  assert.ok(r.resumo.lotesWdqs.every((l) => l.duracaoMs < 60000));
});

test('AC-9: requisição 12.001 ao TMDB não é enviada: 12.000 requisições, teto-tmdb e nada gravado', async () => {
  const c = cenario(12001);
  const mundo = mundoSimulado();
  const r = await rodar({ base: c.base, anterior: c.anterior, mundo });
  assert.notEqual(r.codigo, 0);
  assert.equal(mundo.so('api.themoviedb.org').length, 12000);
  assert.ok(linhasJson(r.stderr).some((l) => l.invariante === 'teto-tmdb'));
  assert.equal(r.gravados.length, 0);
});

test('AC-9: tentativa 41 ao WDQS não é enviada: 40 tentativas, teto-wdqs e nada gravado', async () => {
  const mundo = mundoSimulado();
  const r = await rodar({ base: baseSintetica(41 * 300), mundo });
  assert.notEqual(r.codigo, 0);
  assert.equal(mundo.contagem.wdqs, 40);
  assert.ok(linhasJson(r.stderr).some((l) => l.invariante === 'teto-wdqs'));
  assert.equal(r.gravados.length, 0);
});

test('AC-9: prazo interno do find encerra os find novos; as keywords dos resolvidos são buscadas e a base é gravada', async () => {
  let t = 0;
  const mundo = mundoSimulado({
    find: (id) => ({ id: Number(id.slice(1)) + 7000, release_date: '2000-01-01' }),
    aoChamar: (url) => { if (url.includes('/find/Q3')) t = 720000; },
  });
  const r = await rodar({ base: baseSintetica(13), mundo, agora: () => t });
  assert.equal(r.codigo, 0);
  assert.equal(mundo.so('/find/').length, 3);
  assert.equal(r.resumo.pendentesFind, 10);
  assert.equal(mundo.so('/keywords').length, 3);
  assert.equal(r.gravados.length, 1);
});

test('AC-2: ano divergente: divergenciaAno 1 e o filme sai sem tags, sem clima e sem tmdbId', async () => {
  const mundo = mundoSimulado({ find: { Q1: { id: 5, release_date: '1949-07-29' } } });
  const base = baseSintetica(1, () => ({ ano: 1951 }));
  const r = await rodar({ base, mundo });
  assert.equal(r.resumo.divergenciaAno, 1);
  const f = r.saida.filmes[0];
  assert.ok(!f.tags && !f.clima && !('tmdbId' in f));
  assert.deepEqual(r.saida.meta.temas.semPar, { Q1: '2026-11-04' });
});

test('AC-3: tema com 19 filmes some e aparece em abaixoDoLimiar; com 20 grava a lista', async () => {
  const c19 = comKeywords(30, 19, BRUXA);
  const r19 = await rodar({ base: c19.base, anterior: c19.anterior, mundo: mundoSimulado({ keywords: c19.keywords }) });
  assert.ok(r19.resumo.abaixoDoLimiar.includes('bruxaria'));
  assert.ok(r19.saida.filmes.every((f) => !(f.tags ?? []).includes('bruxaria')));
  assert.ok(!r19.saida.meta.temas.lista.some((x) => x.id === 'bruxaria'));
  const c20 = comKeywords(30, 20, BRUXA);
  const r20 = await rodar({ base: c20.base, anterior: c20.anterior, mundo: mundoSimulado({ keywords: c20.keywords }) });
  assert.equal(r20.saida.filmes.filter((f) => (f.tags ?? []).includes('bruxaria')).length, 20);
  assert.equal(r20.saida.meta.temas.lista.find((x) => x.id === 'bruxaria').filmes, 20);
});

test('AC-3: clima leve com 19 filmes some e sombrio com 30 fica', async () => {
  const c = cenario(49, { keywords: (i) => (i <= 19 ? ['whimsical'] : ['dark']) });
  const r = await rodar({ base: c.base, anterior: c.anterior, mundo: mundoSimulado({ keywords: c.keywords }) });
  assert.ok(r.saida.filmes.every((f) => f.clima !== 'leve'));
  assert.ok(r.resumo.abaixoDoLimiar.includes('leve'));
  assert.equal(r.saida.meta.temas.lista.find((x) => x.id === 'sombrio').filmes, 30);
});

test('AC-5: curadoria adicionar tema sem keyword conta em aplicadas; QID ausente conta em qidsAusentes; clima nenhum', async () => {
  const c = cenario(25, { keywords: () => ['whimsical'] });
  const curadoria = { filmes: { Q1: { adicionar: ['conto-de-fadas'] }, Q2: { clima: 'nenhum' }, Q999999999: { adicionar: ['conto-de-fadas'] } } };
  for (let i = 3; i <= 21; i++) curadoria.filmes[`Q${i}`] = { adicionar: ['conto-de-fadas'] };
  const r = await rodar({ base: c.base, anterior: c.anterior, mundo: mundoSimulado({ keywords: c.keywords }), curadoria });
  assert.equal(r.codigo, 0);
  assert.equal(r.resumo.curadoria.qidsAusentes, 1);
  assert.equal(r.resumo.curadoria.aplicadas, 21);
  assert.deepEqual(r.saida.filmes[0].tags, ['conto-de-fadas']);
  assert.ok(!('clima' in r.saida.filmes[1]));
});

test('AC-5: curadoria com tema inexistente aborta antes da rede', async () => {
  const mundo = mundoSimulado();
  const r = await rodar({ base: baseSintetica(3), mundo, curadoria: { filmes: { Q1: { adicionar: ['xyz'] } } } });
  assert.notEqual(r.codigo, 0);
  assert.equal(mundo.chamadas.length, 0);
  assert.equal(r.gravados.length, 0);
  const linhas = linhasJson(r.stderr);
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].invariante, 'curadoria-tema');
});

test('AC-5: o mesmo tema em adicionar e remover do mesmo QID aborta antes da rede', async () => {
  const mundo = mundoSimulado();
  const r = await rodar({ base: baseSintetica(3), mundo, curadoria: { filmes: { Q1: { adicionar: ['bruxaria'], remover: ['bruxaria'] } } } });
  assert.notEqual(r.codigo, 0);
  assert.equal(mundo.chamadas.length, 0);
  assert.equal(r.gravados.length, 0);
  const linhas = linhasJson(r.stderr);
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].invariante, 'curadoria-tema');
});

test('AC-5: a curadoria não se aplica às tags mantidas por falha', async () => {
  const c = COM_BRUXARIA_E_UM({ tags: ['bruxaria'] });
  const r = await rodar({ base: c.base, anterior: c.anterior, mundo: falhaNoUltimo(c), curadoria: { filmes: { Q21: { remover: ['bruxaria'] } } } });
  assert.deepEqual(r.saida.filmes.find((x) => x.qid === 'Q21').tags, ['bruxaria']);
});

for (const [nome, ajuste] of [
  ['id Bruxaria com maiúscula', (t) => { t.temas[4].id = 'Bruxaria'; }],
  ['id mafia igual à keyword mafia', (t) => { t.temas.find((x) => x.id === 'crime-organizado').id = 'mafia'; }],
  ['tema de id sombrio', (t) => { t.temas[0].id = 'sombrio'; }],
]) {
  test(`AC-3: esquema inválido (${nome}) aborta antes da rede, sem gravar`, async () => {
    const tabela = structuredClone(TABELA);
    ajuste(tabela);
    const mundo = mundoSimulado();
    const r = await rodar({ base: baseSintetica(3), mundo, tabela });
    assert.notEqual(r.codigo, 0);
    assert.equal(mundo.chamadas.length, 0);
    assert.equal(r.gravados.length, 0);
    const linhas = linhasJson(r.stderr);
    assert.equal(linhas.length, 1);
    assert.equal(linhas[0].invariante, 'esquema-temas');
  });
}

// ---- Tamanho e prazo global ----
const serializar = async (titulo0, extra = {}) => {
  const base = baseSintetica(2);
  base.filmes[0].titulo = titulo0;
  const c = { base, anterior: { meta: {}, filmes: [{ qid: 'Q1', tmdbId: 1 }, { qid: 'Q2', tmdbId: 2 }] } };
  return rodar({ base: c.base, anterior: c.anterior, mundo: mundoSimulado(), ...extra });
};
const comTamanho = async (alvo) => {
  const medida = await serializar('A');
  const titulo = 'A'.repeat(1 + alvo - medida.resumo.bytes);
  return serializar(titulo);
};

test('AC-7: base de 2.621.441 bytes aborta com tamanho-maximo; 2.621.440 grava', async () => {
  const acima = await comTamanho(2621441);
  assert.notEqual(acima.codigo, 0);
  assert.equal(acima.gravados.length, 0);
  const linhas = linhasJson(acima.stderr);
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].invariante, 'tamanho-maximo');
  const exato = await comTamanho(2621440);
  assert.equal(exato.codigo, 0);
  assert.equal(exato.gravados.length, 1);
  assert.equal(Buffer.byteLength(exato.gravados[0], 'utf8'), 2621440);
  assert.equal(exato.resumo.alertaTamanho, true);
});

test('AC-4: alerta de tamanho acima de 2.000.000 bytes, e não em exatos 2.000.000', async () => {
  const acima = await comTamanho(2000001);
  assert.equal(acima.gravados.length, 1);
  assert.equal(acima.resumo.alertaTamanho, true);
  const exato = await comTamanho(2000000);
  assert.equal(exato.gravados.length, 1);
  assert.equal(exato.resumo.alertaTamanho, false);
});

test('AC-9: prazo global de 2.220.000 ms durante as keywords aborta com 1 linha prazo, sem gravar', async () => {
  let t = 0;
  const c = cenario(10);
  const mundo = mundoSimulado({ aoChamar: (url) => { if (url.includes('/movie/1003/')) t = 2220000; } });
  const r = await rodar({ base: c.base, anterior: c.anterior, mundo, agora: () => t });
  assert.notEqual(r.codigo, 0);
  assert.equal(r.gravados.length, 0);
  const linhas = linhasJson(r.stderr);
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].invariante, 'prazo');
  assert.equal(mundo.so('/keywords').length, 3);
});

test('AC-9: com 2.219.999 ms na última verificação antes de gravar, a base é gravada', async () => {
  let t = 0;
  const c = cenario(10);
  const mundo = mundoSimulado({ aoChamar: (url) => { if (url.includes('/movie/1010/')) t = 2219999; } });
  const r = await rodar({ base: c.base, anterior: c.anterior, mundo, agora: () => t });
  assert.equal(r.codigo, 0);
  assert.equal(r.gravados.length, 1);
});

test('AC-4: base gravada com a fixture de Harry Potter sem keyword bruta fora de titulo e com tags ordenadas', async () => {
  const qids = ['Q102438', 'Q102244', 'Q102225', 'Q102448', 'Q161687', 'Q102235', 'Q161678', 'Q232009'];
  const base = baseSintetica(28, () => ({}));
  qids.forEach((q, i) => { base.filmes[i].qid = q; });
  const anterior = { meta: {}, filmes: base.filmes.map((f, k) => ({ qid: f.qid, tmdbId: 500 + k })) };
  const keywords = {};
  base.filmes.forEach((f, k) => { keywords[500 + k] = viabilidade[f.qid] ?? ['witch', 'school of witchcraft']; });
  const r = await rodar({ base, anterior, mundo: mundoSimulado({ keywords }) });
  assert.equal(r.codigo, 0);
  const conhecidas = todasAsKeywordsDaTabela();
  assert.deepEqual(todasAsStrings(r.saida).filter((s) => conhecidas.has(s)), []);
  for (const f of r.saida.filmes.slice(0, 8)) {
    assert.deepEqual(f.tags, [...f.tags].sort());
    assert.ok(f.tags.includes('bruxaria'));
  }
  assert.ok(r.saida.filmes.slice(0, 8).every((f) => f.tags.includes('escola-de-magia') || f.tags.includes('bruxaria')));
});
