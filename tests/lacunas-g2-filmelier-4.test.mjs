import { test } from 'node:test';
import assert from 'node:assert/strict';
import { casarTemas, validarTemas, validarCuradoria, resolverTmdbIds, criarClienteTmdb } from '../scripts/lib/temas.mjs';
import { readFileSync } from 'node:fs';
import { montarChips, tagsDoCard } from '../src/tags.mjs';
import { mundoSimulado, baseSintetica } from './apoio/mundo-simulado.mjs';
import { rodar, cenario, TABELA, HUMORES, TOKEN } from './apoio/rodar-temas.mjs';

// Lacunas apontadas pela validação G2 da FILMELIER-4 por mutação (cada teste abaixo falha sem a regra que protege).
const linhasJson = (linhas) => linhas.map((l) => JSON.parse(l));
const ACHADO = (id) => ({ id, release_date: '2000-01-01' });

test('AC-3: keyword do TMDB que é só prefixo de uma keyword da tabela não casa (igualdade exata)', () => {
  const conhecidas = new Set([...TABELA.temas.flatMap((t) => t.keywords), ...TABELA.climas.flatMap((c) => c.keywords)]);
  let testadas = 0;
  for (const t of TABELA.temas) {
    for (const k of t.keywords) {
      const prefixo = k.slice(0, -1);
      if (prefixo.length < 3 || conhecidas.has(prefixo)) continue;
      assert.equal(casarTemas([prefixo], TABELA).size, 0, `prefixo de "${k}" não pode casar`);
      testadas += 1;
    }
  }
  assert.ok(testadas > 20);
});

test('AC-3: a tabela aceita no máximo 60 temas (61 reprova com esquema-temas)', () => {
  const clone = (n) => ({ ...TABELA, temas: [...TABELA.temas, ...Array.from({ length: n - TABELA.temas.length }, (_, i) => ({ id: `extra-${i}`, rotulo: `Extra ${i}`, keywords: [`extra-kw-${i}`] }))] });
  assert.equal(TABELA.temas.length, 60);
  assert.deepEqual(validarTemas(TABELA, HUMORES), []);
  const erros = validarTemas(clone(61), HUMORES);
  assert.equal(erros.length, 1);
  assert.equal(erros[0].invariante, 'esquema-temas');
});

test('AC-5: curadoria com QID malformado reprova com curadoria-tema', () => {
  const erros = validarCuradoria({ filmes: { 'Q12x': { clima: 'sombrio' } } }, TABELA);
  assert.equal(erros.length, 1);
  assert.equal(erros[0].invariante, 'curadoria-tema');
  assert.deepEqual(validarCuradoria({ filmes: { Q12: { clima: 'sombrio' } } }, TABELA), []);
});

test('AC-2: o prazo de 720.000 ms só encerra o find em exatos 720.000 (719.999 ainda envia o find seguinte)', async () => {
  let t = 0;
  const mundo = mundoSimulado({
    find: (id) => ACHADO(Number(id.slice(1)) + 7000),
    aoChamar: (url) => { if (url.includes('/find/Q3')) t = 719999; },
  });
  const r = await rodar({ base: baseSintetica(13), mundo, agora: () => t });
  assert.equal(r.codigo, 0);
  assert.equal(mundo.so('/find/').length, 13);
  assert.equal(r.resumo.pendentesFind, 0);
});

test('AC-2: tmdbId anterior inválido (0) não vale: o filme volta à P4947', async () => {
  const mundo = mundoSimulado({ p4947: { Q1: [555] } });
  const cliente = criarClienteTmdb({ token: TOKEN, fetch: mundo.fetch, esperar: mundo.esperar });
  const r = await resolverTmdbIds({
    filmes: baseSintetica(1).filmes, anterior: { meta: {}, filmes: [{ qid: 'Q1', tmdbId: 0 }] }, hoje: '2026-11-04',
    contato: 'teste@exemplo.org', cliente, fetch: mundo.fetch, esperar: mundo.esperar,
  });
  assert.deepEqual(r.origem, { anterior: 0, wikidata: 1, find: 0 });
  assert.equal(r.tmdbIds.get('Q1'), 555);
});

test('AC-2: valor de P4947 não numérico ("12abc") não é aceito e o filme vai ao find', async () => {
  const mundo = mundoSimulado({ p4947: { Q1: ['12abc'] }, find: { Q1: ACHADO(99) } });
  const cliente = criarClienteTmdb({ token: TOKEN, fetch: mundo.fetch, esperar: mundo.esperar });
  const r = await resolverTmdbIds({
    filmes: baseSintetica(1).filmes, anterior: null, hoje: '2026-11-04', contato: 'teste@exemplo.org', cliente, fetch: mundo.fetch, esperar: mundo.esperar,
  });
  assert.equal(r.tmdbIds.get('Q1'), 99);
  assert.deepEqual(r.origem, { anterior: 0, wikidata: 0, find: 1 });
});

test('AC-9: prazo global estourado depois da última requisição aborta antes de gravar', async () => {
  let t = 0;
  const c = cenario(10);
  const mundo = mundoSimulado({ aoChamar: (url) => { if (url.includes('/movie/1010/')) t = 2220000; } });
  const r = await rodar({ base: c.base, anterior: c.anterior, mundo, agora: () => t });
  assert.notEqual(r.codigo, 0);
  assert.equal(r.gravados.length, 0);
  assert.equal(linhasJson(r.stderr).at(-1).invariante, 'prazo');
});

test('AC-9: prazo global é checado antes de cada lote do WDQS (o 2º lote não é enviado)', async () => {
  let t = 0;
  const mundo = mundoSimulado({ aoChamar: (url) => { if (url.includes('query.wikidata.org')) t = 2220000; } });
  const r = await rodar({ base: baseSintetica(301), mundo, agora: () => t });
  assert.notEqual(r.codigo, 0);
  assert.equal(r.gravados.length, 0);
  assert.equal(linhasJson(r.stderr).at(-1).invariante, 'prazo');
  assert.equal(mundo.so('query.wikidata.org').length, 1);
});

test('AC-9: prazo global também vale no --medir (aborta antes de imprimir o JSON)', async () => {
  let t = 0;
  const c = cenario(10);
  const mundo = mundoSimulado({ aoChamar: (url) => { if (url.includes('/movie/1010/')) t = 2220000; } });
  const r = await rodar({ base: c.base, anterior: c.anterior, mundo, medir: true, agora: () => t });
  assert.notEqual(r.codigo, 0);
  assert.equal(r.stdout.length, 0);
  assert.equal(linhasJson(r.stderr).at(-1).invariante, 'prazo');
});

test('AC-7: HTTP 401 e 403 não escrevem o TMDB_TOKEN em stderr, stdout nem na base', async () => {
  for (const status of [401, 403]) {
    const c = cenario(3);
    const r = await rodar({ base: c.base, anterior: c.anterior, mundo: mundoSimulado({ keywords: () => status }) });
    assert.notEqual(r.codigo, 0);
    const tudo = [...r.stderr, ...r.stdout, ...r.gravados].join('\n');
    assert.ok(!tudo.includes(TOKEN));
  }
});

test('AC-7: token com espaços nas pontas é aparado no cabeçalho de acesso', async () => {
  const mundo = mundoSimulado({ keywords: { 1: ['witch'] } });
  const cliente = criarClienteTmdb({ token: `  ${TOKEN}  `, fetch: mundo.fetch, esperar: mundo.esperar });
  await cliente.pedir('/movie/1/keywords');
  const cabecalho = ['Author', 'ization'].join('');
  assert.equal(mundo.chamadas[0].init.headers[cabecalho], `${['Bear', 'er'].join('')} ${TOKEN}`);
});

const tag = (id, rotulo, filmes = 30) => ({ id, rotulo, filmes });

test('AC-13: tag ativa que também está no conjunto candidato aparece uma só vez nos chips', () => {
  const lista = [tag('bruxaria', 'Bruxaria'), tag('fantasmas', 'Fantasmas')];
  const candidatos = [{ tags: ['bruxaria', 'fantasmas'] }, { tags: ['bruxaria'] }];
  const chips = montarChips({ candidatos, estado: new Map([['bruxaria', 'incluida']]), lista });
  assert.deepEqual(chips.map((c) => c.id), ['bruxaria', 'fantasmas']);
});

test('AC-13: tags ativas vêm em ordem alfabética pt-BR do rótulo, e não na ordem em que foram ativadas', () => {
  const lista = [tag('a', 'Zumbis'), tag('b', 'Árvores'), tag('c', 'Bruxaria')];
  const estado = new Map([['a', 'incluida'], ['c', 'excluida'], ['b', 'incluida']]);
  assert.deepEqual(montarChips({ candidatos: [], estado, lista }).map((c) => c.rotulo), ['Árvores', 'Bruxaria', 'Zumbis']);
});

test('AC-14: filme sem clima mostra no máximo 2 temas no card', () => {
  const lista = [tag('a', 'A', 21), tag('b', 'B', 22), tag('c', 'C', 23)];
  assert.deepEqual(tagsDoCard({ tags: ['a', 'b', 'c'] }, { lista }), ['A', 'B']);
});

test('AC-13: os chips da página nascem do conjunto candidato do resultado (e não só dos filmes sorteados)', () => {
  const app = readFileSync(new URL('../src/app.mjs', import.meta.url), 'utf8');
  assert.match(app, /montarChips\(\{ candidatos: resultado\.candidatos \?\? \[\]/);
});
