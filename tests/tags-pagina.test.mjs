import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { recomendar } from '../src/recomendar.mjs';
import { alternar, filtroDoEstado, montarChips, montarControle, textoTagsAtivas, alvoDoFoco, listaDeTags } from '../src/tags.mjs';

// Verificações estáticas da camada de DOM das tags (sem navegador): marcação do index.html e trechos de src/app.mjs.
const raiz = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const html = readFileSync(`${raiz}/index.html`, 'utf8');
const app = readFileSync(`${raiz}/src/app.mjs`, 'utf8');
const corpoDe = (nome) => {
  const ini = app.indexOf(`function ${nome}(`);
  assert.ok(ini >= 0, nome);
  const prox = app.indexOf('\nfunction ', ini + 1);
  return app.slice(ini, prox < 0 ? undefined : prox);
};

test('AC-12: details sem open, com fieldset e legend "Temas (opcional)", antes de #recomendar e oculto sem lista', () => {
  const m = /<details\b([^>]*)>([\s\S]*?)<\/details>/.exec(html);
  assert.ok(m, 'details');
  assert.doesNotMatch(m[1], /\bopen\b/);
  assert.match(m[1], /id="grupo-temas"/);
  assert.match(m[1], /\bhidden\b/);
  assert.match(m[2], /<fieldset>\s*<legend[^>]*>Temas \(opcional\)<\/legend>/);
  assert.match(m[2], /<summary>Filtrar por tema \(opcional\)<\/summary>/);
  assert.notEqual(/<summary>([^<]*)<\/summary>/.exec(m[2])[1], /<legend[^>]*>([^<]*)<\/legend>/.exec(m[2])[1], 'summary e legend com textos distintos');
  assert.ok(html.indexOf('<details') < html.indexOf('id="recomendar"'));
  assert.ok(html.indexOf('id="campo-oscar"') < 0 && html.indexOf('id="oscar"') < html.indexOf('<details'));
});

test('AC-12: botões do formulário limpam lista, aviso, chips e região live e ocultam "Outras sugestões"', () => {
  const limpar = corpoDe('limparResultado');
  for (const trecho of ["el('lista').replaceChildren()", "el('chips').replaceChildren()", "el('chips').hidden = true",
    "el('resumo-lista').textContent = ''", "el('aviso').textContent = ''", "el('outras').hidden = true"]) assert.ok(limpar.includes(trecho), trecho);
  const alternarForm = corpoDe('alternarTagDoFormulario');
  assert.match(alternarForm, /limparResultado\(\)/);
  assert.match(alternarForm, /sincronizarBotoesDeTag\(\)/);
  assert.match(app, /el\('temas-controles'\)\.addEventListener\('click'/);
});

test('AC-12: formulário e chips usam o mesmo aria-pressed, sincronizado pelo estado compartilhado', () => {
  const sinc = corpoDe('sincronizarBotoesDeTag');
  assert.match(sinc, /querySelectorAll\('button\[data-tag\]'\)/);
  assert.match(sinc, /'aria-pressed'/);
  const controle = corpoDe('criarControleTag');
  assert.match(controle, /type: 'button'/);
  assert.match(controle, /'aria-pressed': String\(b\.pressionado\)/);
  assert.match(controle, /'data-tag'/);
  assert.match(controle, /'Menos'/);
});

test('AC-12: sem grupo quando a base não tem tags (lista vazia, grupo oculto, sem seção)', () => {
  const pagina = corpoDe('desenharPagina');
  assert.match(pagina, /f\.tags\?\.length > 0 \|\| f\.clima/);
  assert.match(pagina, /listaDeTags\(dados\.filmes\.meta\)/);
  assert.match(corpoDe('montarGrupoTemas'), /el\('grupo-temas'\)\.hidden = estado\.listaTags\.length === 0/);
});

test('AC-12: sem persistência nem id de tag em URL ou location', () => {
  assert.doesNotMatch(app, /localStorage|sessionStorage|document\.cookie|location|history\.|URLSearchParams/);
  assert.doesNotMatch(html, /localStorage|sessionStorage|document\.cookie/);
});

test('AC-13: recomendar recebe as tags do estado e o resumo live traz as tags ativas entre o aviso e os títulos', () => {
  const sugerir = corpoDe('sugerir');
  assert.match(sugerir, /\.\.\.filtroDoEstado\(estado\.tags\)/);
  assert.match(sugerir, /tagsValidas: estado\.listaTags\.map/);
  assert.match(corpoDe('mostrar'), /\[texto, textoTagsAtivas\(estado\.tags, estado\.listaTags\), lista\]\.filter\(Boolean\)\.join\(' '\)/);
});

test('AC-14: seção de tags do card é ul.tags-filme entre p.meta e p.oscar, só com createElement e textContent, sem a nem button', () => {
  const item = corpoDe('desenharItem');
  const ini = item.indexOf('if (card.tags) {');
  assert.ok(ini >= 0);
  const trecho = item.slice(ini, item.indexOf('if (card.oscar)', ini));
  assert.match(trecho, /criar\('ul', undefined, \{ class: 'tags-filme', 'aria-label': 'Tags do filme' \}\)/);
  assert.match(trecho, /criar\('li', rotulo\)/);
  assert.doesNotMatch(trecho, /criar\('a'|criar\('button'|innerHTML|href/);
  assert.ok(item.indexOf("class: 'meta'") < ini && ini < item.indexOf('if (card.oscar)'));
  assert.doesNotMatch(app, /innerHTML/);
  // criar() usa createElement e textContent (nenhuma inserção de HTML bruto).
  assert.match(app, /document\.createElement\(tag\)/);
  assert.match(app, /no\.textContent = texto/);
});

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

test('AC-13: "Menos Bruxaria" remove a tag da lista e deixa o chip com aria-pressed false e true', () => {
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

test('AC-16: todo controle de chip é button com aria-pressed e texto não vazio (modelo e código)', () => {
  const estado = alternar(new Map(), 'magia', 'incluir');
  for (const c of montarChips({ candidatos: filmes, estado, lista })) {
    for (const b of montarControle(c, estado).botoes) assert.ok(typeof b.pressionado === 'boolean' && b.texto !== '' && b.nome !== '');
  }
  assert.match(corpoDe('desenharChips'), /criarControleTag\(montarControle\(/);
  assert.match(corpoDe('desenharChips'), /el\('chips'\)\.hidden = chips\.length === 0/);
});

test('AC-13: clique em chip refaz a recomendação sem "Recomendar" e devolve o foco', () => {
  const chip = corpoDe('alternarTagDoChip');
  assert.match(chip, /sugerir\(false\)/);
  assert.match(chip, /focarDepoisDeRefazer\(id, acao\)/);
  assert.match(corpoDe('mostrar'), /desenharChips\(resultado\)/);
  assert.match(app, /el\('chips'\)\.addEventListener\('click'/);
  assert.match(corpoDe('focarDepoisDeRefazer'), /el\('recomendar'\)/);
});
