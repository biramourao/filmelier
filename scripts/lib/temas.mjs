// Tags de tema e clima (FILMELIER-4): deriva `tags` e `clima` de cada filme a partir das keywords do TMDB e da
// curadoria manual, sem gravar keyword bruta. Tudo que toca o mundo (fetch, espera, relógio, gravação) é injetado.

import { ErroBuild, consultarWdqs, montarUserAgent } from './wdqs.mjs';
import { TAMANHO_LOTE, PAUSA_ENTRE_LOTES_MS } from './notas.mjs';
import { MAX_BYTES } from './validar-dataset.mjs';
import { linhaDeErro } from './resumo.mjs';
import { resolve as resolverCaminho, sep } from 'node:path';

export const NIVEIS_CLIMA = Object.freeze(['leve', 'intermediario', 'sombrio']);
const REGEX_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const REGEX_QID = /^Q\d+$/;

const ehTexto = (v) => typeof v === 'string' && v !== '';

// Validação `esquema-temas` (D-7): devolve a lista de { invariante, erro }; vazia quando o esquema é válido.
export function validarTemas(tabela, humores) {
  const erro = (mensagem) => [{ invariante: 'esquema-temas', erro: mensagem }];
  const temas = tabela?.temas;
  const climas = tabela?.climas;
  if (!Array.isArray(temas) || temas.length < 40 || temas.length > 60) return erro('a tabela deve ter de 40 a 60 temas');
  if (!Array.isArray(climas) || climas.length !== NIVEIS_CLIMA.length) return erro('a tabela deve ter os 3 climas');
  if (!Array.isArray(tabela.ignorar) || !tabela.ignorar.every(ehTexto)) return erro('`ignorar` deve ser lista de textos');
  const idsClima = new Set();
  for (const c of climas) {
    if (!NIVEIS_CLIMA.includes(c?.id) || idsClima.has(c.id)) return erro(`id de clima inválido ou repetido: ${c?.id}`);
    idsClima.add(c.id);
  }
  const todasKeywords = new Set();
  const rotulos = new Set();
  const ids = new Set();
  const verificarKeywords = (dono, keywords) => {
    if (!Array.isArray(keywords) || keywords.length < 1) return `${dono} sem keywords`;
    for (const k of keywords) {
      if (!ehTexto(k) || k !== k.trim() || k !== k.toLowerCase()) return `${dono}: keyword fora do padrão (minúsculas, sem espaço nas pontas): ${k}`;
      todasKeywords.add(k);
    }
    return null;
  };
  const verificarRotulo = (dono, rotulo, keywords) => {
    if (!ehTexto(rotulo)) return `${dono} sem rótulo`;
    if (rotulos.has(rotulo)) return `rótulo repetido: ${rotulo}`;
    rotulos.add(rotulo);
    if (keywords.some((k) => k === rotulo.toLowerCase())) return `${dono}: rótulo igual a uma keyword do próprio item`;
    return null;
  };
  for (const t of temas) {
    if (typeof t?.id !== 'string' || !REGEX_ID.test(t.id)) return erro(`id de tema inválido: ${t?.id}`);
    if (ids.has(t.id)) return erro(`id de tema repetido: ${t.id}`);
    if (idsClima.has(t.id)) return erro(`id de tema igual a id de clima: ${t.id}`);
    ids.add(t.id);
    const falhaKeywords = verificarKeywords(`tema ${t.id}`, t.keywords);
    if (falhaKeywords) return erro(falhaKeywords);
    const falhaRotulo = verificarRotulo(`tema ${t.id}`, t.rotulo, t.keywords);
    if (falhaRotulo) return erro(falhaRotulo);
    if ('clima' in t && !NIVEIS_CLIMA.includes(t.clima)) return erro(`tema ${t.id}: clima inválido (${t.clima})`);
  }
  for (const c of climas) {
    const falhaKeywords = verificarKeywords(`clima ${c.id}`, c.keywords);
    if (falhaKeywords) return erro(falhaKeywords);
    const falhaRotulo = verificarRotulo(`clima ${c.id}`, c.rotulo, c.keywords);
    if (falhaRotulo) return erro(falhaRotulo);
  }
  const keywordsDeTema = new Set(temas.flatMap((t) => t.keywords));
  for (const k of tabela.ignorar) {
    if (keywordsDeTema.has(k)) return erro(`\`ignorar\` repete keyword de tema: ${k}`);
    todasKeywords.add(k);
  }
  for (const id of [...ids, ...idsClima]) {
    if (todasKeywords.has(id)) return erro(`id igual a keyword: ${id}`);
  }
  const qidsHumores = new Set((humores?.humores ?? []).flatMap((h) => (h.generos ?? []).map((g) => g.qid)));
  const gc = tabela.generosClima;
  if (typeof gc !== 'object' || gc === null || Array.isArray(gc)) return erro('`generosClima` deve ser objeto');
  for (const [qid, nivel] of Object.entries(gc)) {
    if (!REGEX_QID.test(qid) || !qidsHumores.has(qid)) return erro(`generosClima: QID fora de data/humores.json: ${qid}`);
    if (!NIVEIS_CLIMA.includes(nivel)) return erro(`generosClima: nível inválido (${nivel})`);
  }
  return [];
}

// Lança ErroBuild com o primeiro erro de esquema.
export function exigirTemasValidos(tabela, humores) {
  const erros = validarTemas(tabela, humores);
  if (erros.length > 0) throw new ErroBuild(erros[0].erro, { invariante: erros[0].invariante });
}

export const normalizarKeyword = (k) => String(k).trim().toLowerCase();

const ORDEM_CLIMA = Object.freeze(['sombrio', 'intermediario', 'leve']); // prioridade no conflito (P-2)
const compiladas = new WeakMap();

// Índices por keyword normalizada (igualdade exata, sem regex nem substring).
function compilar(tabela) {
  if (compiladas.has(tabela)) return compiladas.get(tabela);
  const porKeywordTema = new Map();
  for (const t of tabela.temas) {
    for (const k of t.keywords) porKeywordTema.set(k, [...(porKeywordTema.get(k) ?? []), t.id]);
  }
  const porKeywordClima = new Map();
  for (const c of tabela.climas) for (const k of c.keywords) porKeywordClima.set(k, c.id);
  const temasPorId = new Map(tabela.temas.map((t) => [t.id, t]));
  const indice = { porKeywordTema, porKeywordClima, temasPorId };
  compiladas.set(tabela, indice);
  return indice;
}

// keywords do TMDB -> Set de ids de tema casados (igualdade exata depois de trim e minúsculas).
export function casarTemas(keywords, tabela) {
  const { porKeywordTema } = compilar(tabela);
  const ids = new Set();
  for (const k of keywords ?? []) for (const id of porKeywordTema.get(normalizarKeyword(k)) ?? []) ids.add(id);
  return ids;
}

// Clima por regra (D-3): junta níveis de keywords de tom, de temas casados com `clima` e de gêneros; vence o mais alto.
export function calcularClima({ keywords, generos, temasCasados, tabela }) {
  const { porKeywordClima, temasPorId } = compilar(tabela);
  const niveis = new Set();
  for (const k of keywords ?? []) {
    const nivel = porKeywordClima.get(normalizarKeyword(k));
    if (nivel) niveis.add(nivel);
  }
  for (const id of temasCasados ?? []) {
    const nivel = temasPorId.get(id)?.clima;
    if (nivel) niveis.add(nivel);
  }
  for (const qid of generos ?? []) {
    const nivel = tabela.generosClima?.[qid];
    if (nivel) niveis.add(nivel);
  }
  return ORDEM_CLIMA.find((n) => niveis.has(n));
}

export const LIMIAR = 20;
export const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;

// Valida `data/curadoria-temas.json` antes da rede (invariante `curadoria-tema`): ids de tema existentes e clima válido.
export function validarCuradoria(curadoria, tabela) {
  const erro = (mensagem) => [{ invariante: 'curadoria-tema', erro: mensagem }];
  const filmes = curadoria?.filmes;
  if (typeof filmes !== 'object' || filmes === null || Array.isArray(filmes)) return erro('a curadoria deve ter o objeto `filmes`');
  const ids = new Set(tabela.temas.map((t) => t.id));
  for (const [qid, entrada] of Object.entries(filmes)) {
    if (!REGEX_QID.test(qid)) return erro(`QID malformado na curadoria: ${qid}`);
    if (typeof entrada !== 'object' || entrada === null) return erro(`${qid}: entrada inválida`);
    for (const campo of ['adicionar', 'remover']) {
      if (!(campo in entrada)) continue;
      if (!Array.isArray(entrada[campo])) return erro(`${qid}: \`${campo}\` deve ser lista`);
      for (const id of entrada[campo]) if (!ids.has(id)) return erro(`${qid}: tema inexistente na curadoria: ${id}`);
    }
    const remover = new Set(entrada.remover ?? []);
    const conflito = (entrada.adicionar ?? []).find((id) => remover.has(id));
    if (conflito !== undefined) return erro(`${qid}: tema em \`adicionar\` e em \`remover\`: ${conflito}`);
    if ('clima' in entrada && ![...NIVEIS_CLIMA, 'nenhum'].includes(entrada.clima)) return erro(`${qid}: clima inválido na curadoria: ${entrada.clima}`);
  }
  return [];
}

export function exigirCuradoriaValida(curadoria, tabela) {
  const erros = validarCuradoria(curadoria, tabela);
  if (erros.length > 0) throw new ErroBuild(erros[0].erro, { invariante: erros[0].invariante });
}

// Estado { tags: [ids], clima? } + entrada da curadoria -> novo estado (sobrepõe a regra; `nenhum` remove o clima).
export function aplicarCuradoria(estado, entrada) {
  const tags = new Set(estado.tags);
  for (const id of entrada?.adicionar ?? []) tags.add(id);
  for (const id of entrada?.remover ?? []) tags.delete(id);
  const novo = { tags: [...tags].sort() };
  let clima = estado.clima;
  if (entrada?.clima === 'nenhum') clima = undefined;
  else if (NIVEIS_CLIMA.includes(entrada?.clima)) clima = entrada.clima;
  if (clima !== undefined) novo.clima = clima;
  return novo;
}

// Tags anteriores mantidas por falha de keywords: descarta ids que não existem mais em data/temas.json.
export function manterTags(anterior, tabela) {
  const ids = new Set(tabela.temas.map((t) => t.id));
  const estado = { tags: [...new Set(anterior?.tags ?? [])].filter((id) => ids.has(id)).sort() };
  if (NIVEIS_CLIMA.includes(anterior?.clima)) estado.clima = anterior.clima;
  return estado;
}

// Limiar (D-3): conta temas e climas sobre todos os estados e remove o que ficou abaixo de `limiar`.
// Devolve { estados (Map qid -> estado), lista ([{ id, rotulo, filmes }] em ordem de id), abaixoDoLimiar, porTema, porClima }.
export function aplicarLimiar(estados, tabela, limiar = LIMIAR) {
  const porTema = {};
  const porClima = {};
  for (const t of tabela.temas) porTema[t.id] = 0;
  for (const c of tabela.climas) porClima[c.id] = 0;
  for (const estado of estados.values()) {
    for (const id of estado.tags) if (id in porTema) porTema[id] += 1;
    if (estado.clima !== undefined && estado.clima in porClima) porClima[estado.clima] += 1;
  }
  const rotulos = new Map([...tabela.temas, ...tabela.climas].map((x) => [x.id, x.rotulo]));
  const contagens = { ...porTema, ...porClima };
  const abaixoDoLimiar = Object.keys(contagens).filter((id) => contagens[id] < limiar).sort();
  const fora = new Set(abaixoDoLimiar);
  const lista = Object.keys(contagens).filter((id) => !fora.has(id)).sort().map((id) => ({ id, rotulo: rotulos.get(id), filmes: contagens[id] }));
  const saida = new Map();
  for (const [qid, estado] of estados) {
    const novo = { tags: estado.tags.filter((id) => !fora.has(id)) };
    if (estado.clima !== undefined && !fora.has(estado.clima)) novo.clima = estado.clima;
    saida.set(qid, novo);
  }
  return { estados: saida, lista, abaixoDoLimiar, porTema, porClima };
}

// ---- Cliente do TMDB (D-5) ----
export const BASE_TMDB = 'https://api.themoviedb.org/3';
export const TETO_REQUISICOES_TMDB = 12000;
export const TIMEOUT_TMDB_MS = 10000;
const TENTATIVAS_TMDB = 3;
const ESPERAS_TMDB_MS = [2000, 4000];
const RETRY_AFTER_PADRAO_MS = 10000;
const RETRY_AFTER_MAX_MS = 60000;

// Sem token (ausente, vazio ou só espaços) o passo sai antes de qualquer requisição.
export function exigirToken(token) {
  if (typeof token !== 'string' || token.trim() === '') {
    throw new ErroBuild('TMDB_TOKEN é obrigatório (segredo do GitHub Actions) e não foi informado', { invariante: 'tmdb-token' });
  }
  return token.trim();
}

// Retry-After em segundos inteiros de 0 a 60 -> ms; acima de 60 -> 60.000; ausente ou inválido -> 10.000.
export function esperaRetryAfter(valor) {
  const texto = String(valor ?? '').trim();
  if (!/^\d+$/.test(texto)) return RETRY_AFTER_PADRAO_MS;
  return Math.min(Number(texto) * 1000, RETRY_AFTER_MAX_MS);
}

const lerCabecalho = (resp, nome) => (typeof resp?.headers?.get === 'function' ? resp.headers.get(nome) : resp?.headers?.[nome]);

// Cliente sequencial: 1 requisição por vez, teto por rodada, sinal de 10.000 ms, nova tentativa em 429/5xx/rede.
// `pedir` devolve { ok: true, dados } | { ok: false, naoEncontrado: true } | { ok: false, motivo }; 401, 403, teto e
// `antesDeEnviar` (prazo global) lançam ErroBuild e interrompem o passo.
export function criarClienteTmdb({
  token, fetch: fetchImpl, esperar, criarSinal = (ms) => AbortSignal.timeout(ms), antesDeEnviar = () => {}, teto = TETO_REQUISICOES_TMDB,
}) {
  const credencial = exigirToken(token);
  let requisicoes = 0;
  // `permitido` (opcional) é checado antes de cada envio: falso encerra a requisição sem enviar (cota do /find).
  async function pedir(caminho, { permitido = () => true } = {}) {
    let motivo = 'desconhecido';
    for (let tentativa = 1; tentativa <= TENTATIVAS_TMDB; tentativa++) {
      if (!permitido()) return { ok: false, motivo: 'cota' };
      antesDeEnviar();
      if (requisicoes >= teto) throw new ErroBuild(`teto de ${teto} requisições ao TMDB atingido`, { invariante: 'teto-tmdb' });
      requisicoes += 1;
      let resp;
      try {
        resp = await fetchImpl(`${BASE_TMDB}${caminho}`, {
          headers: { Authorization: `Bearer ${credencial}`, Accept: 'application/json' },
          signal: criarSinal(TIMEOUT_TMDB_MS),
        });
      } catch (erro) {
        motivo = `rede: ${erro?.name === 'TimeoutError' || erro?.name === 'AbortError' ? 'timeout' : 'erro'}`;
        if (tentativa < TENTATIVAS_TMDB) await esperar(ESPERAS_TMDB_MS[tentativa - 1]);
        continue;
      }
      if (resp.status === 401 || resp.status === 403) {
        throw new ErroBuild(`TMDB recusou a autorização (HTTP ${resp.status}); troque a chave (README, rotação da chave)`, { invariante: 'tmdb-autorizacao' });
      }
      if (resp.status === 404) return { ok: false, naoEncontrado: true };
      if (resp.status === 429) {
        motivo = 'http-429';
        if (tentativa < TENTATIVAS_TMDB) await esperar(esperaRetryAfter(lerCabecalho(resp, 'retry-after')));
        continue;
      }
      if (resp.status >= 500) {
        motivo = `http-${resp.status}`;
        if (tentativa < TENTATIVAS_TMDB) await esperar(ESPERAS_TMDB_MS[tentativa - 1]);
        continue;
      }
      if (!resp.ok) return { ok: false, motivo: `http-${resp.status}` };
      try {
        return { ok: true, dados: await resp.json() };
      } catch {
        motivo = 'json-invalido';
        if (tentativa < TENTATIVAS_TMDB) await esperar(ESPERAS_TMDB_MS[tentativa - 1]);
      }
    }
    return { ok: false, motivo };
  }
  return { pedir, requisicoes: () => requisicoes };
}

export const COTA_FIND = 3000;
export const PRAZO_FIND_MS = 720000;
export const VALIDADE_MARCA_DIAS = 28;
const MS_DIA = 86400000;
const tmdbIdValido = (v) => Number.isInteger(v) && v > 0;
const anoDe = (data) => (/^\d{4}/.test(String(data ?? '')) ? Number(String(data).slice(0, 4)) : null);
const diasEntre = (hoje, antes) => (Date.parse(hoje) - Date.parse(antes)) / MS_DIA;

// Resolução do tmdbId em 3 etapas (D-5, D-6): base anterior, P4947 (WDQS) e /find. Devolve
// { tmdbIds: Map qid -> id, origem, consultadosWdqs, lotesWdqs, findsNaRodada, pendentesFind, divergenciaAno, semPar }.
export async function resolverTmdbIds({
  filmes, anterior, hoje, contato, cliente, fetch: fetchImpl, esperar, agora = () => performance.now(), inicio = agora(),
  criarSinal, antesDeEnviar,
}) {
  const noBase = new Set(filmes.map((f) => f.qid));
  const anteriorPorQid = new Map((anterior?.filmes ?? []).map((f) => [f.qid, f]));
  const tmdbIds = new Map();
  const origem = { anterior: 0, wikidata: 0, find: 0 };
  for (const f of filmes) {
    const id = anteriorPorQid.get(f.qid)?.tmdbId;
    if (tmdbIdValido(id)) {
      tmdbIds.set(f.qid, id);
      origem.anterior += 1;
    }
  }
  // Marcas de ausência: poda QIDs que saíram da base e as vencidas (mais de 28 dias).
  const semPar = {};
  for (const [qid, data] of Object.entries(anterior?.meta?.temas?.semPar ?? {})) {
    if (noBase.has(qid) && REGEX_DATA.test(String(data)) && diasEntre(hoje, data) <= VALIDADE_MARCA_DIAS) semPar[qid] = data;
  }
  // P4947: só para quem ainda não tem tmdbId; valor válido remove a marca.
  const faltando = filmes.filter((f) => !tmdbIds.has(f.qid));
  let consultadosWdqs = 0;
  let lotesWdqs = [];
  if (faltando.length > 0) {
    const r = await consultarP4947(faltando.map((f) => f.qid), { contato, fetch: fetchImpl, esperar, agora, criarSinal, antesDeEnviar });
    consultadosWdqs = r.consultados;
    lotesWdqs = r.lotesWdqs;
    for (const [qid, id] of r.mapa) {
      tmdbIds.set(qid, id);
      origem.wikidata += 1;
      delete semPar[qid];
    }
  }
  // /find: na ordem da base, com cota de envios e prazo; marca recente pula o filme.
  const base = cliente.requisicoes();
  const enviosFind = () => cliente.requisicoes() - base;
  const permitido = () => enviosFind() < COTA_FIND;
  let pendentesFind = 0;
  let divergenciaAno = 0;
  for (const f of filmes) {
    if (tmdbIds.has(f.qid) || f.qid in semPar) continue;
    if (!permitido() || agora() - inicio >= PRAZO_FIND_MS) {
      pendentesFind += 1;
      continue;
    }
    let r = await cliente.pedir(`/find/${f.qid}?external_source=wikidata_id`, { permitido });
    const vazio = (x) => x.ok && !(x.dados?.movie_results?.length > 0);
    if ((vazio(r) || r.naoEncontrado) && typeof f.imdb === 'string' && f.imdb !== '' && permitido()) {
      r = await cliente.pedir(`/find/${f.imdb}?external_source=imdb_id`, { permitido });
    }
    if (!r.ok && !r.naoEncontrado) {
      pendentesFind += 1;
      continue;
    }
    const achado = r.ok ? r.dados?.movie_results?.[0] : undefined;
    if (!achado || !tmdbIdValido(achado.id)) {
      semPar[f.qid] = hoje;
      continue;
    }
    const ano = anoDe(achado.release_date);
    if (ano === null || Math.abs(ano - f.ano) > 1) {
      divergenciaAno += 1;
      semPar[f.qid] = hoje;
      continue;
    }
    tmdbIds.set(f.qid, achado.id);
    origem.find += 1;
  }
  return { tmdbIds, origem, consultadosWdqs, lotesWdqs, findsNaRodada: enviosFind(), pendentesFind, divergenciaAno, semPar };
}

// GET /movie/{id}/keywords -> { ok: true, keywords: [nomes] } | { ok: false, naoEncontrado } | { ok: false, motivo }.
export async function buscarKeywords(cliente, tmdbId) {
  const r = await cliente.pedir(`/movie/${tmdbId}/keywords`);
  if (!r.ok) return r;
  const lista = Array.isArray(r.dados?.keywords) ? r.dados.keywords : [];
  return { ok: true, keywords: lista.map((k) => k?.name).filter((n) => typeof n === 'string') };
}

// ---- Consulta da P4947 (D-4) ----
export const TETO_TENTATIVAS_WDQS = 40;
export const TIMEOUT_LOTE_WDQS_MS = 55000;
const qidDe = (uri) => /(Q\d+)$/.exec(uri ?? '')?.[1] ?? null;

export function montarConsultaTmdb(qids) {
  const valores = qids.map((q) => `wd:${q}`).join(' ');
  return [
    'SELECT ?film ?tmdb WHERE {',
    `  VALUES ?film { ${valores} }`,
    '  ?film wdt:P4947 ?tmdb .',
    '}',
  ].join('\n');
}

// bindings -> Map qid -> tmdbId; só vale exatamente 1 valor distinto, inteiro positivo.
export function agruparP4947(bindings) {
  const valores = new Map();
  for (const b of bindings) {
    const qid = qidDe(b.film?.value);
    const valor = String(b.tmdb?.value ?? '').trim();
    if (!qid) continue;
    if (!valores.has(qid)) valores.set(qid, new Set());
    valores.get(qid).add(valor);
  }
  const mapa = new Map();
  for (const [qid, conjunto] of valores) {
    if (conjunto.size !== 1) continue;
    const [valor] = conjunto;
    if (/^[1-9]\d*$/.test(valor)) mapa.set(qid, Number(valor));
  }
  return mapa;
}

// Consulta a P4947 em lotes (política do WDQS): 3 tentativas por lote via consultarWdqs, teto de 40 tentativas na rodada
// e sinal de 55.000 ms por tentativa. Devolve { mapa, lotesWdqs, consultados }.
export async function consultarP4947(qids, {
  contato, fetch: fetchImpl, esperar, agora = () => performance.now(), criarSinal = (ms) => AbortSignal.timeout(ms), antesDeEnviar = () => {},
}) {
  const userAgent = montarUserAgent(contato);
  let tentativas = 0;
  let tetoAtingido = false;
  let erroFatal = null; // erro de `antesDeEnviar` (ex.: prazo global) não pode ser engolido pelas tentativas do consultarWdqs
  const fetchEmbrulhado = async (url, init = {}) => {
    if (tentativas >= TETO_TENTATIVAS_WDQS) {
      tetoAtingido = true;
      throw new Error('teto de tentativas do WDQS');
    }
    try {
      antesDeEnviar();
    } catch (erro) {
      erroFatal = erro;
      throw erro;
    }
    tentativas += 1;
    return fetchImpl(url, { ...init, signal: AbortSignal.any([init.signal, criarSinal(TIMEOUT_LOTE_WDQS_MS)].filter(Boolean)) });
  };
  const lotes = [];
  for (let i = 0; i < qids.length; i += TAMANHO_LOTE) lotes.push(qids.slice(i, i + TAMANHO_LOTE));
  const bindings = [];
  const lotesWdqs = [];
  for (let i = 0; i < lotes.length; i++) {
    if (i > 0) await esperar(PAUSA_ENTRE_LOTES_MS);
    const nome = `p4947-${i + 1}`;
    try {
      const { dados, duracaoMs } = await consultarWdqs(montarConsultaTmdb(lotes[i]), { fetch: fetchEmbrulhado, esperar, userAgent, lote: nome, agora });
      bindings.push(...(dados?.results?.bindings ?? []));
      lotesWdqs.push({ lote: nome, duracaoMs });
    } catch (erro) {
      if (erroFatal) throw erroFatal;
      if (tetoAtingido) throw new ErroBuild(`teto de ${TETO_TENTATIVAS_WDQS} tentativas ao WDQS atingido`, { invariante: 'teto-wdqs' });
      throw erro;
    }
  }
  return { mapa: agruparP4947(bindings), lotesWdqs, consultados: qids.length };
}

// ---- Cobertura e orquestração (D-3, D-9) ----
export const PRAZO_GLOBAL_MS = 2220000;
export const LIMITE_FALHAS = 0.05;
export const ALERTA_BYTES = 2000000;
const arredondar4 = (n) => Math.round(n * 1e4) / 1e4;

// comTema e comClima (frações de 4 casas) e temasPorGeneroMin: o menor número, entre os gêneros de humores.json,
// de temas presentes em no mínimo 5 filmes do gênero.
export function calcularCobertura(filmes, humores) {
  const total = filmes.length;
  const fracao = (n) => (total === 0 ? 0 : arredondar4(n / total));
  const generos = [...new Set((humores?.humores ?? []).flatMap((h) => h.generos.map((g) => g.qid)))];
  const porGenero = generos.map((qid) => {
    const contagem = new Map();
    for (const f of filmes) {
      if (!f.generos?.includes(qid)) continue;
      for (const id of f.tags ?? []) contagem.set(id, (contagem.get(id) ?? 0) + 1);
    }
    return [...contagem.values()].filter((n) => n >= 5).length;
  });
  return {
    comTema: fracao(filmes.filter((f) => (f.tags?.length ?? 0) > 0).length),
    temasPorGeneroMin: porGenero.length === 0 ? 0 : Math.min(...porGenero),
    comClima: fracao(filmes.filter((f) => f.clima !== undefined).length),
  };
}

function exigirRelatorioFora(relatorio, raiz, medir) {
  if (relatorio === undefined) return;
  if (!medir) throw new ErroBuild('--relatorio só vale junto com --medir', { invariante: 'relatorio' });
  const alvo = resolverCaminho(relatorio);
  const base = resolverCaminho(raiz);
  if (alvo === base || alvo.startsWith(base + sep)) {
    throw new ErroBuild('o arquivo de --relatorio deve ficar fora da raiz do repositório', { invariante: 'relatorio' });
  }
}

const dia = (iso) => String(iso ?? '').slice(0, 10);

// Passo de tags: devolve o código de saída. Tudo que toca o mundo é injetado (ver D-1).
export async function executarTemas({
  dataset, anterior = null, temas, curadoria = { filmes: {} }, humores, contato, token, medir = false, relatorio, raiz = process.cwd(),
  fetch: fetchImpl, esperar, agora = () => performance.now(), relogio = () => new Date(), criarSinal,
  stdout, stderr, gravar, gravarRelatorio = async () => {},
}) {
  try {
    exigirTemasValidos(temas, humores);
    exigirCuradoriaValida(curadoria, temas);
    exigirRelatorioFora(relatorio, raiz, medir);
    montarUserAgent(contato);
    exigirToken(token);

    const inicio = agora();
    const verificarPrazo = () => {
      if (agora() - inicio >= PRAZO_GLOBAL_MS) {
        throw new ErroBuild(`prazo global de ${PRAZO_GLOBAL_MS} ms do passo de tags atingido`, { invariante: 'prazo' });
      }
    };
    const cliente = criarClienteTmdb({ token, fetch: fetchImpl, esperar, criarSinal, antesDeEnviar: verificarPrazo });
    const hoje = dia(relogio().toISOString());
    const filmes = dataset.filmes;
    const res = await resolverTmdbIds({
      filmes, anterior, hoje, contato, cliente, fetch: fetchImpl, esperar, agora, inicio, criarSinal, antesDeEnviar: verificarPrazo,
    });
    const tmdbIds = res.tmdbIds;

    // Keywords de todo filme com tmdbId, em sequência.
    const anteriorPorQid = new Map((anterior?.filmes ?? []).map((f) => [f.qid, f]));
    const geradoEmAnterior = dia(anterior?.meta?.temas?.geradoEm);
    const conhecidas = new Set([...temas.temas.flatMap((t) => t.keywords), ...temas.climas.flatMap((c) => c.keywords), ...temas.ignorar]);
    const frequencia = new Map();
    const estados = new Map();
    const mantidoEm = new Map();
    const comTmdbIdNoInicio = tmdbIds.size;
    let falhasKeywords = 0;
    let semKeywords = 0;
    let tagsMantidas = 0;
    let tagsExpiradas = 0;
    for (const f of filmes) {
      if (!tmdbIds.has(f.qid)) {
        estados.set(f.qid, { tags: [] });
        continue;
      }
      const r = await buscarKeywords(cliente, tmdbIds.get(f.qid));
      if (r.ok) {
        if (r.keywords.length === 0) semKeywords += 1;
        const casados = casarTemas(r.keywords, temas);
        const estado = { tags: [...casados].sort() };
        const clima = calcularClima({ keywords: r.keywords, generos: f.generos, temasCasados: casados, tabela: temas });
        if (clima !== undefined) estado.clima = clima;
        estados.set(f.qid, estado);
        if (medir) {
          for (const k of r.keywords) {
            const n = normalizarKeyword(k);
            if (!conhecidas.has(n)) frequencia.set(n, (frequencia.get(n) ?? 0) + 1);
          }
        }
        continue;
      }
      // Falha de keywords: 404 perde o tmdbId; mantém as tags anteriores por até 28 dias.
      falhasKeywords += 1;
      if (r.naoEncontrado) tmdbIds.delete(f.qid);
      stderr(linhaDeErro(new ErroBuild(`${f.qid}: keywords indisponíveis (${r.naoEncontrado ? 'http-404' : r.motivo})`, { invariante: 'keywords-filme' })));
      if (falhasKeywords > comTmdbIdNoInicio * LIMITE_FALHAS) {
        throw new ErroBuild(`${falhasKeywords} falhas de keywords em ${comTmdbIdNoInicio} filmes com tmdbId (limite de 5%)`, { invariante: 'falhas-keywords' });
      }
      const ant = anteriorPorQid.get(f.qid);
      const data = /^\d{4}-\d{2}-\d{2}$/.test(String(ant?.tagsEm)) ? ant.tagsEm : geradoEmAnterior;
      const mantido = (ant?.tags?.length > 0 || ant?.clima !== undefined) && data !== '' && diasEntre(hoje, data) <= VALIDADE_MARCA_DIAS
        ? manterTags(ant, temas) : null;
      if (mantido && (mantido.tags.length > 0 || mantido.clima !== undefined)) {
        estados.set(f.qid, mantido);
        mantidoEm.set(f.qid, data);
        tagsMantidas += 1;
      } else {
        estados.set(f.qid, { tags: [] });
        tagsExpiradas += 1;
      }
    }

    // Curadoria sobre os estados calculado e vazio (não sobre os mantidos).
    const noBase = new Set(filmes.map((f) => f.qid));
    const entradas = curadoria.filmes ?? {};
    let aplicadas = 0;
    for (const [qid, entrada] of Object.entries(entradas)) {
      if (!noBase.has(qid) || mantidoEm.has(qid)) continue;
      estados.set(qid, aplicarCuradoria(estados.get(qid), entrada));
      aplicadas += 1;
    }
    const qidsAusentes = Object.keys(entradas).filter((q) => !noBase.has(q)).length;

    const limiar = aplicarLimiar(estados, temas);
    const saidaFilmes = filmes.map((f) => {
      const { tags: _t, clima: _c, tmdbId: _i, tagsEm: _e, ...resto } = f;
      const estado = limiar.estados.get(f.qid);
      const novo = { ...resto };
      if (estado.tags.length > 0) novo.tags = estado.tags;
      if (estado.clima !== undefined) novo.clima = estado.clima;
      if (tmdbIds.has(f.qid)) novo.tmdbId = tmdbIds.get(f.qid);
      if (mantidoEm.has(f.qid) && (novo.tags || novo.clima)) novo.tagsEm = mantidoEm.get(f.qid);
      return novo;
    });
    const cobertura = calcularCobertura(saidaFilmes, humores);

    if (medir) {
      verificarPrazo();
      if (relatorio !== undefined) await gravarRelatorio(JSON.stringify(Object.fromEntries([...frequencia].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])))));
      stdout(JSON.stringify({ porTema: limiar.porTema, porClima: limiar.porClima, abaixoDoLimiar: limiar.abaixoDoLimiar, cobertura }));
      return 0;
    }

    const semParOrdenado = Object.fromEntries(Object.entries(res.semPar).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })));
    const saida = {
      meta: { ...dataset.meta, temas: { geradoEm: relogio().toISOString(), lista: limiar.lista, semPar: semParOrdenado } },
      filmes: saidaFilmes,
    };
    const texto = JSON.stringify(saida);
    const bytes = Buffer.byteLength(texto, 'utf8');
    if (bytes > MAX_BYTES) throw new ErroBuild(`${bytes} bytes; máximo ${MAX_BYTES}`, { invariante: 'tamanho-maximo' });
    verificarPrazo();
    await gravar(texto);
    stdout(JSON.stringify({
      total: filmes.length,
      comTmdbId: saidaFilmes.filter((f) => f.tmdbId !== undefined).length,
      origemTmdbId: res.origem,
      coberturaP4947: res.consultadosWdqs === 0 ? 0 : arredondar4(res.origem.wikidata / res.consultadosWdqs),
      findsNaRodada: res.findsNaRodada,
      pendentesFind: res.pendentesFind,
      divergenciaAno: res.divergenciaAno,
      semKeywords,
      falhasKeywords,
      tagsMantidas,
      tagsExpiradas,
      chamadas: cliente.requisicoes(),
      lotesWdqs: res.lotesWdqs,
      porTema: limiar.porTema,
      porClima: limiar.porClima,
      abaixoDoLimiar: limiar.abaixoDoLimiar,
      curadoria: { aplicadas, qidsAusentes },
      cobertura,
      bytes,
      alertaTamanho: bytes > ALERTA_BYTES,
      duracaoMs: Math.round(agora() - inicio),
    }));
    return 0;
  } catch (erro) {
    if (!(erro instanceof ErroBuild)) throw erro;
    stderr(linhaDeErro(erro));
    return 1;
  }
}
