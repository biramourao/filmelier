// Cliente do WDQS para o build manual do dataset (design.md D5).

const ENDPOINT = 'https://query.wikidata.org/sparql';
const TENTATIVAS = 3;
const ESPERAS_MS = [5000, 10000];
const TIMEOUT_MS = 70000;

// Erro do build com identificação do invariante ou do lote (vira linha JSON em stderr).
export class ErroBuild extends Error {
  constructor(mensagem, { invariante, lote } = {}) {
    super(mensagem);
    this.name = 'ErroBuild';
    if (invariante !== undefined) this.invariante = invariante;
    if (lote !== undefined) this.lote = lote;
  }
}

// FILMELIER_CONTATO: e-mail (contém @) ou URL (começa com http).
export function montarUserAgent(contato) {
  const valor = typeof contato === 'string' ? contato.trim() : '';
  if (valor === '' || !(valor.includes('@') || valor.startsWith('http'))) {
    throw new ErroBuild(
      'FILMELIER_CONTATO é obrigatória e deve ser um e-mail ou uma URL (política de User-Agent do WDQS)',
      { invariante: 'contato' },
    );
  }
  return `filmelier-build/0.1 (+${valor})`;
}

const esperarReal = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

// Devolve { dados, duracaoMs }; duracaoMs mede só a tentativa que respondeu.
export async function consultarWdqs(query, { fetch: fetchImpl = fetch, esperar = esperarReal, userAgent, lote = 'sem-nome', agora = () => performance.now() }) {
  const url = `${ENDPOINT}?${new URLSearchParams({ query, format: 'json' })}`;
  let ultimoMotivo = 'desconhecido';
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    const inicio = agora();
    try {
      const resp = await fetchImpl(url, {
        headers: { 'User-Agent': userAgent, Accept: 'application/sparql-results+json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const dados = await resp.json();
      return { dados, duracaoMs: Math.round(agora() - inicio) };
    } catch (erro) {
      ultimoMotivo = erro.message;
      if (tentativa < TENTATIVAS) await esperar(ESPERAS_MS[tentativa - 1]);
    }
  }
  throw new ErroBuild(`lote ${lote} falhou após ${TENTATIVAS} tentativas: ${ultimoMotivo}`, { lote });
}
