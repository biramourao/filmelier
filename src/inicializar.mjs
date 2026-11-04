// Sequência de inicialização da página (design.md D-7), sem DOM: carregar, depois desenhar.
// Qualquer exceção (de carregar ou de desenhar) leva ao estado de erro, com 1 console.error [filmelier].
// `desenhar` recebe o resultado de `carregar` (inclusive { erro }) e decide o que mostrar.

export async function inicializar({ carregar, desenhar, entrarEmErro, logger = console }) {
  try {
    const dados = await carregar();
    desenhar(dados);
  } catch (e) {
    logger.error(`[filmelier] falha ao iniciar a página: ${e?.message ?? String(e)}`);
    entrarEmErro();
  }
}
