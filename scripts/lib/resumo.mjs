// Linhas JSON do build (RNF-3): resumo de sucesso em stdout e erro em stderr.

export function montarResumo({ tabela, filmes, bytes, duracaoMs, lotes }) {
  const porHumor = {};
  for (const humor of tabela.humores) {
    const qids = new Set(humor.generos.map((g) => g.qid));
    porHumor[humor.id] = filmes.filter((f) => f.generos.some((q) => qids.has(q))).length;
  }
  const porGenero = {};
  for (const qid of new Set(tabela.humores.flatMap((h) => h.generos.map((g) => g.qid)))) {
    porGenero[qid] = filmes.filter((f) => f.generos.includes(qid)).length;
  }
  return { total: filmes.length, porHumor, porGenero, bytes, duracaoMs, lotes };
}

// Uma única linha JSON; JSON.stringify escapa quebras de linha do texto.
export function linhaDeErro(erro) {
  const linha = { erro: String(erro?.message ?? erro) };
  if (erro?.invariante !== undefined) linha.invariante = erro.invariante;
  if (erro?.lote !== undefined) linha.lote = erro.lote;
  return JSON.stringify(linha);
}
