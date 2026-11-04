# Filmelier

Site estático que recomenda até 5 filmes pelo humor do dia — com capa, sinopse em português, título de
lançamento no Brasil e onde assistir (assinatura, aluguel, compra ou grátis com anúncios). Dá para filtrar por
gênero, época (década de lançamento), nota mínima da crítica, Oscar (indicado ou vencedor) e por tags de tema e
clima (ex.: bruxaria, conto de fadas, clima leve ou sombrio), incluindo ou excluindo cada uma. Os dados vêm do
Wikidata (CC0), e as tags de tema e clima são derivadas no build semanal.

Site: https://biramourao.github.io/filmelier/

## Como funciona

- **Filmes:** base gerada a partir do [Wikidata](https://www.wikidata.org) (CC0), em `data/filmes.json`,
  atualizada toda quinta-feira pelo GitHub Actions (`.github/workflows/atualizar-base.yml`).
- **Nota da crítica (0 a 10):** média de Rotten Tomatoes e Metacritic registrados no Wikidata (CC0), gerada por
  `scripts/build-notas.mjs`.
- **Oscar:** categorias vencidas e indicadas por filme, registradas no Wikidata (CC0), geradas por
  `scripts/build-oscar.mjs`.
- **Tags de tema e clima:** derivadas por `scripts/build-temas.mjs` a partir das palavras-chave do TMDB e da
  tabela versionada `data/temas.json`, com curadoria em `data/curadoria-temas.json`. A base guarda só as tags
  próprias em português, nunca as palavras-chave do TMDB, e é recalculada toda semana.
- **Capa e sinopse:** buscadas na hora na Wikipédia, só para os filmes exibidos (texto CC BY-SA).
- **Onde assistir e título no Brasil:** dados da JustWatch via [TMDB](https://www.themoviedb.org), por meio de
  um proxy em Cloudflare Workers (`worker/`), que guarda a chave do TMDB fora do repositório.
  Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.

Página estática em HTML, CSS e JavaScript puro, sem dependências e sem etapa de build.

## Rodar os testes

```
npm test
node --import ./tests/apoio/sem-rede.mjs --test tests/*.test.mjs
node --import ./tests/apoio/sem-rede.mjs --test tests/entrega/*.test.mjs
```

Não há dependências npm: basta o Node.

## Rotação da chave do TMDB

A chave gratuita do TMDB do solicitante é usada em 2 lugares. Ao trocá-la, troque nos dois, senão o build semanal falha com `tmdb-autorizacao` (e a base da semana anterior continua publicada) ou o Worker deixa de mostrar onde assistir.

1. **GitHub Actions** (build semanal das tags): em Configurações do repositório, na área de segredos do Actions, atualize o item `TMDB_TOKEN` com o novo valor.
2. **Cloudflare** (Worker `filmelier-provedores`): atualize o segredo `TMDB_TOKEN` do Worker pelo comando de segredo do wrangler, colando o novo valor quando ele pedir.

Nunca grave o valor da chave no repositório, em log ou em comando de terminal.
