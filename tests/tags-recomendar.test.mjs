import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recomendar, normalizarTags, filtrarTags } from '../src/recomendar.mjs';

// Gerador determinístico (mulberry32).
const gerador = (semente) => () => {
  semente |= 0; semente = (semente + 0x6D2B79F5) | 0;
  let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const HUMORES = { humores: [
  { id: 'aventura', rotulo: 'Quero aventura e fantasia', generos: [{ qid: 'Q319221', rotulo: 'Aventura' }, { qid: 'Q157394', rotulo: 'Fantasia' }] },
  { id: 'familia', rotulo: 'Aconchegante, para ver em família', generos: [{ qid: 'Q1361932', rotulo: 'Família' }, { qid: 'Q842256', rotulo: 'Musical' }] },
] };
const FANTASIA = 'Q157394';
const MUSICAL = 'Q842256';
let contador = 0;
const filme = (extra = {}) => { contador += 1; return { qid: `Q${contador}`, titulo: `F${contador}`, ano: 2000, generos: [FANTASIA], sitelinks: 100 + contador, ...extra }; };
const varios = (n, extra) => Array.from({ length: n }, () => filme(extra));
const chamar = (filmes, extra = {}, semente = 1) => recomendar({ filmes, humores: HUMORES, humorId: 'aventura', rng: gerador(semente), ...extra });
const MSG_VAZIO = 'Não encontramos filmes para essa combinação. Escolha outro humor ou gênero.';

const mistura = () => [...varios(10, { tags: ['bruxaria'] }), ...varios(10, { tags: ['conto-de-fadas'] }), ...varios(10, { tags: ['bruxaria', 'magia'] }), ...varios(10, { tags: ['magia'] }), ...varios(10)];

test('AC-10: 1 tag incluída em 1.000 sorteios só devolve filmes com ela', () => {
  const filmes = mistura();
  for (let s = 0; s < 1000; s++) {
    const r = chamar(filmes, { incluir: ['bruxaria'] }, s);
    assert.ok(r.filmes.length > 0 && r.filmes.every((f) => f.tags?.includes('bruxaria')));
  }
});

test('AC-10: 2 tags incluídas combinam por OU, sem filme sem as 2', () => {
  const filmes = mistura();
  let soBruxaria = false; let soConto = false;
  for (let s = 0; s < 1000; s++) {
    const r = chamar(filmes, { incluir: ['bruxaria', 'conto-de-fadas'] }, s);
    for (const f of r.filmes) {
      const tem = (id) => f.tags?.includes(id);
      assert.ok(tem('bruxaria') || tem('conto-de-fadas'));
      if (tem('bruxaria') && !tem('conto-de-fadas')) soBruxaria = true;
      if (tem('conto-de-fadas') && !tem('bruxaria')) soConto = true;
    }
  }
  assert.ok(soBruxaria && soConto);
});

test('AC-10: tag desconhecida é ignorada (igual a sem tags, mesma semente)', () => {
  const filmes = mistura();
  assert.deepEqual(chamar(filmes, { incluir: ['inexistente'] }, 7), chamar(filmes, {}, 7));
  assert.deepEqual(chamar(filmes, { excluir: ['inexistente'] }, 7), chamar(filmes, {}, 7));
});

test('AC-10: tag excluída nunca aparece em 1.000 sorteios', () => {
  const filmes = mistura();
  for (let s = 0; s < 1000; s++) {
    assert.ok(chamar(filmes, { excluir: ['bruxaria'] }, s).filmes.every((f) => !f.tags?.includes('bruxaria')));
  }
});

test('AC-10: incluir magia e excluir bruxaria devolve só magia sem bruxaria', () => {
  const filmes = mistura();
  for (let s = 0; s < 200; s++) {
    const r = chamar(filmes, { incluir: ['magia'], excluir: ['bruxaria'] }, s);
    assert.ok(r.filmes.length > 0 && r.filmes.every((f) => f.tags.includes('magia') && !f.tags.includes('bruxaria')));
  }
});

test('AC-10: mesmo id nas duas listas vale só como excluído', () => {
  const filmes = mistura();
  assert.deepEqual(chamar(filmes, { incluir: ['bruxaria'], excluir: ['bruxaria'] }, 3), chamar(filmes, { excluir: ['bruxaria'] }, 3));
});

const quatroClimas = () => [filme({ clima: 'leve' }), filme({ clima: 'intermediario' }), filme({ clima: 'sombrio' }), filme()];
const qids = (r) => r.filmes.map((f) => f.clima ?? 'sem').sort();

test('AC-10: climas são filtráveis como tags', () => {
  const filmes = quatroClimas();
  assert.deepEqual(qids(chamar(filmes, { incluir: ['sombrio'] })), ['sombrio']);
  assert.deepEqual(qids(chamar(filmes, { incluir: ['leve', 'intermediario'] })), ['intermediario', 'leve']);
  const sem = qids(chamar(filmes, { excluir: ['sombrio'] }));
  assert.equal(sem.length, 3);
  assert.ok(sem.includes('sem'));
});

test('AC-11: o relaxamento opera sobre o conjunto filtrado por tag e mantém o aviso vigente', () => {
  const filmes = [...varios(3, { generos: [MUSICAL], tags: ['bruxaria'] }), ...varios(10, { generos: [MUSICAL] }), ...varios(4, { generos: [FANTASIA], tags: ['bruxaria'] })];
  const r = recomendar({ filmes, humores: HUMORES, humorId: 'aventura', generoQid: MUSICAL, rng: gerador(1), incluir: ['bruxaria'] });
  assert.equal(r.nivel, 'genero');
  assert.equal(r.filmes.length, 3);
  assert.ok(r.filmes.every((f) => f.tags.includes('bruxaria')));
  assert.equal(r.aviso, 'Não encontramos filmes para esse humor com o gênero Musical. Mostrando filmes de Musical.');
});

test('AC-11: nenhum filme com a tag em nenhum nível: nível nenhum, lista vazia, sem filme sem a tag', () => {
  const filmes = [...varios(8, { tags: ['magia'] }), ...varios(8)];
  const r = chamar(filmes, { incluir: ['magia'], excluir: [] }, 1);
  assert.ok(r.filmes.length > 0);
  const r2 = chamar(varios(8), { incluir: ['bruxaria'], tagsValidas: ['bruxaria'] });
  assert.equal(r2.nivel, 'nenhum');
  assert.deepEqual(r2.filmes, []);
});

test('AC-11: as 4 mensagens exatas de resultado vazio, sem exceção', () => {
  const filmes = varios(8, { tags: ['bruxaria'], nota: 5 });
  const base = { tagsValidas: ['bruxaria', 'magia'] };
  assert.equal(chamar(filmes, { ...base, incluir: ['magia'] }).mensagem, 'Nenhum filme com esses temas. Tente incluir outro tema ou desfazer um "menos disso".');
  assert.equal(chamar(filmes, { ...base, excluir: ['bruxaria'] }).mensagem, 'Nenhum filme com esses temas. Tente incluir outro tema ou desfazer um "menos disso".');
  assert.equal(chamar(filmes, { ...base, incluir: ['bruxaria'], notaMin: 9 }).mensagem, 'Nenhum filme com esses temas e filtros. Tente incluir outro tema, desfazer um "menos disso", ampliar o período, baixar a nota mínima ou mudar o filtro de Oscar.');
  assert.equal(chamar(filmes, { anoDe: 2029 }).mensagem, 'Nenhum filme com esses filtros. Tente ampliar o período, baixar a nota mínima ou mudar o filtro de Oscar.');
  assert.equal(chamar([], {}).mensagem, MSG_VAZIO);
  assert.equal(chamar(filmes, { incluir: ['inexistente'], humorId: 'nao-existe' }).mensagem, MSG_VAZIO);
});

test('AC-13: conjunto candidato devolvido: 40 com a tag e os filmes dentre eles; [] no nível nenhum', () => {
  const filmes = [...varios(50, { tags: ['bruxaria'] }), ...varios(10)];
  const r = chamar(filmes, { incluir: ['bruxaria'] });
  assert.equal(r.candidatos.length, 40);
  assert.ok(r.candidatos.every((f) => f.tags.includes('bruxaria')));
  const qids = new Set(r.candidatos.map((f) => f.qid));
  assert.ok(r.filmes.every((f) => qids.has(f.qid)));
  assert.deepEqual(chamar(varios(3), { incluir: ['x'], tagsValidas: ['x'] }).candidatos, []);
});

test('AC-10: 100 acionamentos de "Outras sugestões" com tag e 12 candidatos: interseção vazia, mesma tag e mesmo nível', () => {
  const filmes = [...varios(12, { tags: ['bruxaria'] }), ...varios(30)];
  const rng = gerador(42);
  let anteriores = [];
  for (let i = 0; i < 100; i++) {
    const r = recomendar({ filmes, humores: HUMORES, humorId: 'aventura', rng, anteriores, incluir: ['bruxaria'] });
    assert.equal(r.nivel, 'humor');
    assert.equal(r.candidatos.length, 12);
    assert.ok(r.filmes.length === 5 && r.filmes.every((f) => f.tags.includes('bruxaria')));
    const ant = new Set(anteriores.map((f) => f.qid));
    assert.ok(r.filmes.every((f) => !ant.has(f.qid)));
    anteriores = r.filmes;
  }
});

test('AC-10: normalizarTags e filtrarTags (ids conhecidos, dedup, excluir vence)', () => {
  const filmes = [filme({ tags: ['a'] }), filme({ clima: 'leve' })];
  assert.deepEqual(normalizarTags({ incluir: ['a', 'a', 'x', 'leve'], excluir: ['leve', 'y'], filmes }), { incluir: ['a'], excluir: ['leve'] });
  assert.deepEqual(normalizarTags({ incluir: ['x'], tagsValidas: ['x'], filmes }), { incluir: ['x'], excluir: [] });
  assert.equal(filtrarTags(filmes, { incluir: [], excluir: [] }), filmes);
  assert.equal(filtrarTags(filmes, { incluir: ['a'], excluir: [] }).length, 1);
});
