import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { criarSessaoLista } from '../src/lista.mjs';
import { criarEnriquecedor } from '../src/enriquecer.mjs';
import { criarProvedores } from '../src/provedores.mjs';
import { listarGeneros } from '../src/recomendar.mjs';

const tabela = JSON.parse(readFileSync(new URL('../data/humores.json', import.meta.url), 'utf8'));
const generos = listarGeneros(tabela);
const WORKER = 'https://filmelier-provedores.exemplo.workers.dev';
const CAPA = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Exemplo.jpg';
const mudo = { warn() {}, error() {} };

const filmes = (...qids) => qids.map((qid) => ({ qid, titulo: `Titulo ${qid}`, ano: 2000, generos: ['Q130232'], sitelinks: 10, imdb: 'tt0120338' }));
const resposta = (corpo) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => corpo });
const wikidata = (qids) => resposta({ entities: Object.fromEntries(qids.map((q) => [q, { id: q, sitelinks: { ptwiki: { title: `Art ${q}` } } }])) });
const resumo = (titulo) => resposta({
  extract: `Sinopse ${titulo}`,
  thumbnail: { source: CAPA },
  content_urls: { desktop: { page: `https://pt.wikipedia.org/wiki/${titulo.replaceAll(' ', '_')}` } },
});
const lote = (url) => resposta({
  resultados: Object.fromEntries(new URL(url).searchParams.get('qids').split(',').map((q) => [q, {
    status: 'ok', link: 'https://www.themoviedb.org/movie/1/watch?locale=BR',
    flatrate: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/n.jpg', display_priority: 1 }], rent: [], buy: [], ads: [], free: [],
  }])),
});

// Fetch da Wikimedia que só responde depois de `liberar()`.
function wikimediaManual() {
  let abrir;
  const portao = new Promise((r) => { abrir = r; });
  const fetchImpl = async (url) => {
    await portao;
    const u = new URL(url);
    return u.host === 'www.wikidata.org' ? wikidata(u.searchParams.get('ids').split('|')) : resumo(decodeURIComponent(u.pathname.split('/').pop()).replaceAll('_', ' '));
  };
  return { fetchImpl, liberar: abrir };
}

// Fetch do Worker que só responde depois de `liberar()`; guarda as chamadas.
function workerManual() {
  let abrir;
  const portao = new Promise((r) => { abrir = r; });
  const chamadas = [];
  const fetchImpl = async (url) => {
    chamadas.push(url);
    await portao;
    return lote(url);
  };
  return { fetchImpl, liberar: abrir, chamadas };
}

const qidsDe = (url) => new URL(url).searchParams.get('qids').split(',');
const sessaoCom = (wm, wk, extras = {}) => {
  const enriquecedor = criarEnriquecedor({ fetchImpl: wm.fetchImpl, logger: mudo });
  const provedores = criarProvedores({ urlWorker: WORKER, fetchImpl: wk.fetchImpl, logger: mudo });
  const chamadas = { enriq: [], prov: [] };
  const sessao = criarSessaoLista({
    enriquecedor, generos, provedores,
    aoAtualizar: (cards, g) => chamadas.enriq.push({ cards, g }),
    aoProvedores: (cards, g) => chamadas.prov.push({ cards, g }),
    ...extras,
  });
  return { sessao, chamadas, provedores };
};

test('AC-7: modelo síncrono com Worker que nunca responde já tem título, ano, gêneros, links e "Buscando onde assistir no Brasil"', () => {
  const enriquecedor = criarEnriquecedor({ fetchImpl: () => new Promise(() => {}), logger: mudo });
  const provedores = criarProvedores({ urlWorker: WORKER, fetchImpl: () => new Promise(() => {}), logger: mudo });
  const sessao = criarSessaoLista({ enriquecedor, generos, provedores, aoAtualizar: () => assert.fail('enriquecimento'), aoProvedores: () => assert.fail('provedores') });
  const { cards } = sessao.exibir({ filmes: filmes('Q1', 'Q2', 'Q3') });
  assert.equal(cards.length, 3);
  for (const c of cards) {
    assert.ok(c.titulo && c.ano && c.generos.length >= 1 && c.links.length >= 1);
    assert.equal(c.provedores.estado, 'buscando');
    assert.equal(c.provedores.texto, 'Buscando onde assistir no Brasil');
  }
});

test('AC-7: A em voo e B iniciada: a resposta de A não chega a B e entra no cache', { timeout: 5000 }, async () => {
  const wm = wikimediaManual();
  const wk = workerManual();
  const { sessao, chamadas, provedores } = sessaoCom(wm, wk);
  const a = sessao.exibir({ filmes: filmes('Q1', 'Q2') });
  const b = sessao.exibir({ filmes: filmes('Q3', 'Q4') });
  wk.liberar();
  wm.liberar();
  await Promise.all([a.concluidoProvedores, b.concluidoProvedores, a.concluido, b.concluido]);
  assert.equal(chamadas.prov.length, 1);
  assert.equal(chamadas.prov[0].g, b.geracao);
  for (const c of chamadas.prov[0].cards) assert.equal(c.provedores.estado, 'com-dados');
  assert.deepEqual(chamadas.prov[0].cards.map((c) => c.titulo), ['Titulo Q3', 'Titulo Q4']);
  assert.ok(chamadas.enriq.every((x) => x.g === b.geracao));
  for (const q of ['Q1', 'Q2', 'Q3', 'Q4']) assert.equal(provedores.cache.get(q).status, 'ok');
  assert.deepEqual(wk.chamadas.flatMap(qidsDe).sort(), ['Q1', 'Q2', 'Q3', 'Q4']);
});

test('AC-7: provedores antes ou depois do enriquecimento dão o mesmo último modelo', { timeout: 5000 }, async () => {
  const ultimos = [];
  for (const provedoresPrimeiro of [true, false]) {
    const wm = wikimediaManual();
    const wk = workerManual();
    const { sessao, chamadas } = sessaoCom(wm, wk);
    const r = sessao.exibir({ filmes: filmes('Q1', 'Q2') });
    if (provedoresPrimeiro) { wk.liberar(); await r.concluidoProvedores; wm.liberar(); await r.concluido; } else { wm.liberar(); await r.concluido; wk.liberar(); await r.concluidoProvedores; }
    const todos = [...chamadas.enriq.map((x) => ({ ...x, ordem: 'e' })), ...chamadas.prov.map((x) => ({ ...x, ordem: 'p' }))];
    assert.equal(todos.length, 2);
    const ultimo = provedoresPrimeiro ? chamadas.enriq.at(-1) : chamadas.prov.at(-1);
    ultimos.push(JSON.stringify(ultimo.cards));
    for (const c of ultimo.cards) {
      assert.ok(c.capa && c.sinopse, 'capa e sinopse');
      assert.equal(c.provedores.estado, 'com-dados');
    }
  }
  assert.equal(ultimos[0], ultimos[1]);
});

test('AC-15: sessão sem provedores nunca chama aoProvedores e mantém o comportamento da FILMELIER-2', async () => {
  const enriquecedor = criarEnriquecedor({ fetchImpl: () => new Promise(() => {}), logger: mudo });
  const sessao = criarSessaoLista({ enriquecedor, generos, aoAtualizar: () => assert.fail('não deveria atualizar'), aoProvedores: () => assert.fail('provedores') });
  const { cards, concluidoProvedores } = sessao.exibir({ filmes: filmes('Q1') });
  assert.equal(cards[0].provedores, null);
  assert.equal(await Promise.race([concluidoProvedores, Promise.resolve('imediato')]), undefined);
});

test('AC-15: provedores desligado (URL vazia) também mantém provedores nulo no modelo', () => {
  const enriquecedor = criarEnriquecedor({ fetchImpl: () => new Promise(() => {}), logger: mudo });
  const provedores = criarProvedores({ urlWorker: '', fetchImpl: () => assert.fail('rede'), logger: mudo });
  const sessao = criarSessaoLista({ enriquecedor, generos, provedores, aoAtualizar: () => {}, aoProvedores: () => assert.fail('provedores') });
  assert.equal(sessao.exibir({ filmes: filmes('Q1') }).cards[0].provedores, null);
});
