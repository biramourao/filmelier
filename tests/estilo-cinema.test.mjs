import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// FILMELIER-5 (AC-18, D-7): tema cinema escuro. Lê só styles.css, sem pacote npm.
const bruto = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const css = bruto.replace(/\/\*[\s\S]*?\*\//g, '');

function blocos(texto) {
  const lista = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(texto)) !== null) lista.push({ seletor: m[1].trim(), corpo: m[2] });
  return lista;
}
const todos = blocos(css);
const seletores = (b) => b.seletor.split(',').map((s) => s.trim());
const raizes = todos.filter((b) => b.seletor === ':root');
const variaveis = () => Object.fromEntries([...raizes[0].corpo.matchAll(/(--cor-[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]]));

function luminancia(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function matiz(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return { h: 0, s: 0 };
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: d / (1 - Math.abs(max + min - 1)) };
}

test('AC-18: um único bloco :root declara todas as variáveis --cor-', () => {
  assert.equal(raizes.length, 1);
  assert.equal(todos.filter((b) => /--cor-[a-z0-9-]+\s*:/.test(b.corpo)).length, 1);
});

test('AC-18: --cor-fundo é quase preto (luminância relativa de no máximo 0,03)', () => {
  const fundo = variaveis()['--cor-fundo'];
  assert.ok(fundo);
  assert.ok(luminancia(fundo) <= 0.03, `${fundo}: ${luminancia(fundo)}`);
});

test('AC-18: os tokens de dourado e de vermelho existem, têm a matiz certa e são usados por var()', () => {
  const v = variaveis();
  const dourado = matiz(v['--cor-destaque-dourado']);
  const vermelho = matiz(v['--cor-destaque-vermelho']);
  assert.ok(dourado.h >= 35 && dourado.h <= 55 && dourado.s >= 0.4, JSON.stringify(dourado));
  assert.ok((vermelho.h <= 10 || vermelho.h >= 350) && vermelho.s >= 0.4, JSON.stringify(vermelho));
  const primario = todos.find((b) => b.seletor === 'button');
  assert.match(primario.corpo, /background:\s*var\(--cor-destaque-dourado\)/);
  const pressionado = todos.find((b) => seletores(b).includes('.tag-controle button[aria-pressed="true"]'));
  assert.match(pressionado.corpo, /var\(--cor-destaque-dourado\)/);
  const excluido = todos.find((b) => seletores(b).includes('.tag-controle button[data-acao="excluir"][aria-pressed="true"]'));
  assert.match(excluido.corpo, /var\(--cor-destaque-vermelho\)/);
});

test('AC-18: nenhuma cor literal fora do :root (tudo por var(--cor-*))', () => {
  const fora = css.replace(/:root\s*\{[^}]*\}/, '');
  const nomes = ['white', 'black', 'red', 'gold', 'goldenrod', 'yellow', 'orange', 'gray', 'grey', 'silver', 'maroon', 'navy', 'blue', 'green'];
  const padroes = [/#[0-9a-fA-F]{3,8}\b/, /\brgba?\s*\(/, /\bhsla?\s*\(/, /\b(?:oklch|oklab|lab|lch|hwb|color)\s*\(/, new RegExp(`:\\s*[^;{}]*\\b(?:${nomes.join('|')})\\b[^;{}]*;`)];
  for (const re of padroes) assert.doesNotMatch(fora, re, String(re));
});

test('AC-18: o detector de cor literal reconhece hex, rgb e nome de cor', () => {
  const amostras = ['a { color: #fff; }', 'a { background: rgba(0, 0, 0, 0.5); }', 'a { color: gold; }'];
  const re = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|:\s*[^;{}]*\b(?:gold)\b[^;{}]*;/;
  for (const a of amostras) assert.match(a, re, a);
});

test('AC-18: sem @import nem @font-face, só fontes do sistema', () => {
  assert.doesNotMatch(css, /@import|@font-face/);
  assert.match(css, /font-family:\s*system-ui/);
});

// Feedback de interação (RNF-15): os 4 seletores com :hover e foco visível, deslocamento de até 4px e durações de 120 a 300 ms.
const QUATRO = ['button', '.tag-controle button', '.opcao', '.card'];
const regrasCom = (alvo, pseudo) => todos.filter((b) => seletores(b).some((s) => s.startsWith(alvo) && s.includes(pseudo)));

test('AC-18: :hover definido nos 4 seletores de feedback', () => {
  for (const alvo of QUATRO) {
    assert.ok(todos.some((b) => seletores(b).some((s) => s === `${alvo}:hover` || s === `${alvo}:hover:not(:disabled)`)), alvo);
  }
});

test('AC-18: foco visível nos 4 seletores (container por :has(:focus-visible))', () => {
  for (const alvo of QUATRO) assert.ok(regrasCom(alvo, ':focus-visible').length > 0, alvo);
  for (const alvo of ['.opcao', '.card']) {
    const regra = todos.find((b) => seletores(b).includes(`${alvo}:has(:focus-visible)`));
    assert.ok(regra, alvo);
    assert.match(regra.corpo, /outline:\s*3px solid var\(--cor-foco\)/);
  }
});

test('AC-18: o deslocamento do :hover é de no máximo 4px e as durações ficam entre 120 e 300 ms', () => {
  const desloc = [...css.matchAll(/translateY\(\s*(-?[\d.]+)(px|rem)\s*\)/g)];
  assert.ok(desloc.length >= 3);
  for (const m of desloc) {
    const px = Math.abs(Number(m[1])) * (m[2] === 'rem' ? 16 : 1);
    assert.ok(px <= 4, m[0]);
  }
  const duracoes = [...css.matchAll(/transition\s*:\s*([^;]+);/g)].flatMap((m) => [...m[1].matchAll(/(\d+(?:\.\d+)?)(ms|s)\b/g)])
    .map((d) => Number(d[1]) * (d[2] === 's' ? 1000 : 1));
  assert.ok(duracoes.length >= 3);
  for (const ms of duracoes) assert.ok(ms >= 120 && ms <= 300, `${ms} ms`);
});

test('AC-18: prefers-reduced-motion: reduce é o último bloco e anula transition e animation de todo elemento', () => {
  const fim = css.trim().lastIndexOf('@media');
  assert.match(css.trim().slice(fim), /^@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css.trim().slice(fim), /transition:\s*none\s*!important[\s\S]*animation:\s*none\s*!important/);
});
