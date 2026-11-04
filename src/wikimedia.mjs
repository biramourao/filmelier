// URLs, uma chamada HTTP com timeout, parsing e filtros das APIs da Wikimedia (design.md D-2, D-3, D-5).
// Sem DOM e sem estado: fetch, sinal de timeout e relógio entram por parâmetro.

export const SEM_ARTIGO = Symbol('sem-artigo');
export const FORMATO = Symbol('formato');

const URL_WIKIDATA = 'https://www.wikidata.org/w/api.php';
const PREFIXOS_CAPA = ['/wikipedia/commons/', '/wikipedia/pt/', '/wikipedia/en/'];
const PADRAO_ARTIGO = /^https:\/\/(pt|en)\.wikipedia\.org\/wiki\//;

const ehObjeto = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

export const ehQid = (v) => typeof v === 'string' && /^Q\d+$/.test(v);

export function montarUrlWikidata(qids) {
  for (const q of qids) if (!ehQid(q)) throw new Error(`QID inválido: ${q}`);
  const url = new URL(URL_WIKIDATA);
  url.searchParams.set('action', 'wbgetentities');
  url.searchParams.set('ids', qids.join('|'));
  url.searchParams.set('props', 'sitelinks');
  url.searchParams.set('sitefilter', 'ptwiki|enwiki');
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');
  return url.toString();
}

// Devolve Map QID -> { idioma, titulo } | SEM_ARTIGO | FORMATO, ou null quando `entities` não é objeto
// (falha de formato da chamada inteira). QID pedido que não volta em `entities` vira SEM_ARTIGO (D-3).
export function lerTitulos(json, qids) {
  if (!ehObjeto(json) || !ehObjeto(json.entities)) return null;
  const mapa = new Map();
  for (const qid of qids) {
    const entidade = json.entities[qid];
    if (entidade === undefined) {
      mapa.set(qid, SEM_ARTIGO);
    } else if (!ehObjeto(entidade)) {
      mapa.set(qid, FORMATO);
    } else if ('missing' in entidade) {
      mapa.set(qid, SEM_ARTIGO);
    } else if (!ehObjeto(entidade.sitelinks)) {
      mapa.set(qid, FORMATO);
    } else {
      const pt = entidade.sitelinks.ptwiki?.title;
      const en = entidade.sitelinks.enwiki?.title;
      if (typeof pt === 'string' && pt !== '') mapa.set(qid, { idioma: 'pt', titulo: pt });
      else if (typeof en === 'string' && en !== '') mapa.set(qid, { idioma: 'en', titulo: en });
      else mapa.set(qid, SEM_ARTIGO);
    }
  }
  return mapa;
}

export function montarUrlResumo(idioma, titulo) {
  if (idioma !== 'pt' && idioma !== 'en') throw new Error(`idioma inválido: ${idioma}`);
  return `https://${idioma}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titulo.replaceAll(' ', '_'))}`;
}

// Só upload.wikimedia.org, https, sem porta nem credenciais, nos 3 caminhos de wikipedia/.
export function aceitarCapa(valor) {
  if (typeof valor !== 'string') return false;
  let url;
  try {
    url = new URL(valor);
  } catch {
    return false;
  }
  return url.protocol === 'https:'
    && url.hostname === 'upload.wikimedia.org'
    && url.host === 'upload.wikimedia.org'
    && url.username === ''
    && url.password === ''
    && PREFIXOS_CAPA.some((p) => url.pathname.startsWith(p));
}

export function aceitarArtigo(valor) {
  return typeof valor === 'string' && PADRAO_ARTIGO.test(valor);
}

// Lê só extract, thumbnail.source e content_urls.desktop.page (nunca a versão em HTML do extract).
// Devolve { sinopse, capaUrl, artigoUrl } (campos nulos quando ausentes ou recusados) ou null em formato inesperado.
// Sem URL de artigo válida, sinopse e capa ficam nulas: o crédito exigido ficaria sem link.
export function lerResumo(json) {
  if (!ehObjeto(json)) return null;
  if (json.thumbnail !== undefined && !ehObjeto(json.thumbnail)) return null;
  if (json.type === 'disambiguation') return { sinopse: null, capaUrl: null, artigoUrl: null };
  const pagina = json.content_urls?.desktop?.page;
  const artigoUrl = aceitarArtigo(pagina) ? pagina : null;
  const extract = typeof json.extract === 'string' && json.extract.trim() !== '' ? json.extract : null;
  const fonte = json.thumbnail?.source;
  return {
    sinopse: artigoUrl ? extract : null,
    capaUrl: artigoUrl && aceitarCapa(fonte) ? fonte : null,
    artigoUrl,
  };
}

// 1 GET sem method, headers nem corpo (sem preflight CORS), sem cookies e sem referer. Nunca lança.
export async function buscarJson(url, { fetchImpl, criarSinal = (ms) => AbortSignal.timeout(ms), timeoutMs = 5000 }) {
  let resposta;
  try {
    resposta = await fetchImpl(url, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: criarSinal(timeoutMs) });
  } catch (e) {
    const motivo = e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'timeout' : 'rede';
    return { ok: false, motivo, status: null, retryAfter: null };
  }
  if (!resposta.ok) {
    const retryAfter = resposta.headers?.get?.('Retry-After') ?? null;
    return { ok: false, motivo: `http-${resposta.status}`, status: resposta.status, retryAfter };
  }
  try {
    return { ok: true, json: await resposta.json() };
  } catch (e) {
    const motivo = e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'timeout' : 'formato';
    return { ok: false, motivo, status: resposta.status, retryAfter: null };
  }
}
