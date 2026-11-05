// Rodapé com as atribuições exigidas (Wikidata CC0, notas da crítica, Oscar e aviso do TMDB com o logo local).
// O logo é servido pela própria origem (assets/tmdb-logo.svg, copiado para o dist) e o link abre em nova aba.
export function Rodape({ data }: { data: string }) {
  return (
    <footer>
      <p>
        <a href="https://www.wikidata.org/" target="_blank" rel="noopener noreferrer">Dados de filmes e séries: Wikidata (CC0)</a>
        {' '}— gerado em <span id="data-geracao">{data}</span>
      </p>
      <p>Notas da crítica: Rotten Tomatoes e Metacritic via Wikidata (CC0)</p>
      <p>Oscar: dados do Wikidata (CC0)</p>
      <p>Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.</p>
      <p className="logo-tmdb">
        <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">
          <img src="assets/tmdb-logo.svg" alt="TMDB" width={123} height={16} />
        </a>
      </p>
    </footer>
  );
}
