// Oscar por filme a partir do Wikidata: categorias distintas vencidas (P166) e indicadas (P1411 e P166).
// Categorias = tudo que está sob o Academy Awards (Q19020) via P31/P279/P361. Tudo que toca o mundo é injetado.

import { consultarWdqs, montarUserAgent, ErroBuild } from './wdqs.mjs';
import { MAX_BYTES } from './validar-dataset.mjs';
import { linhaDeErro } from './resumo.mjs';

export const TAMANHO_LOTE = 200;
export const PAUSA_ENTRE_LOTES_MS = 1000;

export const CONSULTA_CATEGORIAS = 'SELECT DISTINCT ?award WHERE { ?award (wdt:P31|wdt:P279|wdt:P361)+ wd:Q19020 . }';

const qidDe = (uri) => /(Q\d+)$/.exec(uri ?? '')?.[1] ?? null;

// bindings da consulta de categorias -> lista de QIDs sem repetição.
export function extrairCategorias(bindings) {
  return [...new Set(bindings.map((b) => qidDe(b.award?.value)).filter(Boolean))];
}

// A consulta única com UNION estoura o tempo do WDQS (504 já com 50 filmes); 4 consultas simples por lote, cada
// uma devolvendo pares (filme, categoria) distintos, rodam em segundos. A união e a contagem ficam em calcularOscar.
// venceu: true = a fonte conta como vitória (e também como indicação); false = só indicação.
export const FONTES = Object.freeze([
  { id: 'P166-direto', venceu: true, padrao: '?film wdt:P166 ?award .' },
  { id: 'P166-qualificador', venceu: true, padrao: '?st pq:P1686 ?film ; ps:P166 ?award .' },
  { id: 'P1411-direto', venceu: false, padrao: '?film wdt:P1411 ?award .' },
  { id: 'P1411-qualificador', venceu: false, padrao: '?st pq:P1686 ?film ; ps:P1411 ?award .' },
]);

export function montarConsultasOscar(qids, categorias) {
  const filmes = qids.map((q) => `wd:${q}`).join(' ');
  const premios = categorias.map((q) => `wd:${q}`).join(' ');
  return FONTES.map((fonte) => ({
    fonte,
    consulta: [
      'SELECT DISTINCT ?film ?award WHERE {',
      `  VALUES ?film { ${filmes} }`,
      `  ${fonte.padrao}`,
      `  VALUES ?award { ${premios} }`,
      '}',
    ].join('\n'),
  }));
}

// resultados: [{ venceu, bindings }] -> Map qid -> { vitorias, indicacoes } em categorias DISTINTAS.
// Vitória também é indicação; só entra quem tem alguma indicação.
export function calcularOscar(resultados) {
  const porFilme = new Map(); // qid -> { venceu: Set, indicado: Set }
  for (const { venceu, bindings } of resultados) {
    for (const b of bindings) {
      const qid = qidDe(b.film?.value);
      const award = qidDe(b.award?.value);
      if (!qid || !award) continue;
      if (!porFilme.has(qid)) porFilme.set(qid, { venceu: new Set(), indicado: new Set() });
      const conjuntos = porFilme.get(qid);
      conjuntos.indicado.add(award);
      if (venceu) conjuntos.venceu.add(award);
    }
  }
  const mapa = new Map();
  for (const [qid, c] of porFilme) mapa.set(qid, { vitorias: c.venceu.size, indicacoes: c.indicado.size });
  return mapa;
}

export function dividirEmLotes(qids, tamanho = TAMANHO_LOTE) {
  const lotes = [];
  for (let i = 0; i < qids.length; i += tamanho) lotes.push(qids.slice(i, i + tamanho));
  return lotes;
}

const inteiroPositivo = (n) => Number.isInteger(n) && n > 0;

// Campos opcionais oscarVitorias e oscarIndicacoes: inteiros positivos; indicações >= vitórias.
export function validarOscar(filmes) {
  const erros = [];
  for (const f of filmes) {
    for (const campo of ['oscarVitorias', 'oscarIndicacoes']) {
      if (campo in f && !inteiroPositivo(f[campo])) erros.push({ invariante: 'oscar', erro: `${f.qid}: ${campo} inválido (${f[campo]})` });
    }
    if ('oscarVitorias' in f && !('oscarIndicacoes' in f)) erros.push({ invariante: 'oscar', erro: `${f.qid}: vitórias sem indicações` });
    if (inteiroPositivo(f.oscarVitorias) && inteiroPositivo(f.oscarIndicacoes) && f.oscarIndicacoes < f.oscarVitorias) {
      erros.push({ invariante: 'oscar', erro: `${f.qid}: indicações (${f.oscarIndicacoes}) menores que vitórias (${f.oscarVitorias})` });
    }
  }
  return erros;
}

export async function executarOscar({
  dataset, contato, fetch: fetchImpl, esperar, stdout, stderr, gravar,
  agora = () => performance.now(), relogio = () => new Date(),
}) {
  try {
    const userAgent = montarUserAgent(contato);
    const inicio = agora();
    const { dados: dadosCat } = await consultarWdqs(CONSULTA_CATEGORIAS, { fetch: fetchImpl, esperar, userAgent, lote: 'oscar-categorias', agora });
    const categorias = extrairCategorias(dadosCat?.results?.bindings ?? []);
    if (categorias.length === 0) throw new ErroBuild('nenhuma categoria do Oscar encontrada', { invariante: 'oscar-categorias' });
    const lotes = dividirEmLotes(dataset.filmes.map((f) => f.qid));
    const resultados = [];
    for (let i = 0; i < lotes.length; i++) {
      for (const { fonte, consulta } of montarConsultasOscar(lotes[i], categorias)) {
        await esperar(PAUSA_ENTRE_LOTES_MS);
        const { dados } = await consultarWdqs(consulta, {
          fetch: fetchImpl, esperar, userAgent, lote: `oscar-${i + 1}-${fonte.id}`, agora,
        });
        resultados.push({ venceu: fonte.venceu, bindings: dados?.results?.bindings ?? [] });
      }
    }
    const oscar = calcularOscar(resultados);
    const filmes = dataset.filmes.map(({ oscarVitorias: _v, oscarIndicacoes: _i, ...resto }) => {
      const o = oscar.get(resto.qid);
      if (!o) return resto;
      return { ...resto, ...(o.vitorias > 0 ? { oscarVitorias: o.vitorias } : {}), oscarIndicacoes: o.indicacoes };
    });
    const comIndicacao = filmes.filter((f) => 'oscarIndicacoes' in f).length;
    const comVitoria = filmes.filter((f) => 'oscarVitorias' in f).length;
    const saida = {
      meta: { ...dataset.meta, oscar: { comIndicacao, comVitoria, total: filmes.length, geradoEm: relogio().toISOString() } },
      filmes,
    };
    const texto = JSON.stringify(saida);
    const bytes = Buffer.byteLength(texto, 'utf8');
    const erros = validarOscar(filmes);
    if (bytes > MAX_BYTES) erros.push({ invariante: 'tamanho-maximo', erro: `${bytes} bytes; máximo ${MAX_BYTES}` });
    if (erros.length > 0) throw new ErroBuild(erros.map((e) => e.erro).join('; '), { invariante: erros[0].invariante });
    await gravar(texto);
    stdout(JSON.stringify({
      total: filmes.length, comIndicacao, comVitoria, categorias: categorias.length, lotes: lotes.length,
      bytes, duracaoMs: Math.round(agora() - inicio),
    }));
    return 0;
  } catch (erro) {
    if (!(erro instanceof ErroBuild)) throw erro;
    stderr(linhaDeErro(erro));
    return 1;
  }
}
