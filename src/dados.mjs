// Carga dos dados estáticos e formatação da data (design.md D4 e D-7). Sem DOM.

const ISO_8601 = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

async function buscarJson(fetchImpl, url, signal) {
  const resposta = await fetchImpl(url, { signal });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status} em ${url}`);
  return resposta.json();
}

// Forma mínima dos 2 arquivos (design D-7); lança Error com o motivo.
export function validarDados(humores, filmes) {
  if (!Array.isArray(humores?.humores) || humores.humores.length === 0) {
    throw new Error('data/humores.json sem a lista "humores"');
  }
  if (!Array.isArray(filmes?.filmes)) throw new Error('data/filmes.json sem a lista "filmes"');
  const geradoEm = filmes.meta?.geradoEm;
  if (typeof geradoEm !== 'string' || !ISO_8601.test(geradoEm) || Number.isNaN(Date.parse(geradoEm))) {
    throw new Error('data/filmes.json sem meta.geradoEm válido');
  }
}

// Nunca lança: em falha devolve { erro } e registra 1 console.error com prefixo [filmelier].
// O 3º parâmetro é opcional: timeout (15.000 ms) e fábrica do sinal, injetável nos testes.
export async function carregarDados(fetchImpl, logger = console, { timeoutMs = 15000, criarSinal = (ms) => AbortSignal.timeout(ms) } = {}) {
  try {
    const [humores, filmes] = await Promise.all([
      buscarJson(fetchImpl, 'data/humores.json', criarSinal(timeoutMs)),
      buscarJson(fetchImpl, 'data/filmes.json', criarSinal(timeoutMs)),
    ]);
    validarDados(humores, filmes);
    return { humores, filmes, erro: null };
  } catch (e) {
    const motivo = e?.message ?? String(e);
    logger.error(`[filmelier] falha ao carregar dados: ${motivo}`);
    return { humores: null, filmes: null, erro: motivo };
  }
}

// dd/mm/aaaa em UTC, para o dia não mudar conforme o fuso do visitante.
export function formatarData(iso) {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}
