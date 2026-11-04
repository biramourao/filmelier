// Texto SPARQL de um lote por gênero (design.md D5 e D-impl-3). Sem agregação.

// Corte de popularidade; reduz o volume e o custo da consulta no WDQS.
export const MIN_SITELINKS = 20;

// Instância direta de filme, com data de lançamento. A ordem dos padrões e o hint
// optimizer "None" fazem o WDQS começar pelo gênero e pelo corte de sitelinks.
export function montarConsulta(lote) {
  if (!/^Q\d+$/.test(lote.qid)) throw new Error(`QID inválido: ${lote.qid}`);
  return [
    'SELECT ?film ?g ?date ?sl ?imdb ?tpt ?ten WHERE {',
    '  hint:Query hint:optimizer "None" .',
    `  VALUES ?g { wd:${lote.qid} }`,
    '  ?film wdt:P136 ?g .',
    '  ?film wikibase:sitelinks ?sl .',
    `  FILTER(?sl >= ${MIN_SITELINKS})`,
    '  ?film wdt:P31 wd:Q11424 .',
    '  ?film wdt:P577 ?date .',
    '  OPTIONAL { ?film wdt:P345 ?imdb . }',
    '  OPTIONAL { ?film rdfs:label ?tpt . FILTER(LANG(?tpt) = "pt") }',
    '  OPTIONAL { ?film rdfs:label ?ten . FILTER(LANG(?ten) = "en") }',
    '}',
  ].join('\n');
}
