// Configuração da página (FILMELIER-3, design.md D-2 e D-13). Único lugar com a URL do Worker de provedores.
// Vazia = recurso "onde assistir" desligado, sem chamada nem aviso. Ao preencher, a origem https do Worker
// (sem barra final) entra aqui e na CSP de index.html no mesmo commit. Hoje: Worker de produção (P-32),
// que só atende a origem https://biramourao.github.io.
export const URL_WORKER = 'https://filmelier-provedores.filmelier.workers.dev';
