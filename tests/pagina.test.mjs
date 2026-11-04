import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Verificações estáticas do index.html e do app.mjs (sem DOM). O comportamento no
// navegador continua dependendo do roteiro manual (P-30..P-33).
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/app.mjs', import.meta.url), 'utf8');
const dataset = JSON.parse(readFileSync(new URL('../data/filmes.json', import.meta.url), 'utf8'));

test('AC-3: botão Recomendar nasce com disabled e nada é exibido antes de escolher humor', () => {
  assert.match(html, /<button[^>]*id="recomendar"[^>]*\sdisabled[\s>]/);
  assert.match(html, /<ul id="lista"><\/ul>/);
  assert.match(html, /<button[^>]*id="outras"[^>]*\shidden/);
});

test('AC-3: o botão só habilita com humor marcado (sem passo extra para o gênero)', () => {
  assert.match(app, /disabled = !\(estado\.humores && humorMarcado\(\)\)/);
});

test('AC-1: humor é radio de mesmo name (1 por vez), sem múltipla seleção', () => {
  assert.match(app, /type: 'radio', name: 'humor'/);
  assert.doesNotMatch(app, /type: 'checkbox'/);
});

test('AC-2: gênero é select simples com "Qualquer gênero" como 1ª opção (value vazio)', () => {
  const select = /<select id="genero"([^>]*)>\s*<option value="">Qualquer gênero<\/option>/.exec(html);
  assert.ok(select, 'select com opção padrão');
  assert.doesNotMatch(select[1], /multiple/);
  assert.doesNotMatch(html, /<option[^>]*selected/);
});

test('AC-9: mensagem de erro fixa no HTML, oculta por padrão, exibida só na falha de carga', () => {
  assert.match(html, /<p id="erro"[^>]*\shidden>Não foi possível carregar a lista de filmes\. Recarregue a página\.<\/p>/);
  assert.match(app, /if \(dados\.erro\) \{\s*el\('erro'\)\.hidden = false;/);
});

test('AC-14: rodapé com texto, link para wikidata.org e data de geração vinda de meta.geradoEm', () => {
  assert.match(html, /<a href="https:\/\/www\.wikidata\.org\/"[^>]*>Dados de filmes: Wikidata \(CC0\)<\/a>/);
  assert.match(html, /id="data-geracao"/);
  assert.match(app, /el\('data-geracao'\)\.textContent = formatarData\(dados\.filmes\.meta\.geradoEm\)/);
  assert.ok(!Number.isNaN(Date.parse(dataset.meta.geradoEm)));
});

test('AC-7: o aviso de relaxamento é exibido acima da lista (ordem no HTML e preenchimento no app)', () => {
  assert.ok(html.indexOf('id="aviso"') < html.indexOf('id="lista"'));
  assert.match(app, /aviso\.textContent = texto/);
  assert.match(app, /resultado\.nivel === 'nenhum' \? resultado\.mensagem : resultado\.aviso/);
});
