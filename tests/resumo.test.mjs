import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarResumo, linhaDeErro } from '../scripts/lib/resumo.mjs';

const tabela = { humores: [
  { id: 'a', rotulo: 'A', generos: [{ qid: 'Q1', rotulo: 'G1' }, { qid: 'Q2', rotulo: 'G2' }] },
  { id: 'b', rotulo: 'B', generos: [{ qid: 'Q2', rotulo: 'G2' }] },
] };
const filmes = [
  { qid: 'Q10', generos: ['Q1'] },
  { qid: 'Q11', generos: ['Q1', 'Q2'] },
  { qid: 'Q12', generos: ['Q2'] },
];

test('AC-17: resumo de sucesso tem as 6 chaves e contagens corretas', () => {
  const lotes = [{ lote: '1990-1994', duracaoMs: 1200 }];
  const r = montarResumo({ tabela, filmes, bytes: 321, duracaoMs: 4500, lotes });
  assert.deepEqual(Object.keys(r).sort(), ['bytes', 'duracaoMs', 'lotes', 'porGenero', 'porHumor', 'total']);
  assert.equal(r.total, 3);
  assert.deepEqual(r.porHumor, { a: 3, b: 2 });
  assert.deepEqual(r.porGenero, { Q1: 2, Q2: 2 });
  assert.equal(r.bytes, 321);
  assert.equal(r.duracaoMs, 4500);
  assert.deepEqual(r.lotes, lotes);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(r)));
});

test('AC-17: linha de erro com invariante ou lote é 1 linha JSON válida', () => {
  const a = linhaDeErro({ message: 'x', invariante: 'contato' });
  assert.ok(!a.includes('\n'));
  assert.deepEqual(JSON.parse(a), { erro: 'x', invariante: 'contato' });
  const b = JSON.parse(linhaDeErro({ message: 'y', lote: '1990' }));
  assert.deepEqual(b, { erro: 'y', lote: '1990' });
  const c = JSON.parse(linhaDeErro(new Error('inesperado\ncom quebra')));
  assert.equal(c.erro, 'inesperado\ncom quebra');
  assert.equal(Object.keys(c).length, 1);
});
