// Build da base de séries (FILMELIER-6, design D-4): consulta WDQS, mescla, regras RV-1/RV-5, ano de fim, temporadas,
// episódios, fallback, tags e invariantes. Funções puras; tudo que toca o mundo (rede, relógio, gravação) é injetado.

import { ErroBuild, consultarWdqs, montarUserAgent } from './wdqs.mjs';
import { validarTabela } from './validar-dataset.mjs';
import { linhaDeErro } from './resumo.mjs';
import { NIVEIS_CLIMA, casarTemas, calcularClima, aplicarLimiar, exigirToken } from './temas.mjs';
import { lerSerieTmdb, criarClienteSeries } from './series-tmdb.mjs';
import { MIN_SITELINKS } from './consulta.mjs';

const REGEX_QID = /^Q\d+$/;
const REGEX_IMDB = /^tt\d{7,8}$/;
const numeroDoQid = (qid) => Number(qid.slice(1));
const qidDe = (uri) => uri.slice(uri.lastIndexOf('/') + 1);

// SPARQL de um lote por gênero (D-4). A ordem dos padrões e o hint optimizer "None" começam pelo gênero.
export function montarConsultaSeries(qid) {
  if (!REGEX_QID.test(qid)) throw new Error(`QID inválido: ${qid}`);
  return [
    'SELECT ?s ?g ?inicio ?fim ?temp ?ep ?tmdb ?imdb ?sl ?tpt ?ten WHERE {',
    '  hint:Query hint:optimizer "None" .',
    `  VALUES ?g { wd:${qid} }`,
    '  ?s wdt:P136 ?g .',
    '  ?s wikibase:sitelinks ?sl .',
    `  FILTER(?sl >= ${MIN_SITELINKS})`,
    '  ?s wdt:P31/wdt:P279* wd:Q5398426 .',
    '  ?s wdt:P580 ?inicio .',
    '  OPTIONAL { ?s wdt:P582 ?fim . }',
    '  OPTIONAL { ?s wdt:P2437 ?temp . }',
    '  OPTIONAL { ?s wdt:P1113 ?ep . }',
    '  OPTIONAL { ?s wdt:P4983 ?tmdb . }',
    '  OPTIONAL { ?s wdt:P345 ?imdb . }',
    '  OPTIONAL { ?s rdfs:label ?tpt . FILTER(LANG(?tpt) = "pt") }',
    '  OPTIONAL { ?s rdfs:label ?ten . FILTER(LANG(?ten) = "en") }',
    '}',
  ].join('\n');
}

const anoDe = (texto) => {
  const m = /^(\d{4})/.exec(String(texto ?? ''));
  return m ? Number(m[1]) : null;
};
const inteiroMin1 = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? n : null;
};
const maior = (atual, novo) => (novo === null ? atual : atual === null ? novo : Math.max(atual, novo));
const menor = (atual, novo) => (novo === null ? atual : atual === null ? novo : Math.min(atual, novo));

// Linhas SPARQL (várias por série) -> séries-base por QID: anoInicio = menor ano de P580, ano P582 = maior,
// P2437/P1113 = maior inteiro >= 1, P4983 = menor inteiro positivo, imdb só tt + 7 ou 8 dígitos, rótulo pt senão en.
// Sem P580, sem rótulo ou sem gênero da tabela: fora.
export function mesclarLinhas(linhas, { qidsTabela }) {
  const porQid = new Map();
  for (const l of linhas) {
    if (!l.s || !l.g || !l.inicio) continue;
    const genero = qidDe(l.g.value);
    if (!qidsTabela.has(genero)) continue;
    const inicio = anoDe(l.inicio.value);
    if (inicio === null) continue;
    const qid = qidDe(l.s.value);
    let s = porQid.get(qid);
    if (!s) {
      s = { qid, pt: null, en: null, anoInicio: inicio, anoFimWd: null, temporadasWd: null, episodiosWd: null, tmdbId: null, imdb: null, generos: new Set(), sitelinks: 0 };
      porQid.set(qid, s);
    }
    s.anoInicio = Math.min(s.anoInicio, inicio);
    s.generos.add(genero);
    s.sitelinks = Math.max(s.sitelinks, Number(l.sl?.value ?? 0));
    if (l.fim?.value) s.anoFimWd = maior(s.anoFimWd, anoDe(l.fim.value));
    if (l.temp?.value) s.temporadasWd = maior(s.temporadasWd, inteiroMin1(l.temp.value));
    if (l.ep?.value) s.episodiosWd = maior(s.episodiosWd, inteiroMin1(l.ep.value));
    if (l.tmdb?.value) s.tmdbId = menor(s.tmdbId, inteiroMin1(l.tmdb.value));
    if (l.imdb?.value && REGEX_IMDB.test(l.imdb.value)) s.imdb = l.imdb.value;
    if (l.tpt?.value) s.pt = l.tpt.value;
    if (l.ten?.value) s.en = l.ten.value;
  }
  const saida = [];
  for (const s of porQid.values()) {
    if (!(s.pt || s.en) || s.generos.size === 0) continue;
    saida.push({ ...s, generos: [...s.generos].sort((a, b) => numeroDoQid(a) - numeroDoQid(b)) });
  }
  return saida;
}

// Esquema da tabela de clima de séries: todo QID na tabela de humores de séries e nível válido (antes da rede).
export function validarClimaSeries(clima, tabela) {
  const erro = (mensagem) => [{ invariante: 'clima-series', erro: mensagem }];
  const gc = clima?.generosClima;
  if (typeof gc !== 'object' || gc === null || Array.isArray(gc)) return erro('`generosClima` deve ser objeto');
  const qidsTabela = new Set((tabela?.humores ?? []).flatMap((h) => (h.generos ?? []).map((g) => g.qid)));
  for (const [qid, nivel] of Object.entries(gc)) {
    if (!qidsTabela.has(qid)) return erro(`generosClima: QID fora de data/humores-series.json: ${qid}`);
    if (!NIVEIS_CLIMA.includes(nivel)) return erro(`generosClima: nível inválido (${nivel}) em ${qid}`);
  }
  return [];
}

// RV-5: status do TMDB -> situação.
export function situacaoDoStatus(status) {
  if (status === 'Canceled') return 'cancelada';
  if (status === 'Ended') return 'finalizada';
  if (['Returning Series', 'In Production', 'Planned', 'Pilot'].includes(status)) return 'em-andamento';
  return null;
}

// Ano de fim (h): null em andamento; senão ano de last_air_date, senão ano de P582, senão null; menor que o início = null.
function anoFimDe({ situacao, ultimaExibicao, anoFimWd, anoInicio }) {
  if (situacao === 'em-andamento') return null;
  const ano = anoDe(ultimaExibicao) ?? anoFimWd ?? null;
  return ano !== null && ano >= anoInicio ? ano : null;
}

function montarItem(base, campos) {
  const item = {
    qid: base.qid,
    titulo: campos.titulo,
    anoInicio: base.anoInicio,
    anoFim: campos.anoFim,
    situacao: campos.situacao,
    temporadas: campos.temporadas,
    episodios: campos.episodios,
    generos: base.generos,
    sitelinks: base.sitelinks,
    tmdbId: campos.tmdbId,
  };
  if (campos.tituloOriginal) item.tituloOriginal = campos.tituloOriginal;
  if (base.imdb) item.imdb = base.imdb;
  return item;
}

// Série-base + leitura do TMDB (`serie` de lerSerieTmdb) -> item sem tags (RV-1, RV-5, ano de fim, temporadas e episódios).
export function aplicarTmdb(base, serie) {
  const titulo = serie.name ?? base.pt ?? base.en;
  const situacao = situacaoDoStatus(serie.status);
  return montarItem(base, {
    titulo,
    tituloOriginal: serie.originalName && serie.originalName !== titulo ? serie.originalName : null,
    situacao,
    anoFim: anoFimDe({ situacao, ultimaExibicao: serie.ultimaExibicao, anoFimWd: base.anoFimWd, anoInicio: base.anoInicio }),
    temporadas: inteiroMin1(serie.temporadas) ?? base.temporadasWd,
    episodios: inteiroMin1(serie.episodios) ?? base.episodiosWd,
    tmdbId: base.tmdbId,
  });
}

// RV-4: sem resposta do TMDB. Título do rótulo, situação por P582, temporadas e episódios do Wikidata, tmdbId null.
export function aplicarFallback(base) {
  const situacao = base.anoFimWd !== null ? 'finalizada' : 'em-andamento';
  return montarItem(base, {
    titulo: base.pt ?? base.en,
    tituloOriginal: null,
    situacao,
    anoFim: anoFimDe({ situacao, ultimaExibicao: null, anoFimWd: base.anoFimWd, anoInicio: base.anoInicio }),
    temporadas: base.temporadasWd,
    episodios: base.episodiosWd,
    tmdbId: null,
  });
}

// Estado { tags, clima? } de uma série: temas casados pelas palavras-chave de TV e clima com os gêneros de clima-series.json.
export function tagsDaSerie({ keywords, generos, temas, clima }) {
  const casados = casarTemas(keywords, temas);
  const estado = { tags: [...casados].sort() };
  const nivel = calcularClima({ keywords, generos, temasCasados: casados, tabela: { ...temas, generosClima: clima.generosClima } });
  if (nivel !== undefined) estado.clima = nivel;
  return estado;
}

const prazoEstourado = () => new ErroBuild('prazo interno do build de séries (25 min) estourado', { invariante: 'prazo' });

// Séries-base (de mesclarLinhas) -> itens completos. TMDB sequencial só para quem tem P4983, com `agora() >= limite`
// conferido antes de cada envio. Devolve { series, lista (meta.temas.lista), contagens }.
export async function montarSeries({ linhas, tabela, clima, temas, cliente, agora = () => Date.now(), limite = Infinity }) {
  const qidsTabela = new Set(tabela.humores.flatMap((h) => h.generos.map((g) => g.qid)));
  const bases = mesclarLinhas(linhas, { qidsTabela });
  const contagens = { chamadasTmdb: 0, fallbackWikidata: 0, semTmdbId: 0 };
  const itens = [];
  const estados = new Map();
  for (const base of bases) {
    let item;
    let keywords = [];
    if (base.tmdbId === null) {
      contagens.semTmdbId += 1;
      item = aplicarFallback(base);
    } else {
      if (agora() >= limite) throw prazoEstourado();
      const antes = cliente.requisicoes();
      const r = await lerSerieTmdb(cliente, base.tmdbId);
      contagens.chamadasTmdb += cliente.requisicoes() - antes;
      if (r.ok) {
        item = aplicarTmdb(base, r.serie);
        keywords = r.serie.keywords;
      } else {
        contagens.fallbackWikidata += 1;
        item = aplicarFallback(base);
      }
    }
    estados.set(item.qid, tagsDaSerie({ keywords, generos: item.generos, temas, clima }));
    itens.push(item);
  }
  const limiar = aplicarLimiar(estados, temas);
  const series = itens.map((item) => {
    const estado = limiar.estados.get(item.qid);
    const novo = { ...item };
    if (estado.tags.length > 0) novo.tags = estado.tags;
    if (estado.clima !== undefined) novo.clima = estado.clima;
    return novo;
  });
  series.sort((a, b) => b.sitelinks - a.sitelinks || numeroDoQid(a.qid) - numeroDoQid(b.qid));
  return { series, lista: limiar.lista, contagens };
}

export const MIN_TOTAL_SERIES = 1000;
export const MIN_POR_HUMOR_SERIES = 40;
export const MIN_POR_GENERO_SERIES = 10;
export const MAX_BYTES_SERIES = 600000;
export const MIN_COBERTURA_SERIES = 0.95;

// Invariantes de D-4 antes de gravar. Devolve a lista de { invariante, erro }; vazia quando tudo passa.
export function validarSeries({ tabela, series, bytes }) {
  const erros = [];
  const total = series.length;
  if (total < MIN_TOTAL_SERIES) erros.push({ invariante: 'total-minimo', erro: `${total} séries; mínimo ${MIN_TOTAL_SERIES}` });
  for (const humor of tabela.humores) {
    const qids = new Set(humor.generos.map((g) => g.qid));
    const n = series.filter((s) => s.generos.some((q) => qids.has(q))).length;
    if (n < MIN_POR_HUMOR_SERIES) erros.push({ invariante: 'minimo-por-humor', erro: `humor ${humor.id} com ${n} elegíveis; mínimo ${MIN_POR_HUMOR_SERIES}` });
  }
  for (const qid of new Set(tabela.humores.flatMap((h) => h.generos.map((g) => g.qid)))) {
    const n = series.filter((s) => s.generos.includes(qid)).length;
    if (n < MIN_POR_GENERO_SERIES) erros.push({ invariante: 'minimo-por-genero', erro: `gênero ${qid} com ${n} séries; mínimo ${MIN_POR_GENERO_SERIES}` });
  }
  if (bytes > MAX_BYTES_SERIES) erros.push({ invariante: 'tamanho-maximo', erro: `${bytes} bytes; máximo ${MAX_BYTES_SERIES}` });
  const cobertas = (campo) => series.filter((s) => s[campo] !== null && s[campo] !== undefined).length;
  for (const [invariante, campo] of [['cobertura-situacao', 'situacao'], ['cobertura-temporadas', 'temporadas'], ['cobertura-episodios', 'episodios']]) {
    const n = cobertas(campo);
    if (total > 0 && n / total < MIN_COBERTURA_SERIES) erros.push({ invariante, erro: `${campo} em ${n} de ${total} séries; mínimo ${MIN_COBERTURA_SERIES * 100}%` });
  }
  const semAno = series.filter((s) => !Number.isInteger(s.anoInicio)).length;
  if (semAno > 0) erros.push({ invariante: 'ano-inicio', erro: `${semAno} séries sem anoInicio` });
  return erros;
}

export const PRAZO_SERIES_MS = 1500000;
export const MAX_SEM_TMDB = 0.2;
export const MIN_TAXA_TAGS = 0.5;

const fracao = (n, total) => (total === 0 ? 0 : Math.round((n / total) * 10000) / 10000);

// Orquestra o build (D-4). Devolve o código de saída; nada é gravado antes de todas as validações.
export async function executarSeries({
  tabela, clima, temas, contato, token, fetch: fetchImpl, esperar, criarSinal, agora = () => Date.now(), relogio = () => new Date(),
  stdout = () => {}, stderr = () => {}, gravar,
}) {
  const inicio = agora();
  const limite = inicio + PRAZO_SERIES_MS;
  try {
    const errosTabela = validarTabela(tabela);
    if (errosTabela.length > 0) throw new ErroBuild(errosTabela[0].erro, { invariante: errosTabela[0].invariante });
    const errosClima = validarClimaSeries(clima, tabela);
    if (errosClima.length > 0) throw new ErroBuild(errosClima[0].erro, { invariante: errosClima[0].invariante });
    const userAgent = montarUserAgent(contato);
    const credencial = exigirToken(token);

    const linhas = [];
    for (const qid of new Set(tabela.humores.flatMap((h) => h.generos.map((g) => g.qid)))) {
      const { dados } = await consultarWdqs(montarConsultaSeries(qid), { fetch: fetchImpl, esperar, userAgent, lote: qid });
      linhas.push(...(dados?.results?.bindings ?? []));
    }
    if (agora() >= limite) throw prazoEstourado();

    const cliente = criarClienteSeries({ token: credencial, fetch: fetchImpl, esperar, criarSinal, agora, limite });
    const { series, lista, contagens } = await montarSeries({ linhas, tabela, clima, temas, cliente, agora, limite });

    const total = series.length;
    if (total > 0 && (contagens.semTmdbId + contagens.fallbackWikidata) / total > MAX_SEM_TMDB) {
      throw new ErroBuild(`${contagens.semTmdbId + contagens.fallbackWikidata} de ${total} séries sem dados do TMDB; limite de 20%`, { invariante: 'tmdb-cobertura' });
    }
    const geradoEm = relogio().toISOString();
    const texto = JSON.stringify({
      meta: { geradoEm, fonte: 'Wikidata e TMDB', licenca: 'CC0 1.0 (Wikidata)', total, temas: { geradoEm, lista } },
      series,
    });
    const bytes = Buffer.byteLength(texto, 'utf8');
    const erros = validarSeries({ tabela, series, bytes });
    if (erros.length > 0) throw new ErroBuild(erros.map((e) => e.erro).join('; '), { invariante: erros[0].invariante });
    if (agora() >= limite) throw prazoEstourado();
    await gravar(texto);

    const conta = (fn) => series.filter(fn).length;
    const comTags = conta((s) => s.tags !== undefined || s.clima !== undefined);
    const taxaTags = total === 0 ? 0 : comTags / total;
    if (taxaTags < MIN_TAXA_TAGS) stdout(`::warning::taxa de series com tags ${Math.floor(taxaTags * 100)}%`);
    stdout(JSON.stringify({
      total,
      cobertura: {
        situacao: fracao(conta((s) => s.situacao !== null), total),
        temporadas: fracao(conta((s) => s.temporadas !== null), total),
        episodios: fracao(conta((s) => s.episodios !== null), total),
        tags: fracao(comTags, total),
      },
      chamadasTmdb: contagens.chamadasTmdb,
      fallbackWikidata: contagens.fallbackWikidata,
      semTmdbId: contagens.semTmdbId,
      duracaoMs: Math.max(0, Math.round(agora() - inicio)),
    }));
    return 0;
  } catch (erro) {
    stderr(linhaDeErro(erro));
    return 1;
  }
}
