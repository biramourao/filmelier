import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executarSeries, PRAZO_SERIES_MS } from '../scripts/lib/series.mjs';
import { mundoSeries } from './apoio/series-sinteticas.mjs';

const lerJson = (rel) => JSON.parse(readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8'));
const TABELA = lerJson('data/humores-series.json');
const CLIMA = lerJson('data/clima-series.json');
const TEMAS = lerJson('data/temas.json');
const TOKEN = 'tok-teste-123';
const sha = (arquivo) => createHash('sha256').update(readFileSync(arquivo)).digest('hex');

// Roda o build com o mundo simulado e um arquivo anterior em pasta temporária.
async function rodar(opcoesMundo = {}, { tabela = TABELA, clima = CLIMA, relogio, agora } = {}) {
  const pasta = mkdtempSync(join(tmpdir(), 'series-'));
  const arquivo = join(pasta, 'series.json');
  writeFileSync(arquivo, '{"anterior":true}');
  const antes = sha(arquivo);
  const mundo = mundoSeries({ tabela: TABELA, clima: CLIMA, temas: TEMAS, ...opcoesMundo });
  const saida = [];
  const erros = [];
  let gravacoes = 0;
  let texto = null;
  const codigo = await executarSeries({
    tabela, clima, temas: TEMAS, contato: 'teste@exemplo.org', token: TOKEN,
    fetch: mundo.fetch, esperar: mundo.esperar, agora, relogio,
    stdout: (l) => saida.push(l), stderr: (l) => erros.push(l),
    gravar: async (t) => { gravacoes += 1; texto = t; writeFileSync(arquivo, t); },
  });
  return { codigo, saida, erros, mundo, gravacoes, texto, arquivo, antes, depois: () => sha(arquivo) };
}
const semToken = (r) => {
  assert.ok(![...r.saida, ...r.erros].some((l) => l.includes(TOKEN)));
};
const falhou = (r, invariante) => {
  assert.notEqual(r.codigo, 0);
  assert.equal(r.gravacoes, 0);
  assert.equal(r.depois(), r.antes);
  assert.equal(r.erros.length, 1);
  if (invariante) assert.equal(JSON.parse(r.erros[0]).invariante, invariante);
  semToken(r);
};

test('AC-11: QID de clima fora da tabela de séries: 0 requisições e arquivo anterior intacto', async () => {
  const r = await rodar({}, { clima: { generosClima: { ...CLIMA.generosClima, Q99999999: 'leve' } } });
  falhou(r, 'clima-series');
  assert.match(r.erros[0], /Q99999999/);
  assert.equal(r.mundo.chamadas.wdqs + r.mundo.chamadas.tmdb, 0);
});

test('AC-11: 401 na 1ª chamada e 21% sem TMDB falham sem gravar', async () => {
  const a = await rodar({ http401: true });
  falhou(a, 'tmdb-autorizacao');
  const b = await rodar({ http404: 201 });
  falhou(b, 'tmdb-cobertura');
});

test('AC-11: 20% sem TMDB ainda grava', async () => {
  const r = await rodar({ http404: 200 });
  assert.equal(r.codigo, 0, r.erros.join('\n'));
  assert.equal(r.gravacoes, 1);
  assert.equal(JSON.parse(r.saida.at(-1)).fallbackWikidata, 200);
});

test('AC-11: Seis invariantes violados isoladamente', async () => {
  const dosCinco = await rodar();
  assert.equal(dosCinco.codigo, 0, dosCinco.erros.join('\n'));
  const bytesBase = Buffer.byteLength(dosCinco.texto, 'utf8');

  falhou(await rodar({}, { tabela: { humores: TABELA.humores.slice(0, 6) } }), 'esquema-humores');
  falhou(await rodar({ total: 999 }), 'total-minimo');
  const medo = TABELA.humores.find((h) => h.id === 'medo').generos[0].qid;
  const sitcom = 'Q170238';
  const restringir = (alvo, n) => (i, generos) => {
    if (i < n) return alvo;
    const outros = generos.filter((g) => g !== alvo);
    return outros[i % outros.length];
  };
  falhou(await rodar({ generoDe: restringir(medo, 39) }), 'minimo-por-humor');
  falhou(await rodar({ generoDe: restringir(sitcom, 9) }), 'minimo-por-genero');
  falhou(await rodar({ tituloExtra: 'x'.repeat(600001 - bytesBase) }), 'tamanho-maximo');
  falhou(await rodar({ semSituacao: 60 }), 'cobertura-situacao');
});

test('AC-11: Caso válido grava com 950 séries com situação', async () => {
  const r = await rodar({ semSituacao: 50 });
  assert.equal(r.codigo, 0, r.erros.join('\n'));
  assert.equal(r.gravacoes, 1);
  const base = JSON.parse(readFileSync(r.arquivo, 'utf8'));
  assert.equal(new Date(base.meta.geradoEm).toISOString(), base.meta.geradoEm);
  assert.equal(base.meta.total, base.series.length);
  assert.equal(base.series.filter((s) => s.situacao !== null).length, 950);
  assert.deepEqual(Object.keys(base.meta), ['geradoEm', 'fonte', 'licenca', 'total', 'temas']);
  assert.notEqual(r.depois(), r.antes);
});

test('AC-13: Relógio simulado estoura o prazo antes da última série', async () => {
  let t = 1000;
  const r = await rodar({ aoChamarTmdb: (n) => { if (n === 999) t += PRAZO_SERIES_MS + 1; } }, { agora: () => t });
  falhou(r, 'prazo');
  assert.match(r.erros[0], /prazo/);
  assert.equal(r.mundo.chamadas.tmdb, 999);
});

test('AC-13: Prazo consumido no WDQS: 0 chamadas ao TMDB', async () => {
  let t = 0;
  const r = await rodar({ aoChamarWdqs: (n) => { if (n === 3) t += PRAZO_SERIES_MS + 1; } }, { agora: () => t });
  falhou(r, 'prazo');
  assert.equal(r.mundo.chamadas.tmdb, 0);
});

test('AC-13: Espera de 429 que passaria do prazo não chama esperar nem repete', async () => {
  let t = 0;
  const r = await rodar({ aoChamarTmdb: (n) => { if (n === 1) { t = PRAZO_SERIES_MS - 100000; return { status: 429, retryAfter: 300 }; } } }, { agora: () => t });
  falhou(r, 'prazo');
  assert.equal(r.mundo.esperas.length, 0);
  assert.equal(r.mundo.chamadas.tmdb, 1);
});

test('AC-11: Linha de resumo com 6 chaves e 10 séries em fallback', async () => {
  const r = await rodar({ http404: 10 });
  assert.equal(r.codigo, 0, r.erros.join('\n'));
  const resumo = JSON.parse(r.saida.at(-1));
  assert.deepEqual(Object.keys(resumo).sort(), ['chamadasTmdb', 'cobertura', 'duracaoMs', 'fallbackWikidata', 'semTmdbId', 'total']);
  assert.equal(resumo.total, 1000);
  assert.equal(resumo.fallbackWikidata, 10);
  assert.equal(resumo.semTmdbId, 0);
  assert.deepEqual(Object.keys(resumo.cobertura).sort(), ['episodios', 'situacao', 'tags', 'temporadas']);
  for (const x of Object.values(resumo.cobertura)) assert.ok(x >= 0 && x <= 1);
  semToken(r);
});

test('AC-11: 49% emite o aviso e 50% não; os dois saem com 0', async () => {
  const a = await rodar({ comTags: 490 });
  assert.equal(a.codigo, 0, a.erros.join('\n'));
  const linha = a.saida.findIndex((l) => l === '::warning::taxa de series com tags 49%');
  assert.equal(linha, a.saida.length - 2);
  const b = await rodar({ comTags: 500 });
  assert.equal(b.codigo, 0, b.erros.join('\n'));
  assert.ok(!b.saida.some((l) => l.startsWith('::warning::')));
});
