// Worker de provedores (FILMELIER-3, design.md D-12): proxy do TMDB para "onde assistir no Brasil".
// Fábrica com estado injetável; os padrões só tocam fetch, setTimeout e AbortSignal dentro das funções,
// então importar o módulo no Node não faz nada. Importa só módulos relativos de worker/ (nenhum de src/).

// Limites do plano Free do Cloudflare (10 ms de CPU, 50 subrequests e 100.000 requisições por dia):
// o Worker cabe neles com no máximo 15 chamadas ao TMDB por requisição (5 QIDs x 2 finds + provedores).
const MAX_QIDS = 5;
const TIMEOUT_TMDB_MS = 3000;
const PRAZO_MS = 4000;
const TTL_S = 86400;
const LIMITE_CACHE = 2000; // teto de entradas do cache do isolate (memória de 128 MB); sai a mais antiga
const SUSPENSAO_PADRAO_S = 30;
const SUSPENSAO_MAXIMA_S = 300;

const TMDB = 'https://api.themoviedb.org/3';
const ERRO = Symbol('erro');
const LIMITE = Symbol('limite');
const CATEGORIAS = ['flatrate', 'rent', 'buy', 'ads', 'free'];

// Só results.BR; cada provedor com exatamente 4 campos. Sem BR ou sem lista com itens: sem-br.
function montarEntrada(json) {
  const br = json?.results?.BR;
  if (br === null || typeof br !== 'object') return { status: 'sem-br' };
  const entrada = { status: 'ok', link: typeof br.link === 'string' ? br.link : null };
  for (const c of CATEGORIAS) {
    entrada[c] = Array.isArray(br[c]) ? br[c].filter((p) => p !== null && typeof p === 'object').map((p) => ({
      provider_id: p.provider_id ?? null,
      provider_name: p.provider_name ?? null,
      logo_path: p.logo_path ?? null,
      display_priority: p.display_priority ?? null,
    })) : [];
  }
  return CATEGORIAS.some((c) => entrada[c].length > 0) ? entrada : { status: 'sem-br' };
}

// Título de texto não vazio de até 200 caracteres (senão omitido).
const tituloValido = (v) => typeof v === 'string' && v.trim() !== '' && v.length <= 200;

function lerTitulos(filme) {
  const t = {};
  if (tituloValido(filme.title)) t.titulo = filme.title;
  if (tituloValido(filme.original_title)) t.tituloOriginal = filme.original_title;
  return t;
}

const JSON_CABECALHO = { 'Content-Type': 'application/json' };

const origensPermitidas = (env) => String(env?.ORIGENS_PERMITIDAS ?? '').split(',').map((o) => o.trim()).filter((o) => o !== '');

// `qids`: 1 a 5 QIDs ^Q\d+$ sem repetição, obrigatório. `imdb`: opcional (vazio = ausente), pares QID:ttNNNNNNN(N)
// de QIDs presentes em `qids`, no máximo 1 vez cada. Devolve { qids, imdb: Map } ou null (400).
function lerParametros(busca) {
  const bruto = busca.get('qids');
  if (bruto === null || bruto === '') return null;
  const qids = bruto.split(',');
  if (qids.length > MAX_QIDS || qids.some((q) => !/^Q\d+$/.test(q)) || new Set(qids).size !== qids.length) return null;
  const imdb = new Map();
  const par = busca.get('imdb');
  if (par !== null && par !== '') {
    for (const item of par.split(',')) {
      const m = /^(Q\d+):(tt\d{7,8})$/.exec(item);
      if (!m || !qids.includes(m[1]) || imdb.has(m[1])) return null;
      imdb.set(m[1], m[2]);
    }
  }
  return { qids, imdb };
}

export function criarWorker({
  cache = new Map(),
  limiteCache = LIMITE_CACHE,
  agora = () => Date.now(),
  fetchImpl = (url, opcoes) => fetch(url, opcoes),
  criarSinal = (ms) => AbortSignal.timeout(ms),
  esperar = (ms) => new Promise((resolver) => { setTimeout(resolver, ms)?.unref?.(); }),
  logger = console,
} = {}) {
  let suspensoAte = 0;
  const suspenso = () => agora() < suspensoAte;

  // HTTP 429 do TMDB: suspende novas chamadas no isolate por Retry-After (inteiro de 1 a 300; acima 300;
  // 0, ausente ou inválido 30). Chamadas já disparadas seguem; nenhuma nova é feita.
  function registrar429(retryAfter) {
    const bruto = typeof retryAfter === 'string' && /^\d+$/.test(retryAfter.trim()) ? Number(retryAfter.trim()) : 0;
    const segundos = bruto > 0 ? Math.min(bruto, SUSPENSAO_MAXIMA_S) : SUSPENSAO_PADRAO_S;
    suspensoAte = Math.max(suspensoAte, agora() + segundos * 1000);
  }

  // Chamada própria ao TMDB (N7: não reutiliza buscarJson de src/). Nunca lança: { ok, status, json } (+ limite: true no 429 e na suspensão).
  async function chamarTmdb(ctx, caminho) {
    if (suspenso()) return { ok: false, limite: true, status: null, json: null };
    ctx.chamadasTmdb += 1;
    let resposta;
    try {
      resposta = await fetchImpl(`${TMDB}${caminho}`, {
        headers: { Authorization: `Bearer ${ctx.token}`, Accept: 'application/json' },
        signal: criarSinal(TIMEOUT_TMDB_MS),
      });
    } catch {
      return { ok: false, status: null, json: null };
    }
    if (resposta.status === 429) {
      registrar429(resposta.headers?.get?.('Retry-After') ?? null);
      return { ok: false, limite: true, status: 429, json: null };
    }
    if (!resposta.ok) return { ok: false, status: resposta.status, json: null };
    try {
      return { ok: true, status: resposta.status, json: await resposta.json() };
    } catch {
      return { ok: false, status: resposta.status, json: null };
    }
  }

  // Id do filme no TMDB por /find (language=pt-BR: `title` vem no título de lançamento no Brasil): número, null
  // (sem resultado), ERRO ou LIMITE. `titulos` recebe `titulo` e `tituloOriginal` válidos do mesmo resultado.
  async function acharId(ctx, referencia, fonte, titulos) {
    const r = await chamarTmdb(ctx, `/find/${referencia}?external_source=${fonte}&language=pt-BR`);
    if (r.limite) return LIMITE;
    if (!r.ok || !Array.isArray(r.json?.movie_results)) return ERRO;
    const filme = r.json.movie_results[0];
    const id = filme?.id;
    if (!Number.isInteger(id)) return null;
    Object.assign(titulos, lerTitulos(filme));
    return id;
  }

  // Resolve 1 QID: entrada `ok`, `sem-br` ou `sem-tmdb`, ou { status: 'erro' } ou { status: 'limite' }.
  async function resolverQid(ctx, qid) {
    const titulos = {};
    let id = await acharId(ctx, qid, 'wikidata_id', titulos);
    if (id === LIMITE) return { status: 'limite' };
    if (id === ERRO) return { status: 'erro' };
    const imdb = ctx.imdb.get(qid);
    if (id === null && imdb) {
      id = await acharId(ctx, imdb, 'imdb_id', titulos);
      if (id === LIMITE) return { status: 'limite' };
      if (id === ERRO) return { status: 'erro' };
    }
    if (id === null) return { status: 'sem-tmdb' };
    const r = await chamarTmdb(ctx, `/movie/${id}/watch/providers`);
    if (r.limite) return { status: 'limite' };
    if (!r.ok) return { status: 'erro' };
    return { ...montarEntrada(r.json), ...titulos };
  }

  // Cache do isolate: chave QID|IMDb informado, valor { entrada, gravadoEm }, válido por TTL_S comparado aqui.
  // Só `ok`, `sem-br` e `sem-tmdb` são guardados; `erro` nunca, e nada depois do prazo da requisição.
  async function resolverComCache(ctx, qid) {
    if (!ctx.token) return { status: 'erro' }; // sem TMDB_TOKEN nenhuma chamada é feita
    const chave = `${qid}|${ctx.imdb.get(qid) ?? ''}`;
    const guardado = cache.get(chave);
    if (guardado && agora() - guardado.gravadoEm <= TTL_S * 1000) {
      ctx.acertosCache += 1;
      return guardado.entrada;
    }
    const entrada = await resolverQid(ctx, qid);
    if (!ctx.fechado && (entrada.status === 'ok' || entrada.status === 'sem-br' || entrada.status === 'sem-tmdb')) {
      cache.delete(chave); // reinsere no fim: a ordem de inserção do Map é a ordem de idade
      cache.set(chave, { entrada, gravadoEm: agora() });
      while (cache.size > limiteCache) cache.delete(cache.keys().next().value);
    }
    return entrada;
  }

  const recusar = (status, erro, extras = {}) => new Response(JSON.stringify({ erro }), { status, headers: { ...JSON_CABECALHO, ...extras } });

  // Ordem: método (405), caminho (404), Origin (403), parâmetros (400); responde pela primeira regra violada.
  async function tratar(request, env, info) {
    if (request.method !== 'GET') return recusar(405, 'metodo', { Allow: 'GET' });
    const url = new URL(request.url);
    if (url.pathname !== '/providers') return recusar(404, 'rota');
    const origem = request.headers.get('Origin');
    if (origem === null || !origensPermitidas(env).includes(origem)) return recusar(403, 'origem');
    const cors = { 'Access-Control-Allow-Origin': origem, Vary: 'Origin', 'Access-Control-Expose-Headers': 'Retry-After' };
    const parametros = lerParametros(url.searchParams);
    if (parametros === null) return recusar(400, 'parametros', cors);
    const ctx = { token: env?.TMDB_TOKEN, imdb: parametros.imdb, chamadasTmdb: 0, acertosCache: 0, fechado: false };
    const finais = new Map();
    const trabalho = Promise.all(parametros.qids.map(async (q) => {
      const entrada = await resolverComCache(ctx, q);
      if (!ctx.fechado) finais.set(q, entrada);
    }));
    // A requisição inteira responde em até PRAZO_MS; QID sem resultado nesse prazo sai com `erro` e o que chegar
    // depois é descartado (não entra no cache).
    await Promise.race([trabalho, esperar(PRAZO_MS)]);
    ctx.fechado = true;
    const resultados = Object.fromEntries(parametros.qids.map((q) => [q, finais.get(q) ?? { status: 'erro' }]));
    info.qids = parametros.qids;
    info.status = Object.fromEntries(parametros.qids.map((q) => [q, resultados[q].status]));
    info.acertosCache = ctx.acertosCache;
    info.chamadasTmdb = ctx.chamadasTmdb;
    const corpo = { resultados };
    if (suspenso()) corpo.retryAfter = Math.ceil((suspensoAte - agora()) / 1000);
    return new Response(JSON.stringify(corpo), { status: 200, headers: { ...JSON_CABECALHO, ...cors } });
  }

  // Exceção não tratada: 500 genérico (nada da exceção sai) e, para origem permitida, os cabeçalhos CORS, para o
  // navegador ler o status em vez de ver falha de rede. Sem origem permitida (ou se ler as origens também falhar), sem CORS.
  function erroInterno(request, env) {
    let cors = {};
    try {
      const origem = request.headers.get('Origin');
      if (origem !== null && origensPermitidas(env).includes(origem)) {
        cors = { 'Access-Control-Allow-Origin': origem, Vary: 'Origin', 'Access-Control-Expose-Headers': 'Retry-After' };
      }
    } catch {
      cors = {};
    }
    return recusar(500, 'interno', cors);
  }

  // 1 linha JSON por requisição, em todas as saídas. Só contagens e status: nunca token, IP, Origin, cookie nem
  // corpo do TMDB (o Worker não lê esses cabeçalhos para decidir a resposta).
  async function atender(request, env) {
    const inicio = agora();
    const info = { qids: [], status: {}, acertosCache: 0, chamadasTmdb: 0 };
    let resposta;
    try {
      resposta = await tratar(request, env, info);
    } catch {
      resposta = erroInterno(request, env);
    }
    logger.log(JSON.stringify({
      http: resposta.status, qids: info.qids, status: info.status,
      acertosCache: info.acertosCache, chamadasTmdb: info.chamadasTmdb, duracaoMs: agora() - inicio,
    }));
    return resposta;
  }

  return { fetch: (request, env) => atender(request, env) };
}

// Um estado (cache, suspensão) por isolate.
export default criarWorker();
