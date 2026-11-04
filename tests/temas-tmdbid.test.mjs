import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolverTmdbIds, criarClienteTmdb } from '../scripts/lib/temas.mjs';
import { mundoSimulado, baseSintetica } from './apoio/mundo-simulado.mjs';

const HOJE = '2026-11-04';
const CONTATO = 'teste@exemplo.org';

async function resolver(mundo, filmes, { anterior, agora, ...resto } = {}) {
  const cliente = criarClienteTmdb({ token: 'tok-teste-123', fetch: mundo.fetch, esperar: mundo.esperar });
  return resolverTmdbIds({
    filmes, anterior, hoje: HOJE, contato: CONTATO, cliente, fetch: mundo.fetch, esperar: mundo.esperar, agora, ...resto,
  });
}

const achado = (id, ano) => ({ id, release_date: `${ano}-06-01` });
const semImdb = (n) => baseSintetica(n).filmes;

test('AC-2: tmdbId anterior dispensa WDQS e find', async () => {
  const mundo = mundoSimulado();
  const filmes = semImdb(1);
  const r = await resolver(mundo, filmes, { anterior: { meta: {}, filmes: [{ qid: 'Q1', tmdbId: 671 }] } });
  assert.equal(r.tmdbIds.get('Q1'), 671);
  assert.deepEqual(r.origem, { anterior: 1, wikidata: 0, find: 0 });
  assert.equal(mundo.chamadas.length, 0);
});

test('AC-2: P4947 único dispensa o find', async () => {
  const mundo = mundoSimulado({ p4947: { Q1: [12155] } });
  const r = await resolver(mundo, semImdb(1));
  assert.equal(r.tmdbIds.get('Q1'), 12155);
  assert.deepEqual(r.origem, { anterior: 0, wikidata: 1, find: 0 });
  assert.equal(mundo.so('/find/').length, 0);
  assert.equal(r.consultadosWdqs, 1);
  assert.equal(r.lotesWdqs.length, 1);
});

test('AC-2: P4947 com 2 valores vai ao find, com wikidata_id', async () => {
  const mundo = mundoSimulado({ p4947: { Q1: [10, 11] }, find: { Q1: achado(77, 2000) } });
  const r = await resolver(mundo, semImdb(1));
  const finds = mundo.so('/find/');
  assert.equal(finds.length, 1);
  assert.match(finds[0].url, /external_source=wikidata_id/);
  assert.equal(r.tmdbIds.get('Q1'), 77);
  assert.deepEqual(r.origem, { anterior: 0, wikidata: 0, find: 1 });
});

test('AC-2: fallback pelo IMDb no find; as 2 requisições contam em findsNaRodada', async () => {
  const mundo = mundoSimulado({ find: { Q1: null, tt0120338: achado(597, 2000) } });
  const filmes = [{ ...semImdb(1)[0], imdb: 'tt0120338' }];
  const r = await resolver(mundo, filmes);
  const finds = mundo.so('/find/');
  assert.equal(finds.length, 2);
  assert.match(finds[1].url, /\/find\/tt0120338\?external_source=imdb_id/);
  assert.equal(r.findsNaRodada, 2);
  assert.equal(r.tmdbIds.get('Q1'), 597);
});

test('AC-2: cota de 3.000 find por rodada, 3.001 filmes', async () => {
  const mundo = mundoSimulado({ find: (id) => achado(Number(id.slice(1)) + 1000000, 2000) });
  const r = await resolver(mundo, semImdb(3001));
  assert.equal(mundo.so('/find/').length, 3000);
  assert.equal(r.findsNaRodada, 3000);
  assert.equal(r.pendentesFind, 1);
  assert.equal(r.tmdbIds.size, 3000);
});

test('AC-2: a cota conta também as novas tentativas (nunca passa de 3.000 envios)', async () => {
  const mundo = mundoSimulado({ find: (id, _fonte, n) => (id === 'Q1' && n < 3 ? 500 : achado(Number(id.slice(1)) + 1000000, 2000)) });
  const r = await resolver(mundo, semImdb(3001));
  assert.equal(mundo.so('/find/').length, 3000);
  assert.equal(r.findsNaRodada, 3000);
  assert.equal(r.pendentesFind, 3);
});

test('AC-2: prazo de 720.000 ms encerra o find; os filmes restantes ficam em pendentesFind', async () => {
  let agora = 0;
  const mundo = mundoSimulado({
    find: (id) => achado(Number(id.slice(1)) + 1000000, 2000),
    aoChamar: (url) => { if (url.includes('/find/Q3')) agora = 720000; },
  });
  const r = await resolver(mundo, semImdb(13), { agora: () => agora, inicio: 0 });
  // Q1..Q3 resolvidos antes de o relógio passar o prazo; os 10 seguintes não geram requisição.
  assert.equal(mundo.so('/find/').length, 3);
  assert.equal(r.pendentesFind, 10);
});

test('AC-2: ano divergente (1949 para 1951) descarta o tmdbId, conta divergência e cria a marca', async () => {
  const mundo = mundoSimulado({ find: { Q1: achado(5, 1949) } });
  const filmes = [{ ...semImdb(1)[0], ano: 1951 }];
  const r = await resolver(mundo, filmes);
  assert.equal(r.divergenciaAno, 1);
  assert.ok(!r.tmdbIds.has('Q1'));
  assert.deepEqual(r.semPar, { Q1: HOJE });
});

test('AC-2: diferença de 1 ano é aceita (2009 para 2010)', async () => {
  const mundo = mundoSimulado({ find: { Q1: achado(8, 2009) } });
  const filmes = [{ ...semImdb(1)[0], ano: 2010 }];
  const r = await resolver(mundo, filmes);
  assert.equal(r.tmdbIds.get('Q1'), 8);
  assert.equal(r.origem.find, 1);
  assert.equal(r.divergenciaAno, 0);
});

test('AC-2: release_date ausente conta como divergência', async () => {
  const mundo = mundoSimulado({ find: { Q1: { id: 4 } } });
  const r = await resolver(mundo, semImdb(1));
  assert.equal(r.divergenciaAno, 1);
});

test('AC-2: find com 500 nas 3 tentativas vai a pendentesFind, sem marca', async () => {
  const mundo = mundoSimulado({ find: { Q1: 500 } });
  const r = await resolver(mundo, semImdb(1));
  assert.equal(mundo.so('/find/').length, 3);
  assert.equal(r.pendentesFind, 1);
  assert.ok(!r.tmdbIds.has('Q1'));
  assert.deepEqual(r.semPar, {});
});

test('AC-2: marca de 10 dias evita novo find e continua; a P4947 ainda é consultada', async () => {
  const mundo = mundoSimulado();
  const anterior = { meta: { temas: { semPar: { Q1: '2026-10-25' } } }, filmes: [] };
  const r = await resolver(mundo, semImdb(1), { anterior });
  assert.equal(mundo.so('/find/').length, 0);
  assert.equal(mundo.contagem.wdqs, 1);
  assert.deepEqual(r.semPar, { Q1: '2026-10-25' });
});

test('AC-2: marca de 29 dias volta ao find; sem resultado a marca passa à data da rodada', async () => {
  const mundo = mundoSimulado({ find: { Q1: null } });
  const anterior = { meta: { temas: { semPar: { Q1: '2026-10-06' } } }, filmes: [] };
  const r = await resolver(mundo, semImdb(1), { anterior });
  assert.equal(mundo.so('/find/').length, 1);
  assert.deepEqual(r.semPar, { Q1: HOJE });
});

test('AC-2: marca de 28 dias ainda vale (até 28 dias)', async () => {
  const mundo = mundoSimulado();
  const anterior = { meta: { temas: { semPar: { Q1: '2026-10-07' } } }, filmes: [] };
  await resolver(mundo, semImdb(1), { anterior });
  assert.equal(mundo.so('/find/').length, 0);
});

test('AC-2: marca de QID fora da base é podada; valor da P4947 remove a marca', async () => {
  const mundo = mundoSimulado({ p4947: { Q1: [9] } });
  const anterior = { meta: { temas: { semPar: { Q3: '2026-11-01', Q1: '2026-11-01' } } }, filmes: [] };
  const r = await resolver(mundo, semImdb(2), { anterior });
  assert.ok(!('Q3' in r.semPar));
  assert.ok(!('Q1' in r.semPar));
});

test('AC-2: rodada sem base anterior consulta tudo na P4947 e no find', async () => {
  const mundo = mundoSimulado({ find: (id) => achado(Number(id.slice(1)) + 500, 2000) });
  const r = await resolver(mundo, semImdb(3), { anterior: undefined });
  assert.equal(r.origem.anterior, 0);
  assert.equal(r.consultadosWdqs, 3);
  assert.equal(mundo.so('/find/').length, 3);
});
