// Item de exibição de um filme (pura, sem DOM). `generos` é a lista { qid, rotulo }
// devolvida por listarGeneros, já em ordem alfabética pt-BR.

const REL = 'noopener noreferrer';

export function montarItem(filme, generos) {
  const rotulos = generos.filter((g) => filme.generos.includes(g.qid)).map((g) => g.rotulo);
  const links = [{ texto: 'Wikidata', href: `https://www.wikidata.org/wiki/${filme.qid}`, target: '_blank', rel: REL }];
  if (filme.imdb) {
    links.push({ texto: 'IMDb', href: `https://www.imdb.com/title/${filme.imdb}/`, target: '_blank', rel: REL });
  }
  const item = { titulo: filme.titulo, ano: String(filme.ano), generos: rotulos, links };
  if (typeof filme.nota === 'number') item.nota = filme.nota;
  if (Number.isInteger(filme.oscarVitorias) && filme.oscarVitorias > 0) item.oscarVitorias = filme.oscarVitorias;
  if (Number.isInteger(filme.oscarIndicacoes) && filme.oscarIndicacoes > 0) item.oscarIndicacoes = filme.oscarIndicacoes;
  return item;
}
