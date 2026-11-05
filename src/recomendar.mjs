// Lógica pura de recomendação (sem DOM). Ver design.md D3.

// Textos de resultado vazio e `itens` dos avisos de relaxamento de gênero. Filmes é o padrão; séries passam os próprios
// (src/serie.mjs, FILMELIER-6).
export const TEXTOS_FILMES = Object.freeze({
  nenhum: 'Não encontramos filmes para essa combinação. Escolha outro humor ou gênero.',
  nenhumFiltros: 'Nenhum filme com esses filtros. Tente ampliar o período, baixar a nota mínima ou mudar o filtro de Oscar.',
  nenhumTags: 'Nenhum filme com esses temas. Tente incluir outro tema ou desfazer um "não quero".',
  nenhumTagsFiltros: 'Nenhum filme com esses temas e filtros. Tente incluir outro tema, desfazer um "não quero", ampliar o período, baixar a nota mínima ou mudar o filtro de Oscar.',
  itens: 'filmes',
});

const definido = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

// anoDe maior que anoAte é tratado como engano de ordem: os dois valores são trocados.
// oscar: '' (qualquer), 'indicado' ou 'vencedor'; qualquer outro valor vale como ''.
export function normalizarFiltros({ anoDe = null, anoAte = null, notaMin = null, oscar = '' } = {}) {
  let de = definido(anoDe) ? Number(anoDe) : null;
  let ate = definido(anoAte) ? Number(anoAte) : null;
  if (de !== null && ate !== null && de > ate) [de, ate] = [ate, de];
  return {
    anoDe: de,
    anoAte: ate,
    notaMin: definido(notaMin) ? Number(notaMin) : null,
    oscar: oscar === 'indicado' || oscar === 'vencedor' ? oscar : '',
  };
}

// Filtros inclusivos e opcionais; com notaMin definido, filme sem nota fica de fora.
// Oscar: 'indicado' exige oscarIndicacoes > 0; 'vencedor' exige oscarVitorias > 0.
// `campoAno`: campo do ano de cada item ('ano' nos filmes, 'anoInicio' nas séries).
export function filtrarFilmes(filmes, filtros, campoAno = 'ano') {
  const { anoDe, anoAte, notaMin, oscar } = normalizarFiltros(filtros);
  if (anoDe === null && anoAte === null && notaMin === null && oscar === '') return filmes;
  return filmes.filter((f) => (anoDe === null || f[campoAno] >= anoDe)
    && (anoAte === null || f[campoAno] <= anoAte)
    && (notaMin === null || (typeof f.nota === 'number' && f.nota >= notaMin))
    && (oscar === '' || (oscar === 'indicado' ? f.oscarIndicacoes > 0 : f.oscarVitorias > 0)));
}

// Tags (temas e climas) por id. Ids conhecidos: `tagsValidas` (ids de meta.temas.lista) ou, sem ela, os que aparecem em
// `tags` ou `clima` de algum filme. Desconhecido é ignorado; id nas duas listas vale só como excluído.
export function normalizarTags({ incluir = [], excluir = [], tagsValidas, filmes = [] } = {}) {
  const conhecidos = tagsValidas
    ? new Set(tagsValidas)
    : new Set(filmes.flatMap((f) => [...(f.tags ?? []), ...(f.clima ? [f.clima] : [])]));
  const unicos = (ids) => [...new Set((Array.isArray(ids) ? ids : []).filter((id) => conhecidos.has(id)))];
  const fora = unicos(excluir);
  return { incluir: unicos(incluir).filter((id) => !fora.includes(id)), excluir: fora };
}

const temTag = (f, id) => (f.tags ?? []).includes(id) || f.clima === id;

// incluir: OU (no mínimo 1 id em tags ou clima); excluir: remove quem tem qualquer id. Sem tags ativas devolve o mesmo array.
export function filtrarTags(filmes, { incluir = [], excluir = [] } = {}) {
  if (incluir.length === 0 && excluir.length === 0) return filmes;
  return filmes.filter((f) => !excluir.some((id) => temTag(f, id)) && (incluir.length === 0 || incluir.some((id) => temTag(f, id))));
}

function listaDeHumores(humores) {
  return Array.isArray(humores) ? humores : humores.humores;
}

const TAMANHO_CANDIDATOS = 40;
const TAMANHO_LISTA = 5;

function numeroDoQid(qid) {
  return Number(qid.slice(1));
}

// Os 40 mais citados: sitelinks decrescente, desempate por QID numérico crescente.
export function conjuntoCandidato(elegiveis) {
  return [...elegiveis]
    .sort((a, b) => b.sitelinks - a.sitelinks || numeroDoQid(a.qid) - numeroDoQid(b.qid))
    .slice(0, TAMANHO_CANDIDATOS);
}

// Fisher-Yates parcial com o rng recebido.
function sortear(pool, k, rng) {
  const copia = [...pool];
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (copia.length - i));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia.slice(0, k);
}

// Com 10 ou mais candidatos e anteriores, o pool exclui os anteriores (sobram >= 5).
function selecionar(elegiveis, rng, anteriores = []) {
  const candidatos = conjuntoCandidato(elegiveis);
  const idsAnteriores = new Set(anteriores.map((a) => (typeof a === 'string' ? a : a.qid)));
  const pool = candidatos.length >= 10 && idsAnteriores.size > 0
    ? candidatos.filter((f) => !idsAnteriores.has(f.qid))
    : candidatos;
  return sortear(pool, Math.min(TAMANHO_LISTA, pool.length), rng);
}

// Devolve { nivel, filmes, aviso, mensagem }. generoQid = null significa "Qualquer gênero".
// Filtros de ano, nota e Oscar (anoDe, anoAte, notaMin, oscar) valem antes dos níveis de relaxamento, que operam sobre o conjunto filtrado.
export function recomendar({ filmes: todos, humores, humorId, generoQid = null, rng, anteriores = [], anoDe = null, anoAte = null, notaMin = null, oscar = '', incluir = [], excluir = [], tagsValidas, textos = TEXTOS_FILMES, campoAno = 'ano' }) {
  const filtros = normalizarFiltros({ anoDe, anoAte, notaMin, oscar });
  const comFiltros = filtros.anoDe !== null || filtros.anoAte !== null || filtros.notaMin !== null || filtros.oscar !== '';
  const tags = normalizarTags({ incluir, excluir, tagsValidas, filmes: todos });
  const comTags = tags.incluir.length > 0 || tags.excluir.length > 0;
  const filmes = filtrarTags(filtrarFilmes(todos, filtros, campoAno), tags);
  const humor = listaDeHumores(humores).find((h) => h.id === humorId);
  const qidsDoHumor = new Set(humor ? humor.generos.map((g) => g.qid) : []);
  const doHumor = filmes.filter((f) => f.generos.some((q) => qidsDoHumor.has(q)));

  let nivel = 'humor';
  let elegiveis = doHumor;
  let aviso = '';
  if (generoQid) {
    const rotuloGenero = listarGeneros({ humores: listaDeHumores(humores) }).find((g) => g.qid === generoQid)?.rotulo ?? generoQid;
    const comGenero = filmes.filter((f) => f.generos.includes(generoQid));
    const ambos = doHumor.filter((f) => f.generos.includes(generoQid));
    const prefixo = `Não encontramos ${textos.itens} para esse humor com o gênero ${rotuloGenero}.`;
    if (ambos.length > 0) {
      nivel = 'humor+genero';
      elegiveis = ambos;
    } else if (comGenero.length > 0) {
      nivel = 'genero';
      elegiveis = comGenero;
      aviso = `${prefixo} Mostrando ${textos.itens} de ${rotuloGenero}.`;
    } else if (doHumor.length > 0) {
      aviso = `${prefixo} Mostrando ${textos.itens} para o humor ${humor.rotulo}.`;
    }
  }
  if (elegiveis.length === 0) {
    const mensagem = comTags ? (comFiltros ? textos.nenhumTagsFiltros : textos.nenhumTags) : (comFiltros ? textos.nenhumFiltros : textos.nenhum);
    return { nivel: 'nenhum', filmes: [], aviso: '', mensagem, candidatos: [] };
  }
  return { nivel, filmes: selecionar(elegiveis, rng, anteriores), aviso, mensagem: '', candidatos: conjuntoCandidato(elegiveis) };
}

// Gêneros distintos da tabela de humores, em ordem alfabética pt-BR.
export function listarGeneros(tabela) {
  const mapa = new Map();
  for (const humor of tabela.humores) {
    for (const g of humor.generos) {
      if (!mapa.has(g.qid)) mapa.set(g.qid, { qid: g.qid, rotulo: g.rotulo });
    }
  }
  return [...mapa.values()].sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
}
