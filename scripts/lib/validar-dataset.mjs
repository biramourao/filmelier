// Invariantes do build (RF-12). Cada função devolve uma lista de { invariante, erro }.

export const MIN_TOTAL = 2000;
export const MIN_POR_HUMOR = 40;
export const MIN_POR_GENERO = 10;
export const MAX_BYTES = 2621440;

// Esquema da tabela de humores: 7 humores, 1 a 4 gêneros cada, QID bem formado, rótulos não vazios.
export function validarTabela(tabela) {
  const erro = (mensagem) => [{ invariante: 'esquema-humores', erro: mensagem }];
  const humores = tabela?.humores;
  if (!Array.isArray(humores) || humores.length !== 7) return erro('a tabela deve ter 7 humores');
  const ids = new Set();
  for (const h of humores) {
    if (typeof h.id !== 'string' || h.id === '' || ids.has(h.id)) return erro(`id de humor inválido ou repetido: ${h.id}`);
    ids.add(h.id);
    if (typeof h.rotulo !== 'string' || h.rotulo === '') return erro(`humor ${h.id} sem rótulo`);
    if (!Array.isArray(h.generos) || h.generos.length < 1 || h.generos.length > 4) return erro(`humor ${h.id} deve ter de 1 a 4 gêneros`);
    for (const g of h.generos) {
      if (!/^Q\d+$/.test(g?.qid ?? '')) return erro(`QID de gênero malformado no humor ${h.id}: ${g?.qid}`);
      if (typeof g.rotulo !== 'string' || g.rotulo === '') return erro(`gênero ${g.qid} sem rótulo`);
    }
  }
  return [];
}

export function validarDataset({ tabela, filmes, bytes }) {
  const erros = [];
  if (filmes.length < MIN_TOTAL) {
    erros.push({ invariante: 'total-minimo', erro: `${filmes.length} filmes; mínimo ${MIN_TOTAL}` });
  }
  for (const humor of tabela.humores) {
    const qids = new Set(humor.generos.map((g) => g.qid));
    const n = filmes.filter((f) => f.generos.some((q) => qids.has(q))).length;
    if (n < MIN_POR_HUMOR) {
      erros.push({ invariante: 'minimo-por-humor', erro: `humor ${humor.id} com ${n} elegíveis; mínimo ${MIN_POR_HUMOR}` });
    }
  }
  const todos = new Set(tabela.humores.flatMap((h) => h.generos.map((g) => g.qid)));
  for (const qid of todos) {
    const n = filmes.filter((f) => f.generos.includes(qid)).length;
    if (n < MIN_POR_GENERO) {
      erros.push({ invariante: 'minimo-por-genero', erro: `gênero ${qid} com ${n} filmes; mínimo ${MIN_POR_GENERO}` });
    }
  }
  if (bytes > MAX_BYTES) {
    erros.push({ invariante: 'tamanho-maximo', erro: `${bytes} bytes; máximo ${MAX_BYTES}` });
  }
  return erros;
}
