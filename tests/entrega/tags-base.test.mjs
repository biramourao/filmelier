import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recomendar } from '../../src/recomendar.mjs';
import { listaDeTags, montarChips } from '../../src/tags.mjs';

// Testes de entrega (design D-18): dependem do conteúdo da base da semana; ficam fora do glob tests/*.test.mjs do workflow.
// Rodam com: node --import ./tests/apoio/sem-rede.mjs --test tests/entrega/*.test.mjs
const raiz = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const base = JSON.parse(readFileSync(`${raiz}/data/filmes.json`, 'utf8'));
const curadoria = JSON.parse(readFileSync(`${raiz}/data/curadoria-temas.json`, 'utf8'));
const porQid = new Map(base.filmes.map((f) => [f.qid, f]));
const HARRY_POTTER = ['Q102438', 'Q102244', 'Q102225', 'Q102448', 'Q161687', 'Q102235', 'Q161678', 'Q232009'];

test('AC-6: os 8 Harry Potter têm bruxaria e clima sombrio, e nenhum tem conto-de-fadas', () => {
  for (const q of HARRY_POTTER) {
    const f = porQid.get(q);
    assert.ok(f, `${q} ausente da base`);
    assert.equal(f.clima, 'sombrio', q);
    assert.ok(f.tags?.includes('bruxaria'), q);
    assert.ok(!f.tags.includes('conto-de-fadas'), q);
  }
});

test('AC-6: Alice no País das Maravilhas 2010 tem conto-de-fadas e clima leve', () => {
  const alice = porQid.get('Q174385');
  assert.ok(alice);
  assert.ok(alice.tags?.includes('conto-de-fadas'));
  assert.equal(alice.clima, 'leve');
});

// Clima de filmes com temas ambíguos (decisão D-20): bruxaria e magia não definem clima por si.
test('AC-6: A Pequena Sereia 2023 e Hocus Pocus (1993 e 2022) são leves; Bedknobs não é sombrio', () => {
  for (const q of ['Q24357415', 'Q431140', 'Q109284173']) {
    const f = porQid.get(q);
    assert.ok(f, `${q} ausente da base`);
    assert.equal(f.clima, 'leve', `${q} ${f.titulo}`);
  }
  assert.notEqual(porQid.get('Q945138').clima, 'sombrio');
});

test('AC-6: musical dramático ou biográfico não é leve só pelo gênero (D-23)', () => {
  for (const q of ['Q190956', 'Q27894574', 'Q189889', 'Q3286391']) {
    const f = porQid.get(q);
    assert.ok(f, `${q} ausente da base`);
    assert.notEqual(f.clima, 'leve', `${q} ${f.titulo}`);
  }
  const musicais = base.filmes.filter((f) => f.generos.includes('Q842256'));
  const leves = musicais.filter((f) => f.clima === 'leve').length;
  assert.ok(leves / musicais.length < 0.5, `${leves} leves de ${musicais.length} musicais`);
});

test('AC-6: filmes com bruxaria têm clima misto, com no mínimo 25% sombrio e filmes leves e intermediários presentes', () => {
  const filmes = base.filmes.filter((f) => f.tags?.includes('bruxaria'));
  const conta = (nivel) => filmes.filter((f) => f.clima === nivel).length;
  assert.ok(conta('sombrio') / filmes.length >= 0.25, `sombrio ${conta('sombrio')} de ${filmes.length}`);
  assert.ok(conta('leve') >= 10, `leve ${conta('leve')}`);
  assert.ok(conta('intermediario') >= 10, `intermediario ${conta('intermediario')}`);
});

test('AC-12: nos 15 gêneros a recomendação sem tags devolve de 1 a 5 filmes e há no mínimo 1 chip', () => {
  const humores = JSON.parse(readFileSync(`${raiz}/data/humores.json`, 'utf8'));
  const lista = listaDeTags(base.meta);
  const qids = [...new Set(humores.humores.flatMap((h) => h.generos.map((g) => g.qid)))];
  assert.equal(qids.length, 15);
  for (const qid of qids) {
    const humor = humores.humores.find((h) => h.generos.some((g) => g.qid === qid));
    const r = recomendar({ filmes: base.filmes, humores, humorId: humor.id, generoQid: qid, rng: () => 0.5 });
    assert.ok(r.filmes.length >= 1 && r.filmes.length <= 5, `${qid}: ${r.filmes.length} filmes`);
    assert.ok(montarChips({ candidatos: r.candidatos, estado: new Map(), lista }).length >= 1, `${qid}: sem chip`);
  }
});

test('AC-5: os QIDs de conto-de-fadas e princesas da curadoria existem na base e carregam o tema', () => {
  for (const tema of ['conto-de-fadas', 'princesas']) {
    const qids = Object.entries(curadoria.filmes).filter(([, e]) => (e.adicionar ?? []).includes(tema)).map(([q]) => q);
    assert.ok(qids.length >= 20, tema);
    for (const q of qids) {
      assert.ok(porQid.has(q), `${tema}: ${q} ausente da base`);
      assert.ok(porQid.get(q).tags?.includes(tema), `${tema}: ${q} sem a tag`);
    }
  }
});
