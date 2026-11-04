// CSP esperada no index.html (FILMELIER-3, design D-13). Função pura, só usada pelos testes.
// Com a URL do Worker vazia devolve a string exata; com valor, acrescenta a origem ao fim de connect-src.
const CONNECT_BASE = "'self' https://www.wikidata.org https://pt.wikipedia.org https://en.wikipedia.org";

export function cspEsperada(urlWorker) {
  const connect = urlWorker ? `${CONNECT_BASE} ${urlWorker}` : CONNECT_BASE;
  return `default-src 'self'; connect-src ${connect}; img-src 'self' https://upload.wikimedia.org https://image.tmdb.org; object-src 'none'; base-uri 'none'; form-action 'none'`;
}
