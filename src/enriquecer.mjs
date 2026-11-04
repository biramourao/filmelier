// Enriquecimento de filmes (título do artigo, sinopse e capa) pelo Wikidata e pela Wikipédia.
// Cache em 2 níveis, teto de 1 + 5 chamadas por recomendação, suspensão por HTTP 429, timeout e logs
// (design.md D-3, D-4, D-5, D-13). Sem DOM; fetch, relógio, sinal de timeout e logger são injetados.

import {
  SEM_ARTIGO, FORMATO, buscarJson, ehQid, lerResumo, lerTitulos, montarUrlResumo, montarUrlWikidata,
} from './wikimedia.mjs';

const SEM_RESUMO = Symbol('sem-resumo');
const SUSPENSAO_PADRAO_S = 30; // mínimo: também vale para Retry-After 0, ausente ou inválido
const SUSPENSAO_MAXIMA_S = 300;

export function criarEnriquecedor({
  fetchImpl,
  agora = () => Date.now(),
  criarSinal = (ms) => AbortSignal.timeout(ms),
  logger = console,
  timeoutMs = 5000,
} = {}) {
  const titulos = new Map();
  const resumos = new Map();
  const titulosEmVoo = new Map(); // QID -> promessa da chamada ao Wikidata que o inclui
  const resumosEmVoo = new Map(); // QID -> promessa da chamada ao resumo
  let suspensoAte = 0;

  const suspenso = () => agora() < suspensoAte;
  const chamar = (url) => buscarJson(url, { fetchImpl, criarSinal, timeoutMs });

  function registrar429(retryAfter) {
    const valido = typeof retryAfter === 'string' && /^\d+$/.test(retryAfter.trim()) ? Number(retryAfter.trim()) : 0;
    const segundos = valido > 0 ? Math.min(valido, SUSPENSAO_MAXIMA_S) : SUSPENSAO_PADRAO_S;
    suspensoAte = Math.max(suspensoAte, agora() + segundos * 1000);
    logger.warn(`[filmelier] limite de uso da Wikimedia: chamadas suspensas por ${segundos} s`);
  }

  function falha(r, dados) {
    logger.warn('[filmelier] enriquecimento falhou', { ...dados, motivo: r.motivo });
    if (r.status === 429) registrar429(r.retryAfter);
    return r.status === 429;
  }

  async function consultarTitulos(faltantes) {
    const r = await chamar(montarUrlWikidata(faltantes));
    if (!r.ok) return falha(r, { fonte: 'wikidata', qids: faltantes });
    const mapa = lerTitulos(r.json, faltantes);
    if (mapa === null) return falha({ motivo: 'formato' }, { fonte: 'wikidata', qids: faltantes });
    for (const [qid, valor] of mapa) {
      if (valor === FORMATO) falha({ motivo: 'formato' }, { fonte: 'wikidata', qids: [qid] });
      else titulos.set(qid, valor);
    }
    return false;
  }

  // Devolve true quando o Wikidata respondeu 429 (a recomendação termina, mesmo com Retry-After 0).
  // QID já pedido por outra recomendação em voo não é pedido de novo: espera a mesma promessa (design D-5).
  async function resolverTitulos(qids) {
    const faltantes = qids.filter((q) => !titulos.has(q));
    if (faltantes.length === 0) return false;
    const novos = faltantes.filter((q) => !titulosEmVoo.has(q));
    const esperar = new Set(faltantes.filter((q) => titulosEmVoo.has(q)).map((q) => titulosEmVoo.get(q)));
    if (novos.length > 0) {
      const p = consultarTitulos(novos).finally(() => novos.forEach((q) => titulosEmVoo.delete(q)));
      novos.forEach((q) => titulosEmVoo.set(q, p));
      esperar.add(p);
    }
    return (await Promise.all(esperar)).some(Boolean);
  }

  async function consultarResumo(qid) {
    const { idioma, titulo } = titulos.get(qid);
    const r = await chamar(montarUrlResumo(idioma, titulo));
    if (!r.ok) {
      falha(r, { fonte: 'wikipedia', qid });
      if (r.status === 404) resumos.set(qid, SEM_RESUMO);
      return;
    }
    const resumo = lerResumo(r.json);
    if (resumo === null) return falha({ motivo: 'formato' }, { fonte: 'wikipedia', qid });
    const vazio = resumo.sinopse === null && resumo.capaUrl === null && resumo.artigoUrl === null;
    resumos.set(qid, vazio ? SEM_RESUMO : { ...resumo, idioma });
  }

  function resolverResumo(qid) {
    if (resumosEmVoo.has(qid)) return resumosEmVoo.get(qid);
    const p = consultarResumo(qid).finally(() => resumosEmVoo.delete(qid));
    resumosEmVoo.set(qid, p);
    return p;
  }

  function doCache(qid) {
    const titulo = titulos.get(qid);
    const resumo = resumos.get(qid);
    if (!titulo || titulo === SEM_ARTIGO || !resumo || resumo === SEM_RESUMO) return null;
    return { idioma: titulo.idioma, sinopse: resumo.sinopse, capaUrl: resumo.capaUrl, artigoUrl: resumo.artigoUrl };
  }

  async function executar(qids) {
    if (suspenso()) return;
    if (await resolverTitulos(qids)) return;
    if (suspenso()) return;
    const novos = qids.filter((q) => {
      const t = titulos.get(q);
      return t && t !== SEM_ARTIGO && !resumos.has(q);
    });
    await Promise.all(novos.map(resolverResumo));
  }

  // Resolve sempre (nunca rejeita) com Map QID -> { idioma, sinopse, capaUrl, artigoUrl } ou null.
  async function enriquecer(qids) {
    const unicos = [...new Set(qids)];
    const invalidos = unicos.filter((q) => !ehQid(q));
    if (invalidos.length > 0) {
      logger.warn('[filmelier] enriquecimento falhou', { fonte: 'interno', qids: invalidos, motivo: 'qid-invalido' });
    }
    try {
      await executar(unicos.filter(ehQid));
    } catch (e) {
      logger.warn('[filmelier] enriquecimento falhou', { fonte: 'interno', qids: unicos, motivo: 'formato', erro: String(e?.message ?? e) });
    }
    return new Map(unicos.map((q) => [q, doCache(q)]));
  }

  return { enriquecer, cache: { titulos, resumos }, suspensoAte: () => suspensoAte, SEM_RESUMO };
}
