import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarFilmes, LIMITE_FILMES } from '../scripts/lib/montar-dataset.mjs';

const ENT = 'http://www.wikidata.org/entity/';
const COMEDIA = 'Q157443';
const TERROR = 'Q200092';
const TABELA = new Set([COMEDIA, TERROR]);

function linha({ qid, g = COMEDIA, data = '1999-03-31T00:00:00Z', sl = 40, imdb, pt, en }) {
  const l = { film: { value: ENT + qid }, g: { value: ENT + g }, sl: { value: String(sl) } };
  if (data) l.date = { value: data };
  if (imdb) l.imdb = { value: imdb };
  if (pt) l.tpt = { value: pt };
  if (en) l.ten = { value: en };
  return l;
}

test('AC-11: mescla linhas por QID, une gêneros, menor ano, título pt senão en', () => {
  const filmes = montarFilmes([
    linha({ qid: 'Q1', g: COMEDIA, data: '2001-01-01T00:00:00Z', pt: 'Um', en: 'One', imdb: 'tt1' }),
    linha({ qid: 'Q1', g: TERROR, data: '1999-05-05T00:00:00Z', pt: 'Um', en: 'One', imdb: 'tt1' }),
    linha({ qid: 'Q2', pt: undefined, en: 'Two' }),
  ], { qidsTabela: TABELA });
  const q1 = filmes.find((f) => f.qid === 'Q1');
  assert.deepEqual(q1.generos.sort(), [COMEDIA, TERROR].sort());
  assert.equal(q1.ano, 1999);
  assert.equal(q1.titulo, 'Um');
  assert.equal(q1.imdb, 'tt1');
  assert.equal(q1.sitelinks, 40);
  const q2 = filmes.find((f) => f.qid === 'Q2');
  assert.equal(q2.titulo, 'Two');
  assert.ok(!('imdb' in q2));
});

test('AC-11: item sem P577 e item sem rótulo pt nem en são descartados', () => {
  const filmes = montarFilmes([
    linha({ qid: 'Q10', data: null, pt: 'Sem data' }),
    linha({ qid: 'Q11' }),
    linha({ qid: 'Q12', pt: 'Ok' }),
  ], { qidsTabela: TABELA });
  assert.deepEqual(filmes.map((f) => f.qid), ['Q12']);
});

test('AC-11: gênero fora da tabela não entra e filme sem gênero da tabela é descartado', () => {
  const filmes = montarFilmes([
    linha({ qid: 'Q20', g: 'Q999', pt: 'Fora' }),
    linha({ qid: 'Q21', g: COMEDIA, pt: 'Dentro' }),
    linha({ qid: 'Q21', g: 'Q999', pt: 'Dentro' }),
  ], { qidsTabela: TABELA });
  assert.deepEqual(filmes.map((f) => f.qid), ['Q21']);
  assert.deepEqual(filmes[0].generos, [COMEDIA]);
});

test('AC-11: corta em LIMITE_FILMES por sitelinks decrescente, sem QID repetido', () => {
  assert.equal(LIMITE_FILMES, 12000);
  const linhas = Array.from({ length: 10 }, (_, i) => linha({ qid: `Q${100 + i}`, sl: 10 + i, pt: `F${i}` }));
  const filmes = montarFilmes(linhas, { qidsTabela: TABELA, limite: 3 });
  assert.deepEqual(filmes.map((f) => f.qid), ['Q109', 'Q108', 'Q107']);
});

test('AC-11: ano com menos de 4 dígitos é descartado', () => {
  const filmes = montarFilmes([linha({ qid: 'Q30', data: '0099-01-01T00:00:00Z', pt: 'Antigo' })], { qidsTabela: TABELA });
  assert.deepEqual(filmes, []);
});
