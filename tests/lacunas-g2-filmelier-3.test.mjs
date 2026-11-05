// Lacunas apontadas pela verificação por mutação do G2 da FILMELIER-3 (testes que falham sem a implementação).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarSessaoLista } from '../src/lista.mjs';
import { criarProvedores } from '../src/provedores.mjs';
import { criarWorker } from '../worker/index.mjs';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const WORKER = 'https://filmelier-provedores.exemplo.workers.dev';
const mudo = { warn() {}, error() {} };
const filme = (qid, imdb) => ({ qid, titulo: `T ${qid}`, ano: 2000, generos: [], sitelinks: 10, imdb });
const enriquecedorVazio = { enriquecer: async () => new Map() };

test('AC-4: QID com resposta nula (erro do Worker) vira card com seção "sem dados", não card sem seção', async () => {
  const provedores = { ativo: true, buscar: async (fs) => new Map(fs.map((f) => [f.qid, null])) };
  let finais = null;
  const sessao = criarSessaoLista({
    enriquecedor: enriquecedorVazio, generos: [], aoAtualizar() {}, provedores,
    aoProvedores: (cards) => { finais = cards; },
  });
  const { concluidoProvedores } = sessao.exibir({ filmes: [filme('Q1', 'tt0120338')] });
  await concluidoProvedores;
  assert.equal(finais[0].provedores.estado, 'sem-dados');
  assert.equal(finais[0].provedores.texto, 'Sem dados de onde assistir no Brasil');
});

test('AC-2: a lista repassa o imdb de cada filme ao cliente (par QID:imdb vai na URL)', async () => {
  const chamadas = [];
  const fetchImpl = async (url) => {
    chamadas.push(url);
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ resultados: {} }) };
  };
  const provedores = criarProvedores({ urlWorker: WORKER, fetchImpl, logger: mudo });
  const sessao = criarSessaoLista({
    enriquecedor: enriquecedorVazio, generos: [], aoAtualizar() {}, provedores, aoProvedores() {},
  });
  await sessao.exibir({ filmes: [filme('Q1', 'tt0120338'), filme('Q2', null)] }).concluidoProvedores;
  assert.equal(chamadas.length, 1);
  assert.equal(new URL(chamadas[0]).searchParams.get('imdb'), 'Q1:tt0120338');
});

test('AC-2: QID repetido na mesma chamada entra uma só vez no lote', async () => {
  const chamadas = [];
  const fetchImpl = async (url) => {
    chamadas.push(url);
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ resultados: {} }) };
  };
  const p = criarProvedores({ urlWorker: WORKER, fetchImpl, logger: mudo });
  await p.buscar([{ qid: 'Q1', imdb: null }, { qid: 'Q1', imdb: null }, { qid: 'Q2', imdb: null }]);
  assert.equal(new URL(chamadas[0]).searchParams.get('qids'), 'Q1,Q2');
});

// ---- Worker ----
const ORIGEM = 'http://127.0.0.1:8765';
const ENV = { ORIGENS_PERMITIDAS: `${ORIGEM},http://192.168.18.227:8765`, TMDB_TOKEN: 'tok-teste-123' };
const mudo2 = { log() {}, warn() {}, error() {} };
const pedirW = (w, caminho, origem = ORIGEM) => w.fetch(new Request(`https://w.exemplo.workers.dev${caminho}`, { headers: origem === null ? {} : { Origin: origem } }), ENV);
const resp = (status, corpo) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => corpo });
const ticks = async (n = 8) => { for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r)); };
const OK_BR = { results: { BR: { link: 'https://www.themoviedb.org/movie/597/watch?locale=BR', flatrate: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/n.jpg', display_priority: 1 }] } } };

test('AC-9: Origin que só começa por uma origem permitida, ou com barra final, é 403', async () => {
  let chamadas = 0;
  const w = criarWorker({ fetchImpl: async () => { chamadas += 1; return resp(404, {}); }, logger: mudo2, esperar: () => new Promise(() => {}) });
  for (const o of [`${ORIGEM}.evil.com`, `${ORIGEM}/`, `${ORIGEM}:1`]) {
    const r = await pedirW(w, '/providers?qids=Q1', o);
    assert.equal(r.status, 403, o);
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), null);
  }
  assert.equal(chamadas, 0);
});

test('AC-11: resposta do TMDB que chega depois do prazo não entra no cache (todas as etapas liberadas)', async () => {
  let abrir;
  const portao = new Promise((r) => { abrir = r; });
  let chamadas = 0;
  const fetchImpl = async (url) => {
    chamadas += 1;
    await portao;
    return String(url).includes('/find/') ? resp(200, { movie_results: [{ id: 597 }] }) : resp(200, OK_BR);
  };
  let estourar;
  const prazo = new Promise((r) => { estourar = r; });
  let n = 0;
  const w = criarWorker({ fetchImpl, logger: mudo2, esperar: () => (n++ === 0 ? prazo : new Promise(() => {})) });
  const primeira = pedirW(w, '/providers?qids=Q1');
  await ticks();
  estourar();
  assert.deepEqual((await (await primeira).json()).resultados.Q1, { status: 'erro' });
  abrir();
  await ticks();
  assert.equal(chamadas, 2, 'find e providers terminaram depois do prazo');
  const segunda = await pedirW(w, '/providers?qids=Q1');
  assert.equal(chamadas, 4, 'o resultado tardio não foi para o cache');
  assert.equal((await segunda.json()).resultados.Q1.status, 'ok');
});

test('AC-11: falha 401 com mensagem na chamada de provedores (2ª etapa) também sai só como {"status":"erro"}', async () => {
  const fetchImpl = async (url) => (String(url).includes('/find/')
    ? resp(200, { movie_results: [{ id: 597 }] })
    : resp(401, { status_code: 7, status_message: 'Invalid API key: segredo' }));
  const w = criarWorker({ fetchImpl, logger: mudo2, esperar: () => new Promise(() => {}) });
  const r = await pedirW(w, '/providers?qids=Q1');
  const texto = await r.text();
  assert.deepEqual(JSON.parse(texto).resultados.Q1, { status: 'erro' });
  assert.ok(!texto.includes('Invalid API key') && !texto.includes('status_message'));
});

// ---- varredura de JWT no repositório inteiro (a do worker/ é só do worker/) ----
test('AC-13: nenhum JWT literal fora de .git, ledger, openspec e node_modules (src/, data/, tests/ e raiz)', () => {
  const raiz = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
  const jwt = new RegExp(['ey', 'J[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}'].join(''));
  // `.github`: o workflow só referencia segredos por expressão do Actions; tem teste próprio de token/e-mail literal.
  const fora = new Set(['.git', '.github', '.studioai', '.studio', 'openspec', 'node_modules', 'dist', '.claude']);
  const achados = [];
  const andar = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (fora.has(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) andar(p);
      else if (statSync(p).size < 5_000_000) {
        readFileSync(p, 'utf8').split('\n').forEach((l, i) => { if (jwt.test(l)) achados.push(`${p.slice(raiz.length + 1)}:${i + 1}`); });
      }
    }
  };
  andar(raiz);
  assert.deepEqual(achados, []);
});
