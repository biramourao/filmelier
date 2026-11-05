// Lógica pura da aba Séries (FILMELIER-6, design D-7): textos, linha de anos, situação, temporadas e episódios e o
// modelo do card de série. Sem DOM. Séries não têm nota nem prêmio: o card nunca os mostra.

import { montarCard } from './card.mjs';

const REL = 'noopener noreferrer';
const TRACO = '–'; // U+2013, traço do intervalo de anos

// Mensagens de resultado vazio e `itens` dos avisos de relaxamento de gênero (recomendar({ textos })).
export const TEXTOS_SERIES = Object.freeze({
  nenhum: 'Não encontramos séries para essa combinação. Escolha outro humor ou gênero.',
  nenhumFiltros: 'Nenhuma série com esses filtros. Tente ampliar o período.',
  nenhumTags: 'Nenhuma série com esses temas. Tente incluir outro tema ou desfazer um "não quero".',
  nenhumTagsFiltros: 'Nenhuma série com esses temas e filtros. Tente incluir outro tema, desfazer um "não quero" ou ampliar o período.',
  itens: 'séries',
});

// "AAAA–AAAA" com anoFim diferente de anoInicio; "AAAA–" em andamento; senão "AAAA".
export function textoAnos(serie) {
  const inicio = serie.anoInicio;
  if (Number.isInteger(serie.anoFim) && serie.anoFim !== inicio) return `${inicio}${TRACO}${serie.anoFim}`;
  if (serie.situacao === 'em-andamento') return `${inicio}${TRACO}`;
  return String(inicio);
}

const SITUACOES = Object.freeze({ cancelada: 'Cancelada', finalizada: 'Finalizada', 'em-andamento': 'Em andamento' });
export const textoSituacao = (situacao) => SITUACOES[situacao] ?? 'Situação não informada';

const plural = (n, singular, pluralTexto) => `${n.toLocaleString('pt-BR')} ${n === 1 ? singular : pluralTexto}`;
const inteiroPositivo = (v) => Number.isInteger(v) && v >= 1;

// "Situação · N temporada(s) · N episódio(s)"; campo nulo sai sem separador sobrando.
export function linhaSerie(serie) {
  const partes = [textoSituacao(serie.situacao)];
  if (inteiroPositivo(serie.temporadas)) partes.push(plural(serie.temporadas, 'temporada', 'temporadas'));
  if (inteiroPositivo(serie.episodios)) partes.push(plural(serie.episodios, 'episódio', 'episódios'));
  return partes.join(' · ');
}

// Item de exibição: rótulos dos gêneros na ordem de `serie.generos` (a ordem do build), sem nota nem Oscar.
export function montarItemSerie(serie, generos) {
  const rotulos = serie.generos.map((qid) => generos.find((g) => g.qid === qid)?.rotulo).filter(Boolean);
  const links = [{ texto: 'Wikidata', href: `https://www.wikidata.org/wiki/${serie.qid}`, target: '_blank', rel: REL }];
  if (serie.imdb) links.push({ texto: 'IMDb', href: `https://www.imdb.com/title/${serie.imdb}/`, target: '_blank', rel: REL });
  const item = { titulo: serie.titulo, ano: textoAnos(serie), generos: rotulos, links };
  if (Array.isArray(serie.tags) && serie.tags.length > 0) item.tags = serie.tags;
  if (typeof serie.clima === 'string' && serie.clima !== '') item.clima = serie.clima;
  return item;
}

// Card de série = card de filme com título da série (o Worker não traz título de série), sem nota nem prêmio e com a
// linha de situação.
export function montarCardSerie(serie, generos, enriquecimento = null, provedores = null, opcoesTags = null) {
  const card = montarCard(montarItemSerie(serie, generos), enriquecimento, provedores, opcoesTags);
  const original = typeof serie.tituloOriginal === 'string' && serie.tituloOriginal !== '' ? serie.tituloOriginal : null;
  return {
    ...card,
    titulo: serie.titulo,
    tituloOriginal: original,
    tituloOriginalTexto: original === null ? null : `Título original: ${original}`,
    notaTexto: null,
    oscar: null,
    situacaoTexto: textoSituacao(serie.situacao),
    linhaSerie: linhaSerie(serie),
    rotuloTags: 'Tags da série',
  };
}
