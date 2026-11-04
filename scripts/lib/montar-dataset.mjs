// Mescla as linhas SPARQL (várias por filme) em filmes do dataset (design.md D5).

export const LIMITE_FILMES = 12000;

const qidDe = (uri) => uri.slice(uri.lastIndexOf('/') + 1);
const numeroDoQid = (qid) => Number(qid.slice(1));

export function montarFilmes(linhas, { qidsTabela, limite = LIMITE_FILMES }) {
  const porQid = new Map();
  for (const l of linhas) {
    if (!l.film || !l.g || !l.date) continue;
    const genero = qidDe(l.g.value);
    if (!qidsTabela.has(genero)) continue;
    const ano = Number(String(l.date.value).slice(0, 4));
    if (!Number.isInteger(ano) || ano < 1000 || ano > 9999) continue;
    const qid = qidDe(l.film.value);
    let f = porQid.get(qid);
    if (!f) {
      f = { qid, pt: null, en: null, ano, generos: new Set(), sitelinks: 0, imdb: null };
      porQid.set(qid, f);
    }
    f.ano = Math.min(f.ano, ano);
    f.generos.add(genero);
    f.sitelinks = Math.max(f.sitelinks, Number(l.sl?.value ?? 0));
    if (l.tpt?.value) f.pt = l.tpt.value;
    if (l.ten?.value) f.en = l.ten.value;
    if (l.imdb?.value && /^tt\d+$/.test(l.imdb.value)) f.imdb = l.imdb.value;
  }
  const filmes = [];
  for (const f of porQid.values()) {
    const titulo = f.pt || f.en;
    if (!titulo || f.generos.size === 0) continue;
    const filme = { qid: f.qid, titulo, ano: f.ano, generos: [...f.generos], sitelinks: f.sitelinks };
    if (f.imdb) filme.imdb = f.imdb;
    filmes.push(filme);
  }
  filmes.sort((a, b) => b.sitelinks - a.sitelinks || numeroDoQid(a.qid) - numeroDoQid(b.qid));
  return filmes.slice(0, limite);
}
