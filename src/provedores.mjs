// Cliente do Worker de provedores (FILMELIER-3, design.md D-2 a D-9): "onde assistir no Brasil".
// Sem DOM; fetch, relógio, sinal de timeout e logger são injetados.

import { buscarJson } from './wikimedia.mjs';

// Aceita só URL https igual à própria origem (sem caminho, barra final, query, fragmento nem credenciais).
export function validarUrlWorker(valor) {
  if (typeof valor !== 'string' || valor === '') return false;
  try {
    const url = new URL(valor);
    return url.protocol === 'https:' && url.origin === valor;
  } catch {
    return false;
  }
}

const IMDB = /^tt\d{7,8}$/;

// GET {worker}/providers?qids=Q1,Q2&imdb=Q1:tt... (design D-3). `filmes` = [{ qid, imdb }]; imdb só com par válido.
// FILMELIER-6 (D-6): com tipo 'serie' a URL ganha, depois de qids e imdb, `tipo=serie` e `tmdb` (o ID de TV de cada item,
// na ordem de `qids`; `itens` = [{ qid, imdb, tmdb }]). Com 'filme' (padrão) o código é o de sempre.
export function montarUrlLote(urlWorker, filmes, tipo = 'filme') {
  const params = new URLSearchParams();
  params.set('qids', filmes.map((fi) => fi.qid).join(','));
  const pares = filmes.filter((fi) => typeof fi.imdb === 'string' && IMDB.test(fi.imdb)).map((fi) => `${fi.qid}:${fi.imdb}`);
  if (pares.length > 0) params.set('imdb', pares.join(','));
  if (tipo === 'serie') {
    params.set('tipo', 'serie');
    params.set('tmdb', filmes.map((fi) => fi.tmdb).join(','));
  }
  return `${urlWorker}/providers?${params.toString()}`;
}

// ID de TV do TMDB: inteiro positivo.
const tmdbValido = (fi) => Number.isInteger(fi?.tmdb) && fi.tmdb > 0;

const SUSPENSAO_PADRAO_S = 30;
const SUSPENSAO_MAXIMA_S = 300;
const CATEGORIAS = ['flatrate', 'rent', 'buy', 'ads', 'free'];

const INVALIDO = Symbol('invalido');

// `titulo` (pt-BR) e `tituloOriginal`: só texto, aparado, não vazio e de até 200 caracteres; senão omitidos.
function lerTitulos(valor) {
  const t = {};
  for (const campo of ['titulo', 'tituloOriginal']) {
    const v = typeof valor[campo] === 'string' ? valor[campo].trim() : '';
    if (v !== '' && v.length <= 200) t[campo] = v;
  }
  return t;
}

// Entrada do Worker para 1 QID -> entrada normalizada, null (erro ou limite, estados válidos sem dados)
// ou INVALIDO (ausente, não objeto, status desconhecido, categoria que não é array).
function lerEntrada(valor) {
  if (valor === null || typeof valor !== 'object') return INVALIDO;
  if (valor.status === 'sem-br' || valor.status === 'sem-tmdb') return { status: valor.status, ...lerTitulos(valor) };
  if (valor.status === 'erro' || valor.status === 'limite') return null;
  if (valor.status !== 'ok') return INVALIDO;
  const entrada = { status: 'ok', link: typeof valor.link === 'string' ? valor.link : null, ...lerTitulos(valor) };
  for (const c of CATEGORIAS) {
    if (valor[c] === undefined) { entrada[c] = []; continue; }
    if (!Array.isArray(valor[c])) return INVALIDO;
    entrada[c] = valor[c].filter(provedorValido).map(normalizarProvedor);
  }
  return entrada;
}

// Provedor sem provider_name texto não vazio ou sem provider_id inteiro é descartado sozinho (D-6, N5).
function provedorValido(p) {
  return p !== null && typeof p === 'object' && typeof p.provider_name === 'string' && p.provider_name !== ''
    && Number.isInteger(p.provider_id);
}

const normalizarProvedor = (p) => ({
  provider_id: p.provider_id,
  provider_name: p.provider_name,
  logo_path: typeof p.logo_path === 'string' ? p.logo_path : null,
  display_priority: typeof p.display_priority === 'number' && Number.isFinite(p.display_priority) ? p.display_priority : null,
});

// Cliente do Worker: cache da aba e chamadas em voo (D-5). `buscar(filmes)` sempre resolve (nunca rejeita)
// com Map QID -> entrada normalizada ou null (sem dados). `filmes` = [{ qid, imdb }] (em série, + `tmdb`: o item sem
// `tmdb` inteiro positivo não entra no lote e resolve null; sem nenhum item com `tmdb`, 0 chamadas).
export function criarProvedores({
  urlWorker,
  fetchImpl,
  agora = () => Date.now(),
  criarSinal = (ms) => AbortSignal.timeout(ms),
  logger = console,
  timeoutMs = 5000,
  tipo = 'filme',
} = {}) {
  const ativo = avaliarUrlWorker(urlWorker, logger);
  const cache = new Map();
  const emVoo = new Map(); // QID -> promessa do lote que o inclui
  let suspensoAte = 0;

  const suspenso = () => agora() < suspensoAte;

  // Mesma normalização de src/enriquecer.mjs (D-7), duplicada para não alterar função existente:
  // inteiro de 1 a 300; acima 300; 0, ausente ou inválido 30.
  function registrarSuspensao(retryAfter) {
    const bruto = typeof retryAfter === 'number' ? String(retryAfter) : retryAfter;
    const valido = typeof bruto === 'string' && /^\d+$/.test(bruto.trim()) ? Number(bruto.trim()) : 0;
    const segundos = valido > 0 ? Math.min(valido, SUSPENSAO_MAXIMA_S) : SUSPENSAO_PADRAO_S;
    suspensoAte = Math.max(suspensoAte, agora() + segundos * 1000);
    logger.warn(`[filmelier] limite de uso do Worker de provedores: chamadas suspensas por ${segundos} s`);
  }

  async function consultarLote(filmes) {
    const resultado = new Map(filmes.map((fi) => [fi.qid, null]));
    const r = await buscarJson(montarUrlLote(urlWorker, filmes, tipo), { fetchImpl, criarSinal, timeoutMs });
    const qids = filmes.map((fi) => fi.qid);
    if (!r.ok) {
      logger.warn('[filmelier] provedores falhou', { fonte: 'provedores', qids, motivo: r.motivo });
      if (r.status === 429) registrarSuspensao(r.retryAfter);
      return resultado;
    }
    if (r.json === null || typeof r.json !== 'object' || typeof r.json.resultados !== 'object' || r.json.resultados === null) {
      logger.warn('[filmelier] provedores falhou', { fonte: 'provedores', qids, motivo: 'formato' });
      return resultado;
    }
    // retryAfter no corpo de um 200: os resultados definitivos do mesmo corpo valem e vão ao cache.
    if (r.json.retryAfter !== undefined && r.json.retryAfter !== null) registrarSuspensao(r.json.retryAfter);
    const invalidos = [];
    for (const fi of filmes) {
      const entrada = lerEntrada(Object.hasOwn(r.json.resultados, fi.qid) ? r.json.resultados[fi.qid] : undefined);
      if (entrada === INVALIDO) invalidos.push(fi.qid);
      else if (entrada) {
        cache.set(fi.qid, entrada);
        resultado.set(fi.qid, entrada);
      }
    }
    if (invalidos.length > 0) {
      logger.warn('[filmelier] provedores falhou', { fonte: 'provedores', qids: invalidos, motivo: 'formato' });
    }
    return resultado;
  }

  async function buscar(filmes) {
    const todos = [...new Map(filmes.map((fi) => [fi.qid, fi])).values()];
    const resposta = new Map(todos.map((fi) => [fi.qid, null]));
    if (!ativo) return resposta;
    const unicos = tipo === 'serie' ? todos.filter(tmdbValido) : todos;
    // Suspenso: nenhum lote novo; o cache e as chamadas já em voo ainda valem.
    const novos = suspenso() ? [] : unicos.filter((fi) => !cache.has(fi.qid) && !emVoo.has(fi.qid));
    const esperar = new Set(unicos.filter((fi) => !cache.has(fi.qid) && emVoo.has(fi.qid)).map((fi) => emVoo.get(fi.qid)));
    if (novos.length > 0) {
      const p = consultarLote(novos).finally(() => novos.forEach((fi) => emVoo.delete(fi.qid)));
      novos.forEach((fi) => emVoo.set(fi.qid, p));
      esperar.add(p);
    }
    const lotes = await Promise.all(esperar);
    for (const fi of unicos) {
      if (cache.has(fi.qid)) { resposta.set(fi.qid, cache.get(fi.qid)); continue; }
      for (const lote of lotes) if (lote.get(fi.qid)) resposta.set(fi.qid, lote.get(fi.qid));
    }
    return resposta;
  }

  return { ativo, buscar, cache, suspensoAte: () => suspensoAte };
}

const ROTULOS = [
  { chave: 'flatrate', rotulo: 'Assinatura', origem: ['flatrate'] },
  { chave: 'rent', rotulo: 'Aluguel', origem: ['rent'] },
  { chave: 'buy', rotulo: 'Compra', origem: ['buy'] },
  { chave: 'ads', rotulo: 'Grátis com anúncios', origem: ['ads', 'free'] },
];

const LOGO_PATH = /^\/[A-Za-z0-9_-]+\.(png|jpg|jpeg|svg)$/;

// Imagem só para logo_path no formato esperado; qualquer outro vira nome em texto (null). w92 exibido a 46 px (2x).
function montarLogo(p) {
  if (typeof p.logo_path !== 'string' || !LOGO_PATH.test(p.logo_path)) return null;
  return {
    src: `https://image.tmdb.org/t/p/w92${p.logo_path}`,
    alt: p.provider_name, width: 46, height: 46, loading: 'lazy', referrerPolicy: 'no-referrer',
  };
}

const prioridade = (p) => (typeof p.display_priority === 'number' ? p.display_priority : Infinity);

// Deduplica por provider_id (fica o de menor prioridade) e ordena por prioridade crescente, estável.
function ordenarProvedores(lista) {
  const melhor = new Map();
  for (const p of lista) {
    const atual = melhor.get(p.provider_id);
    if (!atual || prioridade(p) < prioridade(atual)) melhor.set(p.provider_id, p);
  }
  return [...melhor.values()].map((p, i) => ({ p, i })).sort((a, b) => {
    const d = prioridade(a.p) - prioridade(b.p);
    return Number.isNaN(d) || d === 0 ? a.i - b.i : d;
  }).map(({ p }) => p);
}

// Entrada de um QID que já resolveu sem dados (montarCard distingue de `null`, recurso desligado).
export const SEM_ENTRADA = Object.freeze({ status: 'sem-dados' });

const TEXTO_BUSCANDO = 'Buscando onde assistir no Brasil';
const TEXTO_SEM_DADOS = 'Sem dados de onde assistir no Brasil';
const TEXTO_ATRIBUICAO = 'Onde assistir: JustWatch via TMDB';
const PREFIXO_LINK = 'https://www.themoviedb.org/';

// Modelo puro da seção (design D-9). Entrada: entrada normalizada do cliente, null (sem dados) ou
// { estado: 'buscando' } (lote em andamento). Qualquer coisa que não seja `ok` com provedores vira sem dados.
export function montarSecao(entrada) {
  if (entrada?.estado === 'buscando') return { estado: 'buscando', texto: TEXTO_BUSCANDO };
  const semDados = { estado: 'sem-dados', texto: TEXTO_SEM_DADOS, categorias: [], atribuicao: null };
  if (entrada?.status !== 'ok') return semDados;
  const categorias = ROTULOS.map(({ chave, rotulo, origem }) => ({
    chave,
    rotulo,
    provedores: ordenarProvedores(origem.flatMap((o) => entrada[o] ?? [])).map((p) => ({ id: p.provider_id, nome: p.provider_name, logo: montarLogo(p) })),
  })).filter((c) => c.provedores.length > 0);
  if (categorias.length === 0) return semDados;
  const url = typeof entrada.link === 'string' && entrada.link.startsWith(PREFIXO_LINK) ? entrada.link : null;
  return { estado: 'com-dados', categorias, atribuicao: { texto: TEXTO_ATRIBUICAO, url, target: '_blank', rel: 'noopener noreferrer' } };
}

// Vazia desliga em silêncio; inválida desliga com 1 warn; válida liga. Devolve se o recurso está ativo.
export function avaliarUrlWorker(valor, logger = console) {
  if (valor === '' || valor === undefined || valor === null) return false;
  if (validarUrlWorker(valor)) return true;
  logger.warn('[filmelier] URL do Worker inválida; onde assistir desligado');
  return false;
}
