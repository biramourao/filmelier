// Orquestração testável do build do dataset (design.md D5). Tudo que toca o mundo
// (rede, relógio, saída, disco) é injetado; devolve o código de saída.

import { consultarWdqs, montarUserAgent, ErroBuild } from './wdqs.mjs';
import { montarConsulta } from './consulta.mjs';
import { montarFilmes, LIMITE_FILMES } from './montar-dataset.mjs';
import { validarDataset, validarTabela } from './validar-dataset.mjs';
import { montarResumo, linhaDeErro } from './resumo.mjs';

// 1 lote por gênero da tabela (D-impl-3): o custo no WDQS é a varredura gênero x sitelinks.
export function gerarLotes(qids) {
  return qids.map((qid) => ({ nome: qid, qid }));
}

export async function executarBuild({
  tabela,
  contato,
  fetch: fetchImpl,
  esperar,
  stdout,
  stderr,
  gravar,
  agora = () => performance.now(),
  relogio = () => new Date(),
  limite = LIMITE_FILMES,
}) {
  try {
    // 1) esquema da tabela, 2) contato; ambos antes de qualquer requisição.
    const errosTabela = validarTabela(tabela);
    if (errosTabela.length > 0) {
      throw new ErroBuild(errosTabela[0].erro, { invariante: 'esquema-humores' });
    }
    const userAgent = montarUserAgent(contato);

    const inicio = agora();
    const qids = [...new Set(tabela.humores.flatMap((h) => h.generos.map((g) => g.qid)))];
    const linhas = [];
    const lotesResumo = [];
    for (const lote of gerarLotes(qids)) {
      const consulta = montarConsulta(lote);
      const { dados, duracaoMs } = await consultarWdqs(consulta, {
        fetch: fetchImpl, esperar, userAgent, lote: lote.nome, agora,
      });
      linhas.push(...(dados?.results?.bindings ?? []));
      lotesResumo.push({ lote: lote.nome, duracaoMs });
    }

    const filmes = montarFilmes(linhas, { qidsTabela: new Set(qids), limite });
    const dataset = {
      meta: { geradoEm: relogio().toISOString(), fonte: 'Wikidata', licenca: 'CC0 1.0', total: filmes.length },
      filmes,
    };
    const texto = JSON.stringify(dataset);
    const bytes = Buffer.byteLength(texto, 'utf8');

    const erros = validarDataset({ tabela, filmes, bytes });
    if (erros.length > 0) {
      throw new ErroBuild(erros.map((e) => e.erro).join('; '), { invariante: erros[0].invariante });
    }

    await gravar(texto);
    stdout(JSON.stringify(montarResumo({ tabela, filmes, bytes, duracaoMs: Math.round(agora() - inicio), lotes: lotesResumo })));
    return 0;
  } catch (erro) {
    if (!(erro instanceof ErroBuild)) throw erro; // a casca (CLI) trata exceção inesperada
    stderr(linhaDeErro(erro));
    return 1;
  }
}
