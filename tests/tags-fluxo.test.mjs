import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { recomendar } from '../src/recomendar.mjs';
import { alternar, filtroDoEstado, montarChips, montarControle, textoTagsAtivas, alvoDoFoco, listaDeTags } from '../src/tags.mjs';

// Fluxo dos chips e foco em lógica pura (sem DOM). A marcação e o comportamento renderizado vivem em tests/ui/temas.test.tsx
// (FILMELIER-5, D-13); este arquivo era o antigo tests/tags-pagina.test.mjs, que lia o código da página antiga.
const raiz = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

test('AC-14: o deepEqual das chaves do card em provedores.test.mjs segue verde com o card desenhado (tags depois de notaTexto)', () => {
  const t = readFileSync(`${raiz}/tests/provedores.test.mjs`, 'utf8');
  assert.match(t, /'generos', 'notaTexto', 'tags', 'oscar'/);
});

// ---- Fluxo dos chips (lógica pura, sem DOM) ----
const HUMORES = { humores: [{ id: 'aventura', rotulo: 'Aventura', generos: [{ qid: 'Q157394', rotulo: 'Fantasia' }] }] };
let n = 0;
const filme = (tags, extra = {}) => { n += 1; return { qid: `Q${n}`, titulo: `F${n}`, ano: 2000, generos: ['Q157394'], sitelinks: 500 - n, tags, ...extra }; };
const filmes = [...Array.from({ length: 12 }, () => filme(['bruxaria', 'magia'])), ...Array.from({ length: 12 }, () => filme(['princesas', 'magia'])), ...Array.from({ length: 6 }, () => filme([]))];
const lista = listaDeTags({ temas: { lista: [
  { id: 'bruxaria', rotulo: 'Bruxaria', filmes: 40 }, { id: 'magia', rotulo: 'Magia e feiticeiros', filmes: 60 }, { id: 'princesas', rotulo: 'Princesas e reinos encantados', filmes: 30 },
] } });
const refazer = (estado, base = filmes) => recomendar({ filmes: base, humores: HUMORES, humorId: 'aventura', rng: Math.random, tagsValidas: lista.map((t) => t.id), ...filtroDoEstado(estado) });

test('AC-13: chip "Bruxaria" refaz a lista com o mesmo humor, todos os filmes com a tag', () => {
  const primeira = refazer(new Map());
  const chips = montarChips({ candidatos: primeira.candidatos, estado: new Map(), lista });
  assert.ok(chips.some((c) => c.id === 'bruxaria'));
  const estado = alternar(new Map(), 'bruxaria', 'incluir');
  const r = refazer(estado);
  assert.ok(r.filmes.length > 0 && r.filmes.every((f) => f.tags.includes('bruxaria')));
  assert.equal(textoTagsAtivas(estado, lista), 'Com Bruxaria.');
});

test('AC-13: "Não quero Bruxaria" remove a tag da lista e deixa o chip com aria-pressed false e true', () => {
  const estado = alternar(new Map(), 'bruxaria', 'excluir');
  const r = refazer(estado);
  assert.ok(r.filmes.length > 0 && r.filmes.every((f) => !f.tags.includes('bruxaria')));
  const chips = montarChips({ candidatos: r.candidatos, estado, lista });
  assert.equal(chips[0].id, 'bruxaria');
  assert.deepEqual(montarControle(chips[0], estado).botoes.map((b) => b.pressionado), [false, true]);
});

test('AC-13: com resultado vazio a tag ativa continua como chip, para desfazer', () => {
  const estado = alternar(new Map(), 'princesas', 'incluir');
  const vazio = refazer(estado, filmes.filter((f) => !f.tags.includes('princesas')));
  assert.equal(vazio.nivel, 'nenhum');
  assert.match(vazio.mensagem, /^Nenhum filme com esses temas/);
  const chips = montarChips({ candidatos: vazio.candidatos, estado, lista });
  assert.deepEqual(chips.map((c) => c.id), ['princesas']);
  assert.equal(chips[0].rotulo, 'Princesas e reinos encantados');
});

test('AC-16: alvo do foco: mesmo botão, depois o 1º chip, depois "Recomendar"', () => {
  const chips = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(alvoDoFoco({ chips, tag: 'b', acao: 'excluir' }), { tipo: 'mesmo', tag: 'b', acao: 'excluir' });
  assert.deepEqual(alvoDoFoco({ chips, tag: 'z', acao: 'incluir' }), { tipo: 'primeiro', tag: 'a', acao: 'incluir' });
  assert.deepEqual(alvoDoFoco({ chips: [], tag: 'z', acao: 'incluir' }), { tipo: 'recomendar' });
});

test('AC-16: todo controle de chip tem aria-pressed booleano, ícone e nome não vazios (modelo)', () => {
  const estado = alternar(new Map(), 'magia', 'incluir');
  for (const c of montarChips({ candidatos: filmes, estado, lista })) {
    for (const b of montarControle(c, estado).botoes) assert.ok(typeof b.pressionado === 'boolean' && b.icone !== '' && b.nome !== '');
  }
});
