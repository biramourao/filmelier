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

A interface é uma página React (TypeScript) com tema cinema escuro, construída com Vite. A lógica de recomendação,
de dados e de enriquecimento continua em módulos `.mjs` puros em `src/`, sem DOM e testados com o `node:test` do
Node. Só `react` e `react-dom` vão para o navegador; o resto (Vite, TypeScript, Vitest, Testing Library) é de
desenvolvimento.

## Desenvolvimento

Requer Node 24. Depois de clonar:

```
npm ci            # instala as dependências a partir do package-lock.json
npm run dev       # servidor de desenvolvimento em http://localhost:5173/filmelier/ (sem CSP)
npm run build     # gera dist/ (com a CSP, a cópia de data/ e assets/ e o favicon)
npm run preview   # serve o dist/ para conferir o build de produção
```

`data/` continua sendo a fonte da base de filmes: o build a copia para `dist/data/`.

## Rodar os testes

```
npm test
node --import ./tests/apoio/sem-rede.mjs --test tests/*.test.mjs
node --import ./tests/apoio/sem-rede.mjs --test tests/entrega/*.test.mjs
npm run build && npm run test:dist
```

`npm test` roda 3 etapas: `node:test` (`npm run test:node`, lógica pura, CSS, workflows e README), Vitest
(`npm run test:ui`, componentes em jsdom) e `tsc --noEmit` (`npm run typecheck`). A suíte `node:test` não usa
nenhum pacote npm e roda sem `node_modules`; é o que o workflow semanal executa. A prova de que nenhum teste
toca a rede é o `--import ./tests/apoio/sem-rede.mjs`, que faz o `fetch` global lançar. Depois do build,
`npm run test:dist` confere o `dist/` (CSP, caminhos `/filmelier/`, cópia dos dados e tamanho do pacote).

## Publicação

O site é publicado pelo GitHub Actions (`.github/workflows/deploy.yml`), em 3 situações: push na `main`, disparo
manual e depois de cada execução bem-sucedida da atualização semanal da base. O workflow roda `npm ci`,
`npm audit`, `npm test`, `npm run build` e `npm run test:dist` e só então publica o `dist/`.

**Passo manual, antes do merge na `main`:** em Configurações do repositório, em Pages, troque a fonte de
"Deploy from a branch" para "GitHub Actions". Enquanto a fonte for a branch, o Pages serviria a casca do Vite sem
build e o site quebraria. Para voltar atrás, reverta o commit de merge e restaure a fonte "Deploy from a branch"
(`main`, raiz).

## Rotação da chave do TMDB

A chave gratuita do TMDB do solicitante é usada em 2 lugares. Ao trocá-la, troque nos dois, senão o build semanal falha com `tmdb-autorizacao` (e a base da semana anterior continua publicada) ou o Worker deixa de mostrar onde assistir.

1. **GitHub Actions** (build semanal das tags): em Configurações do repositório, na área de segredos do Actions, atualize o item `TMDB_TOKEN` com o novo valor.
2. **Cloudflare** (Worker `filmelier-provedores`): atualize o segredo `TMDB_TOKEN` do Worker pelo comando de segredo do wrangler, colando o novo valor quando ele pedir.

Nunca grave o valor da chave no repositório, em log ou em comando de terminal.
