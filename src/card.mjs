// Modelo de card (design.md D-2, D-11), puro e sem DOM. Parte do item da FILMELIER-1 (montarItem, inalterado)
// e do enriquecimento { idioma, sinopse, capaUrl, artigoUrl } ou null (placeholder).

import { montarSecao } from './provedores.mjs';

export const ATRIBUTOS_LINK = Object.freeze({ target: '_blank', rel: 'noopener noreferrer' });
export const URL_LICENCA = 'https://creativecommons.org/licenses/by-sa/4.0/deed.pt-br';

// `provedores` (FILMELIER-3): null = recurso desligado (sem seção); { estado: 'buscando' } = lote em andamento;
// entrada do cliente de provedores (ou SEM_ENTRADA) = estado final. A seção é sempre o último campo do card.
export function montarCard(item, enriquecimento = null, provedores = null) {
  const e = enriquecimento ?? {};
  const capa = e.capaUrl && e.artigoUrl
    ? { src: e.capaUrl, alt: '', width: 160, height: 240, loading: 'lazy', referrerPolicy: 'no-referrer' }
    : null;
  const comSinopse = typeof e.sinopse === 'string' && e.sinopse !== '' && Boolean(e.artigoUrl);
  const ingles = comSinopse && e.idioma === 'en';
  // Título pt-BR do Worker (FILMELIER-3): vira o principal; "Título original" só quando difere dele.
  const ptBr = typeof provedores?.titulo === 'string' && provedores.titulo !== '' ? provedores.titulo : null;
  const original = ptBr === null ? null : (provedores.tituloOriginal ?? item.titulo);
  const tituloOriginal = original !== null && original !== ptBr ? original : null;
  return {
    titulo: ptBr ?? item.titulo,
    tituloOriginal,
    tituloOriginalTexto: tituloOriginal === null ? null : `Título original: ${tituloOriginal}`,
    ano: item.ano,
    generos: item.generos,
    notaTexto: typeof item.nota === 'number' ? `Nota ${item.nota.toFixed(1).replace('.', ',')}` : null,
    links: item.links,
    capa,
    placeholder: capa === null,
    sinopse: comSinopse ? e.sinopse : null,
    marcaIdioma: ingles ? '(en)' : null,
    lang: ingles ? 'en' : null,
    creditoTexto: comSinopse ? 'Sinopse: Wikipédia (CC BY-SA)' : null,
    creditoUrl: comSinopse ? e.artigoUrl : null,
    licencaUrl: comSinopse ? URL_LICENCA : null,
    creditoImagemTexto: capa && e.artigoUrl ? 'Imagem: Wikipédia' : null,
    creditoImagemUrl: capa && e.artigoUrl ? e.artigoUrl : null,
    atributosLink: ATRIBUTOS_LINK,
    provedores: provedores === null ? null : montarSecao(provedores),
  };
}
