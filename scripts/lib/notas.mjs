// Nota Filmelier (0 a 10) a partir das notas da crítica no Wikidata (P444 avaliado por P447):
// Rotten Tomatoes (Q105584) e Metacritic (Q150248). Tudo que toca o mundo é injetado.

import { consultarWdqs, montarUserAgent, ErroBuild } from './wdqs.mjs';
import { MAX_BYTES } from './validar-dataset.mjs';
import { linhaDeErro } from './resumo.mjs';

export const TAMANHO_LOTE = 300;
export const PAUSA_ENTRE_LOTES_MS = 1000;
export const FONTES = Object.freeze({ Q105584: 'rottenTomatoes', Q150248: 'metacritic' });

const limpar = (n) => Math.round(n * 1e6) / 1e6; // remove ruído de ponto flutuante
const arredondar1 = (n) => Math.round(limpar(n) * 10) / 10;

// "93%" -> 9.3; "a/b" -> a/b*10; fora de 0 a 10 ou formato desconhecido -> null.
export function normalizarNota(texto) {
  const t = String(texto ?? '').trim().replace(',', '.');
  const num = '(\\d+(?:\\.\\d+)?)';
  let valor = null;
  let m = new RegExp(`^${num}\\s*%$`).exec(t);
  if (m) valor = Number(m[1]) / 10;
  m = new RegExp(`^${num}\\s*/\\s*${num}$`).exec(t);
  if (m) valor = Number(m[2]) > 0 ? (Number(m[1]) / Number(m[2])) * 10 : null;
  if (valor === null || !Number.isFinite(valor)) return null;
  valor = limpar(valor);
  return valor >= 0 && valor <= 10 ? valor : null;
}

export function montarConsultaNotas(qids) {
  const valores = qids.map((q) => `wd:${q}`).join(' ');
  return [
    'SELECT ?film ?score ?by WHERE {',
    `  VALUES ?film { ${valores} }`,
    '  VALUES ?by { wd:Q105584 wd:Q150248 }',
    '  ?film p:P444 ?st .',
    '  ?st ps:P444 ?score ; pq:P447 ?by .',
    '}',
  ].join('\n');
}

const qidDe = (uri) => /(Q\d+)$/.exec(uri ?? '')?.[1] ?? null;

// bindings do WDQS -> Map qid -> { nota (média das fontes, sem arredondar), fontes (quantas fontes válidas) }.
export function calcularNotasBrutas(bindings) {
  const porFilme = new Map(); // qid -> Map fonte -> valores[]
  for (const b of bindings) {
    const qid = qidDe(b.film?.value);
    const fonte = FONTES[qidDe(b.by?.value)];
    const valor = normalizarNota(b.score?.value);
    if (!qid || !fonte || valor === null) continue;
    if (!porFilme.has(qid)) porFilme.set(qid, new Map());
    const fontes = porFilme.get(qid);
    fontes.set(fonte, [...(fontes.get(fonte) ?? []), valor]);
  }
  const notas = new Map();
  for (const [qid, fontes] of porFilme) {
    const medias = [...fontes.values()].map((v) => v.reduce((a, c) => a + c, 0) / v.length);
    notas.set(qid, { nota: medias.reduce((a, c) => a + c, 0) / medias.length, fontes: medias.length });
  }
  return notas;
}

// bindings do WDQS -> Map qid -> nota (média das fontes, 1 casa), sem suavização. Filme sem valor válido não entra.
export function calcularNotas(bindings) {
  return new Map([...calcularNotasBrutas(bindings)].map(([qid, { nota }]) => [qid, arredondar1(nota)]));
}

export const PESO_FONTE_UNICA = 0.75;

// Filme de uma fonte só puxa para a média global M (média dos filmes de duas fontes; sem nenhum, de todos com nota):
// nota = 0,75 x nota + 0,25 x M, 1 casa. Duas fontes ficam como estão (só arredondadas).
export function suavizarNotas(brutas) {
  const todas = [...brutas.values()];
  const duas = todas.filter((b) => b.fontes >= 2);
  const base = duas.length > 0 ? duas : todas;
  const media = base.length > 0 ? base.reduce((a, b) => a + arredondar1(b.nota), 0) / base.length : 0;
  const notas = new Map();
  let fonteUnica = 0;
  for (const [qid, b] of brutas) {
    const n = arredondar1(b.nota);
    if (b.fontes >= 2) notas.set(qid, n);
    else {
      notas.set(qid, arredondar1(PESO_FONTE_UNICA * n + (1 - PESO_FONTE_UNICA) * media));
      fonteUnica += 1;
    }
  }
  return { notas, mediaReferencia: Math.round(limpar(media) * 100) / 100, fonteUnica };
}

export function dividirEmLotes(qids, tamanho = TAMANHO_LOTE) {
  const lotes = [];
  for (let i = 0; i < qids.length; i += tamanho) lotes.push(qids.slice(i, i + tamanho));
  return lotes;
}

// Valida o campo opcional `nota`: número de 0 a 10 com no máximo 1 casa.
export function validarNotas(filmes) {
  const erros = [];
  for (const f of filmes) {
    if (!('nota' in f)) continue;
    const ok = typeof f.nota === 'number' && f.nota >= 0 && f.nota <= 10 && arredondar1(f.nota) === f.nota;
    if (!ok) erros.push({ invariante: 'nota', erro: `${f.qid}: nota inválida (${f.nota})` });
  }
  return erros;
}

export function distribuicao(filmes) {
  const d = { com6: 0, com7: 0, com8: 0, com9: 0 };
  for (const f of filmes) {
    if (typeof f.nota !== 'number') continue;
    if (f.nota >= 6) d.com6 += 1;
    if (f.nota >= 7) d.com7 += 1;
    if (f.nota >= 8) d.com8 += 1;
    if (f.nota >= 9) d.com9 += 1;
  }
  return d;
}

export async function executarNotas({
  dataset, contato, fetch: fetchImpl, esperar, stdout, stderr, gravar,
  agora = () => performance.now(), relogio = () => new Date(),
}) {
  try {
    const userAgent = montarUserAgent(contato);
    const inicio = agora();
    const lotes = dividirEmLotes(dataset.filmes.map((f) => f.qid));
    const bindings = [];
    for (let i = 0; i < lotes.length; i++) {
      if (i > 0) await esperar(PAUSA_ENTRE_LOTES_MS);
      const { dados } = await consultarWdqs(montarConsultaNotas(lotes[i]), {
        fetch: fetchImpl, esperar, userAgent, lote: `notas-${i + 1}`, agora,
      });
      bindings.push(...(dados?.results?.bindings ?? []));
    }
    const { notas, mediaReferencia, fonteUnica } = suavizarNotas(calcularNotasBrutas(bindings));
    const filmes = dataset.filmes.map(({ nota: _antiga, ...resto }) => (notas.has(resto.qid) ? { ...resto, nota: notas.get(resto.qid) } : resto));
    const com = filmes.filter((f) => 'nota' in f).length;
    const saida = {
      meta: { ...dataset.meta, notas: { com, total: filmes.length, mediaReferencia, fonteUnica, geradoEm: relogio().toISOString() } },
      filmes,
    };
    const texto = JSON.stringify(saida);
    const bytes = Buffer.byteLength(texto, 'utf8');
    const erros = validarNotas(filmes);
    if (bytes > MAX_BYTES) erros.push({ invariante: 'tamanho-maximo', erro: `${bytes} bytes; máximo ${MAX_BYTES}` });
    if (erros.length > 0) throw new ErroBuild(erros.map((e) => e.erro).join('; '), { invariante: erros[0].invariante });
    await gravar(texto);
    stdout(JSON.stringify({
      total: filmes.length, comNota: com, cobertura: Number((com / filmes.length).toFixed(4)),
      mediaReferencia, fonteUnica, distribuicao: distribuicao(filmes), lotes: lotes.length, bytes, duracaoMs: Math.round(agora() - inicio),
    }));
    return 0;
  } catch (erro) {
    if (!(erro instanceof ErroBuild)) throw erro;
    stderr(linhaDeErro(erro));
    return 1;
  }
}
