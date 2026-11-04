import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarConsultaTmdb, agruparP4947, consultarP4947 } from '../scripts/lib/temas.mjs';
import { ErroBuild } from '../scripts/lib/wdqs.mjs';

const CONTATO = 'teste@exemplo.org';
const resposta = (bindings) => ({ ok: true, status: 200, json: async () => ({ results: { bindings } }) });
const ligacao = (qid, valor) => ({ film: { value: `http://www.wikidata.org/entity/${qid}` }, tmdb: { value: String(valor) } });
const qidsDe = (n) => Array.from({ length: n }, (_, i) => `Q${i + 1}`);
const base = (extra = {}) => ({ contato: CONTATO, esperar: async () => {}, ...extra });

test('AC-2: a consulta SPARQL tem wdt:P4947 e VALUES e nenhum GROUP_CONCAT (lote de 300)', () => {
  const texto = montarConsultaTmdb(qidsDe(300));
  assert.match(texto, /wdt:P4947/);
  assert.match(texto, /VALUES/);
  assert.doesNotMatch(texto, /GROUP_CONCAT/);
  assert.equal(texto.match(/wd:Q\d+/g).length, 300);
});

test('AC-2: valor único aceito; 2 valores distintos e valor inválido recusados', () => {
  const mapa = agruparP4947([
    ligacao('Q1', 12155), ligacao('Q2', 10), ligacao('Q2', 11), ligacao('Q3', 'abc'), ligacao('Q4', 0), ligacao('Q5', 7), ligacao('Q5', 7),
  ]);
  assert.deepEqual([...mapa], [['Q1', 12155], ['Q5', 7]]);
});

test('AC-2: sem contato, invariante contato e 0 chamadas', async () => {
  let chamadas = 0;
  await assert.rejects(
    consultarP4947(['Q1'], { contato: undefined, esperar: async () => {}, fetch: async () => { chamadas += 1; return resposta([]); } }),
    (e) => e instanceof ErroBuild && e.invariante === 'contato',
  );
  assert.equal(chamadas, 0);
});

test('AC-2: 504 constante tenta o lote 3 vezes e falha com o lote', async () => {
  let chamadas = 0;
  const fetch = async () => { chamadas += 1; return { ok: false, status: 504, json: async () => ({}) }; };
  await assert.rejects(consultarP4947(['Q1'], base({ fetch })), (e) => e instanceof ErroBuild && e.lote === 'p4947-1' && e.invariante === undefined);
  assert.equal(chamadas, 3);
});

test('AC-2: pausa de 1.000 ms entre lotes e lotesWdqs com a duração', async () => {
  const esperas = [];
  const { mapa, lotesWdqs, consultados } = await consultarP4947(qidsDe(601), base({
    esperar: async (ms) => { esperas.push(ms); },
    fetch: async () => resposta([ligacao('Q1', 5)]),
  }));
  assert.deepEqual(esperas, [1000, 1000]);
  assert.equal(lotesWdqs.length, 3);
  assert.ok(lotesWdqs.every((l) => l.duracaoMs < 60000 && typeof l.lote === 'string'));
  assert.equal(consultados, 601);
  assert.equal(mapa.get('Q1'), 5);
});

test('AC-9: a tentativa 41 não é enviada e vira teto-wdqs', async () => {
  let chamadas = 0;
  const fetch = async () => { chamadas += 1; return resposta([]); };
  await assert.rejects(
    consultarP4947(qidsDe(41 * 300), base({ fetch })),
    (e) => e instanceof ErroBuild && e.invariante === 'teto-wdqs',
  );
  assert.equal(chamadas, 40);
});

test('AC-9: cada tentativa leva o sinal de 55.000 ms e o lote que nunca responde é abortado', async () => {
  const pedidos = [];
  const criarSinal = (ms) => { pedidos.push(ms); return AbortSignal.abort(); };
  const fetch = (url, { signal }) => new Promise((_, rejeitar) => {
    if (signal.aborted) rejeitar(new Error('abortado'));
    signal.addEventListener('abort', () => rejeitar(new Error('abortado')));
  });
  await assert.rejects(consultarP4947(['Q1'], base({ fetch, criarSinal })), (e) => e instanceof ErroBuild && e.lote === 'p4947-1');
  assert.deepEqual(pedidos, [55000, 55000, 55000]);
});

test('AC-9: o gancho antesDeEnviar interrompe sem ser engolido pelas tentativas', async () => {
  let chamadas = 0;
  const fatal = new ErroBuild('prazo', { invariante: 'prazo' });
  await assert.rejects(
    consultarP4947(['Q1'], base({ fetch: async () => { chamadas += 1; return resposta([]); }, antesDeEnviar: () => { throw fatal; } })),
    (e) => e === fatal,
  );
  assert.equal(chamadas, 0);
});

test('AC-2: requisição leva User-Agent com o contato', async () => {
  let ua;
  await consultarP4947(['Q1'], base({ fetch: async (url, init) => { ua = init.headers['User-Agent']; return resposta([]); } }));
  assert.match(ua, /filmelier-build/);
  assert.ok(ua.includes(CONTATO));
});
