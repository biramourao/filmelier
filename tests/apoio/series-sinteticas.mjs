// Mundo simulado do build de séries (FILMELIER-6): WDQS e TMDB em memória, sem rede. Gera `total` séries sintéticas,
// 1 gênero por série em rodízio sobre os gêneros da tabela; todas têm P2437/P1113 (reserva do Wikidata) e P4983.

const resposta = (corpo, status = 200, cabecalhos = {}) => ({
  ok: status >= 200 && status < 300, status, headers: { get: (n) => cabecalhos[n.toLowerCase()] ?? null }, json: async () => corpo,
});

// Opções:
//  tabela, clima, temas: os JSON reais; total (1000)
//  http404: quantas séries (as primeiras) respondem 404 no TMDB
//  semSituacao: quantas (as primeiras) respondem status 'Rumored' (situação null)
//  comTags: alvo de séries com tag de tema ou clima (padrão: todas as que couberem)
//  http401: a 1ª chamada ao TMDB responde 401
//  aoChamarTmdb(n, id) -> undefined | { status, retryAfter } | Error  (antes de responder)
//  aoChamarWdqs(n)
//  generoDe(i, generos) -> QID do gênero da série i; tituloExtra: texto ASCII somado ao título da 1ª série (infla os bytes)
export function mundoSeries({ tabela, clima, temas, total = 1000, http404 = 0, semSituacao = 0, comTags, http401 = false, aoChamarTmdb = () => undefined, aoChamarWdqs = () => {}, generoDe, tituloExtra = '' }) {
  const generos = [...new Set(tabela.humores.flatMap((h) => h.generos.map((g) => g.qid)))];
  const temClima = new Set(Object.keys(clima.generosClima));
  const tema = temas.temas.find((t) => !t.clima);
  const itens = Array.from({ length: total }, (_, i) => ({ i, qid: `Q${100000 + i}`, genero: generoDe ? generoDe(i, generos) : generos[i % generos.length], tmdbId: 1000 + i }));
  const comClima = itens.filter((s) => temClima.has(s.genero)).length;
  const alvo = comTags === undefined ? total : comTags;
  let faltam = Math.max(0, alvo - comClima);
  const comKeyword = new Set();
  for (const s of itens) {
    if (faltam === 0) break;
    if (!temClima.has(s.genero)) { comKeyword.add(s.tmdbId); faltam -= 1; }
  }
  const chamadas = { wdqs: 0, tmdb: 0, urls: [] };
  const esperas = [];
  const porId = new Map(itens.map((s) => [s.tmdbId, s]));

  async function fetch(url) {
    const u = new URL(url);
    chamadas.urls.push(url);
    if (u.hostname === 'query.wikidata.org') {
      chamadas.wdqs += 1;
      aoChamarWdqs(chamadas.wdqs);
      const qid = /wd:(Q\d+)/.exec(u.searchParams.get('query'))[1];
      const bindings = itens.filter((s) => s.genero === qid).map((s) => ({
        s: { value: `http://www.wikidata.org/entity/${s.qid}` }, g: { value: `http://www.wikidata.org/entity/${qid}` },
        inicio: { value: '2005-01-01T00:00:00Z' }, temp: { value: '2' }, ep: { value: '20' }, tmdb: { value: String(s.tmdbId) },
        sl: { value: String(100 - (s.i % 50)) }, tpt: { value: `Série ${s.i}` },
      }));
      return resposta({ results: { bindings } });
    }
    chamadas.tmdb += 1;
    const id = Number(/\/tv\/(\d+)/.exec(u.pathname)[1]);
    const s = porId.get(id);
    const forcado = aoChamarTmdb(chamadas.tmdb, id);
    if (forcado instanceof Error) throw forcado;
    if (forcado) return resposta({}, forcado.status, forcado.retryAfter === undefined ? {} : { 'retry-after': String(forcado.retryAfter) });
    if (http401 && chamadas.tmdb === 1) return resposta({}, 401);
    if (s.i < http404) return resposta({}, 404);
    return resposta({
      name: `Série ${s.i}${s.i === 0 ? tituloExtra : ''}`, original_name: `Series ${s.i}`, status: s.i < semSituacao ? 'Rumored' : 'Ended',
      number_of_seasons: 2, number_of_episodes: 20, last_air_date: '2015-05-05',
      keywords: { results: comKeyword.has(id) ? [{ id: 1, name: tema.keywords[0] }] : [] },
    });
  }
  return { fetch, esperar: async (ms) => { esperas.push(ms); }, chamadas, esperas, itens };
}
