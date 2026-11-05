// Política de segurança de conteúdo do site publicado (FILMELIER-5, D-10). Pura, sem DOM: o plugin `cspNoBuild`
// do vite.config.ts a injeta no `dist/index.html`. Sem 'unsafe-inline' nem 'unsafe-eval'.
// Com a URL do Worker vazia, só as origens fixas; com valor, a origem entra ao fim de connect-src.
export function montarCsp(urlWorker) {
  const connect = ["'self'", 'https://www.wikidata.org', 'https://pt.wikipedia.org', 'https://en.wikipedia.org'];
  if (urlWorker) connect.push(urlWorker);
  return [
    "default-src 'self'",
    `connect-src ${connect.join(' ')}`,
    "img-src 'self' https://upload.wikimedia.org https://image.tmdb.org",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}
