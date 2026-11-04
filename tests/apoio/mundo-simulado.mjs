// Mundo simulado do passo de tags (FILMELIER-4): WDQS e TMDB em memória, sem rede. Registra as chamadas e o máximo de
// requisições em voo. Nada daqui fala com a API real do TMDB.

const resposta = (corpo, status = 200, cabecalhos = {}) => ({
  ok: status >= 200 && status < 300, status, headers: { get: (n) => cabecalhos[n.toLowerCase()] ?? null }, json: async () => corpo,
});

// p4947: { QID: [valores] } | função (qids, n) -> bindings, número (status) ou Error.
// find: { id (QID ou imdb): { id, release_date } | número (status) | null } | função (id, fonte, n).
// keywords: { tmdbId: [nomes] | número | Error } | função (tmdbId, n).
export function mundoSimulado({ p4947 = {}, find = {}, keywords = {}, aoChamar = () => {} } = {}) {
  const chamadas = [];
  const esperas = [];
  const contagem = { wdqs: 0, find: new Map(), keywords: new Map() };
  let emVoo = 0;
  let maxEmVoo = 0;

  async function tratar(url, init) {
    const u = new URL(url);
    if (u.hostname === 'query.wikidata.org') {
      contagem.wdqs += 1;
      const qids = [...(u.searchParams.get('query') ?? '').matchAll(/wd:(Q\d+)/g)].map((m) => m[1]);
      let saida = typeof p4947 === 'function' ? p4947(qids, contagem.wdqs) : undefined;
      if (typeof saida === 'number') return resposta({}, saida);
      if (saida instanceof Error) throw saida;
      if (saida === undefined) saida = qids.flatMap((q) => (p4947[q] ?? []).map((v) => ({ film: { value: `http://www.wikidata.org/entity/${q}` }, tmdb: { value: String(v) } })));
      return resposta({ results: { bindings: saida } });
    }
    const achou = /^\/3\/find\/([^/]+)$/.exec(u.pathname);
    if (achou) {
      const id = decodeURIComponent(achou[1]);
      const n = (contagem.find.get(id) ?? 0) + 1;
      contagem.find.set(id, n);
      const v = typeof find === 'function' ? find(id, u.searchParams.get('external_source'), n) : find[id];
      if (typeof v === 'number') return resposta({}, v);
      if (v instanceof Error) throw v;
      return resposta({ movie_results: v ? [v] : [] });
    }
    const kw = /^\/3\/movie\/(\d+)\/keywords$/.exec(u.pathname);
    if (kw) {
      const id = Number(kw[1]);
      const n = (contagem.keywords.get(id) ?? 0) + 1;
      contagem.keywords.set(id, n);
      const v = typeof keywords === 'function' ? keywords(id, n) : (keywords[id] ?? []);
      if (typeof v === 'number') return resposta({}, v, v === 429 ? { 'retry-after': '7' } : {});
      if (v instanceof Error) throw v;
      return resposta({ id, keywords: v.map((name, i) => ({ id: i, name })) });
    }
    throw new Error(`URL inesperada no mundo simulado: ${url}`);
  }

  const fetch = async (url, init = {}) => {
    emVoo += 1;
    maxEmVoo = Math.max(maxEmVoo, emVoo);
    chamadas.push({ url: String(url), init });
    aoChamar(String(url), init);
    try {
      await Promise.resolve();
      return await tratar(String(url), init);
    } finally {
      emVoo -= 1;
    }
  };
  const esperar = async (ms) => { esperas.push(ms); };
  const so = (trecho) => chamadas.filter((c) => c.url.includes(trecho));
  return { fetch, esperar, chamadas, esperas, so, contagem, maxEmVoo: () => maxEmVoo };
}

// Filmes sintéticos mínimos da base.
export const filmeSintetico = (n, extra = {}) => ({ qid: `Q${n}`, titulo: `Filme ${n}`, ano: 2000, generos: ['Q130232'], sitelinks: 100 - (n % 100), ...extra });
export const baseSintetica = (qtd, extra = () => ({}), meta = {}) => ({
  meta: { fonte: 'Wikidata', licenca: 'CC0 1.0', total: qtd, geradoEm: '2026-11-04T01:00:00.000Z', ...meta },
  filmes: Array.from({ length: qtd }, (_, i) => filmeSintetico(i + 1, extra(i + 1))),
});
