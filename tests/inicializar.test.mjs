import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inicializar } from '../src/inicializar.mjs';

function espiao() {
  const chamadas = { desenhar: [], entrarEmErro: 0, erros: [] };
  return {
    chamadas,
    desenhar: (d) => chamadas.desenhar.push(d),
    entrarEmErro: () => { chamadas.entrarEmErro += 1; },
    logger: { error: (...a) => chamadas.erros.push(a) },
  };
}

test('AC-11: caminho feliz carrega, desenha e não entra em erro', async () => {
  const s = espiao();
  await inicializar({ carregar: async () => ({ erro: null, x: 1 }), desenhar: s.desenhar, entrarEmErro: s.entrarEmErro, logger: s.logger });
  assert.deepEqual(s.chamadas.desenhar, [{ erro: null, x: 1 }]);
  assert.equal(s.chamadas.entrarEmErro, 0);
  assert.equal(s.chamadas.erros.length, 0);
});

test('AC-11: desenhar que lança chama entrarEmErro e registra 1 console.error [filmelier]', async () => {
  const s = espiao();
  await inicializar({
    carregar: async () => ({ erro: null }),
    desenhar: () => { throw new TypeError('boom'); },
    entrarEmErro: s.entrarEmErro,
    logger: s.logger,
  });
  assert.equal(s.chamadas.entrarEmErro, 1);
  assert.equal(s.chamadas.erros.length, 1);
  assert.ok(String(s.chamadas.erros[0][0]).startsWith('[filmelier]'));
});

test('AC-11: carregar que rejeita também chama entrarEmErro, sem exceção para quem chama', async () => {
  const s = espiao();
  await inicializar({ carregar: async () => { throw new Error('x'); }, desenhar: s.desenhar, entrarEmErro: s.entrarEmErro, logger: s.logger });
  assert.equal(s.chamadas.entrarEmErro, 1);
  assert.equal(s.chamadas.desenhar.length, 0);
  assert.equal(s.chamadas.erros.length, 1);
});
