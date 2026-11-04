import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recomendar, conjuntoCandidato } from '../src/recomendar.mjs';
import { criarGerador } from './apoio/gerador.mjs';

const tabela = JSON.parse(readFileSync(new URL('../data/humores.json', import.meta.url), 'utf8'));

const COMEDIA = 'Q157443';
const ANIMACAO = 'Q202866';
const TERROR = 'Q200092';
const MUSICAL = 'Q842256';
const FICCAO = 'Q471839';

let contador = 1000;
function filme(generos, sitelinks = 50, qid) {
  contador += 1;
  return { qid: qid ?? `Q${contador}`, titulo: `Filme ${contador}`, ano: 2000, generos, sitelinks };
}
function varios(n, generos) {
  return Array.from({ length: n }, () => filme(generos));
}
function chamar(filmes, humorId, generoQid = null, extra = {}) {
  return recomendar({ filmes, humores: tabela, humorId, generoQid, rng: criarGerador(1), ...extra });
}

test('AC-4: elegível para o humor por qualquer gênero do mapeamento', () => {
  const animacao = filme([ANIMACAO]);
  const terror = filme([TERROR]);
  const r = chamar([animacao, terror], 'leve');
  assert.equal(r.nivel, 'humor');
  assert.deepEqual(r.filmes.map((f) => f.qid), [animacao.qid]);
});

test('AC-7: nível humor+genero exige as duas condições', () => {
  const ambos = filme([TERROR, COMEDIA]);
  const soTerror = filme([TERROR]);
  const soComedia = filme([COMEDIA]);
  const r = chamar([ambos, soTerror, soComedia], 'medo', COMEDIA);
  assert.equal(r.nivel, 'humor+genero');
  assert.deepEqual(r.filmes.map((f) => f.qid), [ambos.qid]);
  assert.equal(r.aviso, '');
});

test('AC-7: relaxa para o gênero com 3 filmes e aviso fixo', () => {
  const r = chamar(varios(3, [MUSICAL]), 'pensar', MUSICAL);
  assert.equal(r.nivel, 'genero');
  assert.equal(r.filmes.length, 3);
  assert.equal(r.aviso, 'Não encontramos filmes para esse humor com o gênero Musical. Mostrando filmes de Musical.');
});

test('AC-7: relaxa para o humor com 8 elegíveis e aviso fixo', () => {
  const r = chamar(varios(8, [FICCAO]), 'pensar', MUSICAL);
  assert.equal(r.nivel, 'humor');
  assert.equal(r.filmes.length, 5);
  assert.equal(r.aviso, 'Não encontramos filmes para esse humor com o gênero Musical. Mostrando filmes para o humor Quero pensar.');
});

test('AC-7: sem relaxamento não há aviso (2 elegíveis em humor+genero)', () => {
  const r = chamar(varios(2, [TERROR, COMEDIA]), 'medo', COMEDIA);
  assert.equal(r.nivel, 'humor+genero');
  assert.equal(r.filmes.length, 2);
  assert.equal(r.aviso, '');
});

test('AC-7: Qualquer gênero usa o nível humor sem aviso', () => {
  const r = chamar(varios(8, [FICCAO]), 'pensar', null);
  assert.equal(r.nivel, 'humor');
  assert.equal(r.filmes.length, 5);
  assert.equal(r.aviso, '');
});

test('AC-7: nenhum nível tem elegíveis, sem exceção', () => {
  const r = chamar(varios(4, [TERROR]), 'pensar', MUSICAL);
  assert.equal(r.nivel, 'nenhum');
  assert.deepEqual(r.filmes, []);
  assert.equal(r.mensagem, 'Não encontramos filmes para essa combinação. Escolha outro humor ou gênero.');
  const vazio = chamar([], 'pensar', null);
  assert.equal(vazio.nivel, 'nenhum');
});

function comSitelinks(n, generos, inicio = 1) {
  return Array.from({ length: n }, (_, i) => filme(generos, inicio + i));
}

test('AC-5: nunca devolve filme fora do top 40 (60 elegíveis, 1.000 sementes)', () => {
  const filmes = comSitelinks(60, [TERROR]);
  const top = new Set(filmes.filter((f) => f.sitelinks > 20).map((f) => f.qid));
  for (let s = 0; s < 1000; s++) {
    const r = recomendar({ filmes, humores: tabela, humorId: 'medo', rng: criarGerador(s) });
    assert.equal(r.filmes.length, 5);
    assert.equal(new Set(r.filmes.map((f) => f.qid)).size, 5);
    for (const f of r.filmes) assert.ok(top.has(f.qid), f.qid);
  }
});

test('AC-5: desempate por QID numérico crescente (Q99 antes de Q100)', () => {
  const filmes = [
    ...comSitelinks(39, [TERROR], 100).map((f, i) => ({ ...f, qid: `Q${200 + i}` })),
    filme([TERROR], 50, 'Q100'),
    filme([TERROR], 50, 'Q99'),
  ];
  assert.deepEqual(conjuntoCandidato(filmes).map((f) => f.qid).slice(-1), ['Q99']);
  assert.equal(conjuntoCandidato(filmes).length, 40);
  for (let s = 0; s < 300; s++) {
    const r = recomendar({ filmes, humores: tabela, humorId: 'medo', rng: criarGerador(s) });
    assert.ok(!r.filmes.some((f) => f.qid === 'Q100'));
  }
});

test('AC-5: menos de 40 elegíveis (7) devolve 5 distintos dentre os 7', () => {
  const filmes = comSitelinks(7, [TERROR]);
  const qids = new Set(filmes.map((f) => f.qid));
  const r = chamar(filmes, 'medo');
  assert.equal(r.filmes.length, 5);
  assert.equal(new Set(r.filmes.map((f) => f.qid)).size, 5);
  assert.ok(r.filmes.every((f) => qids.has(f.qid)));
});

test('AC-4: exatamente 3 elegíveis devolve 3 filmes', () => {
  assert.equal(chamar(comSitelinks(3, [TERROR]), 'medo').filmes.length, 3);
});

function outras(filmes, anteriores, semente) {
  return recomendar({ filmes, humores: tabela, humorId: 'medo', rng: criarGerador(semente), anteriores });
}

test('AC-6: 100 acionamentos com 40 candidatos sem interseção com o anterior', () => {
  const filmes = comSitelinks(40, [TERROR]);
  let atual = chamar(filmes, 'medo').filmes.map((f) => f.qid);
  for (let i = 0; i < 100; i++) {
    const novo = outras(filmes, atual, i).filmes.map((f) => f.qid);
    assert.equal(novo.length, 5);
    assert.ok(novo.every((q) => !atual.includes(q)));
    atual = novo;
  }
});

test('AC-6: fronteira de 10 candidatos exige interseção vazia', () => {
  const filmes = comSitelinks(10, [TERROR]);
  for (let s = 0; s < 50; s++) {
    const anterior = filmes.slice(0, 5).map((f) => f.qid);
    const novo = outras(filmes, anterior, s).filmes.map((f) => f.qid);
    assert.equal(novo.length, 5);
    assert.ok(novo.every((q) => !anterior.includes(q)));
  }
});

test('AC-6: fronteira de 9 candidatos permite repetição, sem erro', () => {
  const filmes = comSitelinks(9, [TERROR]);
  const qids = new Set(filmes.map((f) => f.qid));
  const anterior = filmes.slice(0, 5).map((f) => f.qid);
  let repetiu = false;
  for (let s = 0; s < 50; s++) {
    const novo = outras(filmes, anterior, s).filmes.map((f) => f.qid);
    assert.equal(novo.length, 5);
    assert.equal(new Set(novo).size, 5);
    assert.ok(novo.every((q) => qids.has(q)));
    if (novo.some((q) => anterior.includes(q))) repetiu = true;
  }
  assert.ok(repetiu);
});

test('AC-6: conjunto candidato de 6 devolve de 1 a 5 filmes do conjunto', () => {
  const filmes = comSitelinks(6, [TERROR]);
  const qids = new Set(filmes.map((f) => f.qid));
  const anterior = filmes.slice(0, 5).map((f) => f.qid);
  const novo = outras(filmes, anterior, 7).filmes;
  assert.ok(novo.length >= 1 && novo.length <= 5);
  assert.equal(new Set(novo.map((f) => f.qid)).size, novo.length);
  assert.ok(novo.every((f) => qids.has(f.qid)));
});
