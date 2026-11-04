# Filmelier

Diga como você está hoje e receba **até 5 sugestões de filmes** — com capa, sinopse em português, título de
lançamento no Brasil e onde assistir (assinatura, aluguel, compra ou grátis com anúncios). Dá para filtrar por
gênero, época (década de lançamento) e nota mínima da crítica.

Site: https://biramourao.github.io/filmelier/

## Como funciona

- **Filmes:** base gerada a partir do [Wikidata](https://www.wikidata.org) (CC0), em `data/filmes.json`.
- **Nota da crítica (0 a 10):** média de Rotten Tomatoes e Metacritic registrados no Wikidata (CC0), gerada por
  `scripts/build-notas.mjs`.
- **Capa e sinopse:** buscadas na hora na Wikipédia, só para os filmes exibidos (texto CC BY-SA).
- **Onde assistir e título no Brasil:** dados da JustWatch via [TMDB](https://www.themoviedb.org), por meio de
  um proxy em Cloudflare Workers (`worker/`), que guarda a chave do TMDB fora do repositório.
  Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.

Página estática em HTML, CSS e JavaScript puro, sem dependências e sem etapa de build.

## Testes

```
node --test --test-reporter=tap tests/*.test.mjs
```
