import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consultarWdqs, montarUserAgent, ErroBuild } from '../scripts/lib/wdqs.mjs';

function resposta(status, corpo = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => corpo };
}

test('AC-13: HTTP 504 gera 3 chamadas, 2 esperas e rejeição com o nome do lote', async () => {
  let chamadas = 0;
  const esperas = [];
  const fetchSimulado = async () => {
    chamadas += 1;
    return resposta(504);
  };
  await assert.rejects(
    consultarWdqs('SELECT 1', {
      fetch: fetchSimulado,
      esperar: async (ms) => esperas.push(ms),
      userAgent: 'filmelier-build/0.1 (+teste@example.org)',
      lote: 'lote-1990-1994',
    }),
    (erro) => {
      assert.ok(erro instanceof ErroBuild);
      assert.equal(erro.lote, 'lote-1990-1994');
      assert.match(erro.message, /lote-1990-1994/);
      return true;
    },
  );
  assert.equal(chamadas, 3);
  assert.deepEqual(esperas, [5000, 10000]);
});

test('AC-13: erro de rede também conta como tentativa e a 2ª pode responder', async () => {
  let chamadas = 0;
  const r = await consultarWdqs('SELECT 1', {
    fetch: async () => {
      chamadas += 1;
      if (chamadas === 1) throw new Error('Connection reset');
      return resposta(200, { results: { bindings: [] } });
    },
    esperar: async () => {},
    userAgent: 'ua',
    lote: 'x',
  });
  assert.equal(chamadas, 2);
  assert.deepEqual(r.dados, { results: { bindings: [] } });
  assert.equal(typeof r.duracaoMs, 'number');
});

test('AC-13: envia o User-Agent e o Accept esperados', async () => {
  let cabecalhos;
  await consultarWdqs('SELECT 1', {
    fetch: async (url, opcoes) => {
      cabecalhos = opcoes.headers;
      assert.match(String(url), /^https:\/\/query\.wikidata\.org\/sparql\?/);
      return resposta(200, {});
    },
    esperar: async () => {},
    userAgent: montarUserAgent('https://example.org/contato'),
    lote: 'x',
  });
  assert.equal(cabecalhos['User-Agent'], 'filmelier-build/0.1 (+https://example.org/contato)');
  assert.equal(cabecalhos.Accept, 'application/sparql-results+json');
});

test('AC-13: User-Agent com contato URL', () => {
  assert.equal(montarUserAgent('https://example.org/contato'), 'filmelier-build/0.1 (+https://example.org/contato)');
  assert.equal(montarUserAgent('teste@example.org'), 'filmelier-build/0.1 (+teste@example.org)');
});

test('AC-13 (N-8): contato sem @ e sem http é rejeitado com invariante contato', () => {
  for (const ruim of ['', undefined, '   ', 'qualquer coisa']) {
    assert.throws(() => montarUserAgent(ruim), (erro) => {
      assert.ok(erro instanceof ErroBuild);
      assert.equal(erro.invariante, 'contato');
      return true;
    });
  }
});
