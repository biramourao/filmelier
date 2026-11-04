import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { criarSessaoLista } from '../src/lista.mjs';
import { criarEnriquecedor } from '../src/enriquecer.mjs';
import { criarProvedores } from '../src/provedores.mjs';
import { listarGeneros } from '../src/recomendar.mjs';

const generos = listarGeneros(JSON.parse(readFileSync(new URL('../data/humores.json', import.meta.url), 'utf8')));
const WORKER = 'https://filmelier-provedores.exemplo.workers.dev';
const HOST_WORKER = 'filmelier-provedores.exemplo.workers.dev';
const mudo = { warn() {}, error() {} };

const filmes = (...qids) => qids.map((qid) => ({ qid, titulo: `Titulo ${qid}`, ano: 2000, generos: ['Q130232'], sitelinks: 10, imdb: 'tt0120338' }));
const resposta = (corpo, { status = 200, headers = {} } = {}) => ({
  ok: status >= 200 && status < 300, status, headers: { get: (n) => headers[n] ?? null }, json: async () => corpo,
});
const CINCO_A = ['Q11', 'Q12', 'Q13', 'Q14', 'Q15'];
const CINCO_B = ['Q21', 'Q22', 'Q23', 'Q24', 'Q25'];

// Ambiente com 1 fetchImpl que conta chamadas por host e relógio compartilhado. `falhas` decide respostas especiais.
function ambiente({ aoWorker, aoWikidata, aoWikipedia } = {}) {
  let t = 1_000_000;
  const agora = () => t;
  const hosts = new Map();
  const urls = [];
  const fetchImpl = async (url) => {
    const u = new URL(url);
    const chave = u.host === 'www.wikidata.org' ? 'wikidata' : u.host === HOST_WORKER ? 'worker' : u.host.endsWith('wikipedia.org') ? 'wikipedia' : u.host;
    hosts.set(chave, (hosts.get(chave) ?? 0) + 1);
    urls.push(url);
    if (chave === 'worker') {
      const qids = u.searchParams.get('qids').split(',');
      const especial = aoWorker?.(qids);
      if (especial) return especial;
      return resposta({ resultados: Object.fromEntries(qids.map((q) => [q, { status: 'sem-br' }])) });
    }
    if (chave === 'wikidata') {
      const ids = u.searchParams.get('ids').split('|');
      return aoWikidata?.(ids) ?? resposta({ entities: Object.fromEntries(ids.map((q) => [q, { id: q, sitelinks: { ptwiki: { title: `Art ${q}` } } }])) });
    }
    const titulo = decodeURIComponent(u.pathname.split('/').pop());
    return aoWikipedia?.(titulo) ?? resposta({
      extract: `Sinopse ${titulo}`,
      content_urls: { desktop: { page: `https://pt.wikipedia.org/wiki/${titulo}` } },
    });
  };
  const enriquecedor = criarEnriquecedor({ fetchImpl, agora, logger: mudo });
  const provedores = criarProvedores({ urlWorker: WORKER, fetchImpl, agora, logger: mudo });
  const sessao = criarSessaoLista({ enriquecedor, generos, provedores, aoAtualizar: () => {}, aoProvedores: () => {} });
  const recomendar = async (qids) => {
    const r = sessao.exibir({ filmes: filmes(...qids) });
    await Promise.all([r.concluido, r.concluidoProvedores]);
  };
  const contar = () => ({ worker: hosts.get('worker') ?? 0, wikidata: hosts.get('wikidata') ?? 0, wikipedia: hosts.get('wikipedia') ?? 0 });
  return { recomendar, contar, avancar: (s) => { t += s * 1000; }, urls };
}

test('AC-14: recomendação nova sem suspensão faz 1 chamada ao Worker, 1 ao Wikidata e até 5 à Wikipédia', async () => {
  const a = ambiente();
  await a.recomendar(CINCO_A);
  const c = a.contar();
  assert.equal(c.worker, 1);
  assert.equal(c.wikidata, 1);
  assert.ok(c.wikipedia >= 1 && c.wikipedia <= 5);
});

test('AC-12: Worker suspenso não suspende a Wikimedia (1 chamada ao Wikidata e até 5 à Wikipédia, 0 ao Worker)', async () => {
  const a = ambiente({ aoWorker: () => resposta({ resultados: {}, retryAfter: 24 }) });
  await a.recomendar(['Q1']);
  const antes = a.contar();
  assert.equal(antes.worker, 1);
  a.avancar(10);
  await a.recomendar(CINCO_B);
  const depois = a.contar();
  assert.equal(depois.worker, antes.worker, '0 chamadas novas ao Worker');
  assert.equal(depois.wikidata - antes.wikidata, 1);
  const wikipedia = depois.wikipedia - antes.wikipedia;
  assert.ok(wikipedia >= 1 && wikipedia <= 5, String(wikipedia));
});

test('AC-12: 429 do Wikidata não suspende o Worker (0 chamadas à Wikimedia e exatamente 1 ao Worker)', async () => {
  let primeira = true;
  const a = ambiente({ aoWikidata: () => { if (primeira) { primeira = false; return resposta({}, { status: 429, headers: { 'Retry-After': '24' } }); } return null; } });
  await a.recomendar(CINCO_A);
  const antes = a.contar();
  a.avancar(10);
  await a.recomendar(CINCO_B);
  const depois = a.contar();
  assert.equal(depois.wikidata - antes.wikidata, 0);
  assert.equal(depois.wikipedia - antes.wikipedia, 0);
  assert.equal(depois.worker - antes.worker, 1);
});

test('AC-12: 429 da Wikipédia não suspende o Worker (0 chamadas à Wikimedia e exatamente 1 ao Worker)', async () => {
  let primeira = true;
  const a = ambiente({ aoWikipedia: () => { if (primeira) { primeira = false; return resposta({}, { status: 429, headers: { 'Retry-After': '24' } }); } return null; } });
  await a.recomendar(CINCO_A);
  const antes = a.contar();
  a.avancar(10);
  await a.recomendar(CINCO_B);
  const depois = a.contar();
  assert.equal(depois.wikidata - antes.wikidata, 0);
  assert.equal(depois.wikipedia - antes.wikipedia, 0);
  assert.equal(depois.worker - antes.worker, 1);
  assert.deepEqual(new URL(a.urls.filter((u) => new URL(u).host === HOST_WORKER).at(-1)).searchParams.get('qids').split(','), CINCO_B);
});
