import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// Blocos de primeiro nível { seletor, corpo } (sem aninhar @media).
function blocos(texto) {
  const lista = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(texto)) !== null) lista.push({ seletor: m[1].trim(), corpo: m[2] });
  return lista;
}
const todos = blocos(css);

function variaveis() {
  const mapa = {};
  for (const m of css.matchAll(/(--cor-[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) mapa[m[1]] = m[2];
  return mapa;
}

function luminancia(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function razao(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

test('AC-12: todas as variáveis --cor- estão declaradas num único bloco de regra', () => {
  const comDeclaracao = todos.filter((b) => /--cor-[a-z0-9-]+\s*:/.test(b.corpo));
  assert.equal(comDeclaracao.length, 1);
  assert.equal(comDeclaracao[0].seletor, ':root');
  assert.ok(Object.keys(variaveis()).length >= 19);
});

test('AC-12: border-radius de card, botão, select e chip vale 0,5rem ou mais', () => {
  const alvos = ['.card', 'button', 'select', '.opcao'];
  for (const alvo of alvos) {
    const bloco = todos.find((b) => b.seletor.split(',').map((s) => s.trim()).includes(alvo));
    assert.ok(bloco, alvo);
    const m = /border-radius:\s*([\d.]+)rem/.exec(bloco.corpo);
    assert.ok(m && Number(m[1]) >= 0.5, `${alvo}: ${m?.[0]}`);
  }
  for (const m of css.matchAll(/border-radius:\s*([\d.]+)(rem|px)/g)) {
    const rem = m[2] === 'px' ? Number(m[1]) / 16 : Number(m[1]);
    assert.ok(rem >= 0.5, m[0]);
  }
});

const PARES = [
  ['--cor-texto', '--cor-fundo', 4.5],
  ['--cor-texto', '--cor-superficie', 4.5],
  ['--cor-texto', '--cor-superficie-suave', 4.5],
  ['--cor-texto-secundario', '--cor-superficie', 4.5],
  ['--cor-texto-secundario', '--cor-fundo', 4.5],
  ['--cor-link', '--cor-superficie', 4.5],
  ['--cor-link', '--cor-fundo', 4.5],
  ['--cor-texto-sobre-primaria', '--cor-primaria', 4.5],
  ['--cor-texto-sobre-primaria', '--cor-primaria-escura', 4.5],
  ['--cor-texto-sobre-primaria', '--cor-desabilitado', 4.5],
  ['--cor-texto', '--cor-aviso-fundo', 4.5],
  ['--cor-erro-texto', '--cor-erro-fundo', 4.5],
  ['--cor-borda', '--cor-superficie', 3],
  ['--cor-borda', '--cor-fundo', 3],
  ['--cor-foco', '--cor-fundo', 3],
  ['--cor-foco', '--cor-superficie', 3],
  ['--cor-primaria', '--cor-superficie-suave', 3],
  ['--cor-aviso-borda', '--cor-aviso-fundo', 3],
  ['--cor-erro-borda', '--cor-erro-fundo', 3],
];

test('AC-12: 19 pares de contraste WCAG lidos das variáveis do styles.css', () => {
  const v = variaveis();
  assert.equal(PARES.length, 19);
  for (const [frente, fundo, minimo] of PARES) {
    assert.ok(v[frente] && v[fundo], `${frente} / ${fundo}`);
    const r = razao(v[frente], v[fundo]);
    assert.ok(r >= minimo, `${frente} ${v[frente]} / ${fundo} ${v[fundo]}: ${r.toFixed(2)} < ${minimo}`);
  }
});

// FILMELIER-3: pares da seção de provedores (tabela própria; os 19 pares acima não mudam).
// Não texto (contorno do logo e do nome) no mínimo 3,0; texto (rótulos, estados e atribuição) no mínimo 4,5.
const PARES_PROVEDORES = [
  ['--cor-logo-borda', '--cor-superficie', 3, 'não texto'],
  ['--cor-texto-secundario', '--cor-superficie', 4.5, 'texto'],
  ['--cor-link', '--cor-superficie', 4.5, 'texto'],
];

test('AC-8: pares de contraste da seção de provedores (cor nova do contorno do logo no bloco único)', () => {
  const v = variaveis();
  assert.ok(v['--cor-logo-borda'], '--cor-logo-borda declarada');
  for (const [frente, fundo, minimo, tipo] of PARES_PROVEDORES) {
    assert.ok(v[frente] && v[fundo], `${frente} / ${fundo}`);
    const r = razao(v[frente], v[fundo]);
    assert.ok(r >= minimo, `${tipo} ${frente} ${v[frente]} / ${fundo} ${v[fundo]}: ${r.toFixed(2)} < ${minimo}`);
  }
  const comDeclaracao = todos.filter((b) => /--cor-[a-z0-9-]+\s*:/.test(b.corpo));
  assert.equal(comDeclaracao.length, 1);
});

test('AC-12: razão de contraste calculada confere com a tabela de design D-9 (texto/fundo 12,74)', () => {
  assert.ok(Math.abs(razao('#3d2b1f', '#fff8ef') - 12.74) < 0.05);
});

test('AC-12: transition ou animation só com bloco prefers-reduced-motion que as anula', () => {
  if (!/transition\s*:|animation\s*:/.test(css)) return;
  const m = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*)\}\s*$/.exec(css.trim());
  assert.ok(m, 'bloco prefers-reduced-motion');
  assert.match(m[1], /transition\s*:\s*none|animation\s*:\s*none/);
});

test('AC-12: foco visível com outline-offset de no mínimo 2px e sem fonte externa nem @import', () => {
  const m = /:focus-visible[^{]*\{[^}]*outline-offset:\s*(\d+)px/.exec(css);
  assert.ok(m && Number(m[1]) >= 2);
  assert.doesNotMatch(css, /@import|@font-face|fonts\.googleapis/);
});
