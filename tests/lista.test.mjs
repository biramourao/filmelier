import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { criarSessaoLista } from '../src/lista.mjs';
import { criarEnriquecedor } from '../src/enriquecer.mjs';
import { listarGeneros } from '../src/recomendar.mjs';

const tabela = JSON.parse(readFileSync(new URL('../data/humores.json', import.meta.url), 'utf8'));
const generos = listarGeneros(tabela);
const CAPA = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Exemplo.jpg';

const filmes = (...qids) => qids.map((qid) => ({ qid, titulo: `Titulo ${qid}`, ano: 2000, generos: ['Q130232'], sitelinks: 10 }));
const resposta = (corpo) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => corpo });
const wikidata = (qids) => resposta({ entities: Object.fromEntries(qids.map((q) => [q, { id: q, sitelinks: { ptwiki: { title: `Art ${q}` } } }])) });
const resumo = (titulo) => resposta({
  extract: `Sinopse ${titulo}`,
  thumbnail: { source: CAPA },
  content_urls: { desktop: { page: `https://pt.wikipedia.org/wiki/${titulo.replaceAll(' ', '_')}` } },
});

// Rede cujas respostas só saem quando o teste libera.
function redeManual() {
  const pendentes = [];
  const fetchImpl = (url) => new Promise((resolve) => pendentes.push({ url, resolve }));
  const liberar = async () => {
    // Libera em rodadas: o Wikidata primeiro, depois os resumos que ele dispara.
    for (let rodada = 0; rodada < 3; rodada += 1) {
      await new Promise((r) => setImmediate(r));
      while (pendentes.length) {
        const { url, resolve } = pendentes.shift();
        const u = new URL(url);
        resolve(u.host === 'www.wikidata.org' ? wikidata(u.searchParams.get('ids').split('|')) : resumo(decodeURIComponent(u.pathname.split('/').pop()).replaceAll(' ', '_').replaceAll('_', ' ')));
      }
    }
  };
  return { fetchImpl, liberar, pendentes };
}

const loggerMudo = { warn() {}, error() {} };

test('AC-14: o modelo da lista sai completo e síncrono mesmo com fetch que nunca resolve', () => {
  const enriquecedor = criarEnriquecedor({ fetchImpl: () => new Promise(() => {}), logger: loggerMudo });
  const sessao = criarSessaoLista({ enriquecedor, generos, aoAtualizar: () => assert.fail('não deveria atualizar') });
  const { cards } = sessao.exibir({ filmes: filmes('Q1', 'Q2', 'Q3') });
  assert.equal(cards.length, 3);
  for (const c of cards) {
    assert.ok(c.titulo && c.ano && c.generos.length >= 1 && c.links.length >= 1);
    assert.equal(c.placeholder, true);
    assert.equal(c.capa, null);
  }
});

test('AC-14: aoAtualizar recebe os cards enriquecidos quando as respostas chegam', { timeout: 5000 }, async () => {
  const rede = redeManual();
  const recebidos = [];
  const enriquecedor = criarEnriquecedor({ fetchImpl: rede.fetchImpl, logger: loggerMudo });
  const sessao = criarSessaoLista({ enriquecedor, generos, aoAtualizar: (cards) => recebidos.push(cards) });
  const { concluido } = sessao.exibir({ filmes: filmes('Q1', 'Q2') });
  await rede.liberar();
  await concluido;
  assert.equal(recebidos.length, 1);
  assert.equal(recebidos[0][0].capa.src, CAPA);
  assert.equal(recebidos[0][0].sinopse, 'Sinopse Art Q1');
});

test('AC-9: respostas de A liberadas depois de B não chegam ao modelo B, mas entram no cache', { timeout: 5000 }, async () => {
  const rede = redeManual();
  const recebidos = [];
  const enriquecedor = criarEnriquecedor({ fetchImpl: rede.fetchImpl, logger: loggerMudo });
  const sessao = criarSessaoLista({ enriquecedor, generos, aoAtualizar: (cards) => recebidos.push(cards.map((c) => c.titulo)) });
  const a = sessao.exibir({ filmes: filmes('Q1', 'Q2') });
  const b = sessao.exibir({ filmes: filmes('Q3') });
  assert.ok(b.geracao > a.geracao);
  await rede.liberar();
  await Promise.all([a.concluido, b.concluido]);
  assert.deepEqual(recebidos, [['Titulo Q3']]);
  for (const q of ['Q1', 'Q2']) {
    assert.ok(enriquecedor.cache.titulos.has(q), q);
    assert.ok(enriquecedor.cache.resumos.has(q), q);
  }
});

test('AC-9: troca de humor (invalidar) descarta o enriquecimento em voo', { timeout: 5000 }, async () => {
  const rede = redeManual();
  const enriquecedor = criarEnriquecedor({ fetchImpl: rede.fetchImpl, logger: loggerMudo });
  let atualizacoes = 0;
  const sessao = criarSessaoLista({ enriquecedor, generos, aoAtualizar: () => { atualizacoes += 1; } });
  const { concluido } = sessao.exibir({ filmes: filmes('Q1') });
  sessao.invalidar();
  await rede.liberar();
  await concluido;
  assert.equal(atualizacoes, 0);
  assert.ok(enriquecedor.cache.resumos.has('Q1'));
});
