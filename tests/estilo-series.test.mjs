import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// FILMELIER-6 (AC-19, AC-21, D-9): CSS das abas e da linha de situação. Lê só styles.css, sem pacote npm.
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
const regra = (seletor) => todos.find((b) => seletores(b).includes(seletor));
const emRem = (valor) => (/px$/.test(valor) ? parseFloat(valor) / 16 : parseFloat(valor));

test('AC-21: CSS das abas', () => {
  const selecionada = regra('.abas [role="tab"][aria-selected="true"]');
  assert.ok(selecionada);
  const borda = /border-bottom:\s*(\d+)px solid/.exec(selecionada.corpo);
  assert.ok(borda && Number(borda[1]) >= 2, 'border-bottom de no mínimo 2px');
  const peso = /font-weight:\s*(\d+)/.exec(selecionada.corpo);
  assert.ok(peso && Number(peso[1]) >= 600, 'font-weight de 600 ou mais');
  const aba = regra('.abas [role="tab"]');
  assert.ok(aba);
  const minH = /min-height:\s*([\d.]+(?:rem|px))/.exec(aba.corpo)?.[1];
  const minW = /min-width:\s*([\d.]+(?:rem|px))/.exec(aba.corpo)?.[1];
  assert.ok(minH && emRem(minH) >= 1.5 && minW && emRem(minW) >= 1.5, 'alvo de 1,5rem x 1,5rem');
  const foco = regra('.abas [role="tab"]:focus-visible');
  assert.ok(foco);
  const offset = /outline-offset:\s*([\d.]+)px/.exec(foco.corpo);
  assert.ok(offset && Number(offset[1]) >= 2, 'outline-offset de no mínimo 2px');
  // 2 abas lado a lado: flex sem quebra, cada aba com flex-basis 0 (cabem em 360 px).
  const lista = regra('.abas');
  assert.match(lista.corpo, /display:\s*flex/);
  assert.match(lista.corpo, /flex-wrap:\s*nowrap/);
  assert.match(aba.corpo, /flex:\s*1 1 0/);
});

test('AC-19: Reserva de altura da linha de situação', () => {
  const linha = regra('.linha-serie');
  assert.ok(linha);
  assert.match(linha.corpo, /min-height:\s*[\d.]+rem/);
  assert.doesNotMatch(css, /\.linha-serie\[[^\]]*\]|\.linha-serie\.(cancelada|finalizada|em-andamento)/, 'sem estilo por situação');
  // as reservas atuais continuam presentes
  for (const alvo of ['#humores']) {
    assert.match(css, new RegExp(`${alvo}\\s*\\{[^}]*min-height:\\s*[\\d.]+rem`));
  }
  assert.match(css, /@media \(min-width: 32\.6rem\)\s*\{\s*#humores\s*\{[^}]*min-height:\s*[\d.]+rem/);
  assert.match(css, /@media \(min-width: 47\.2rem\)\s*\{\s*#humores\s*\{[^}]*min-height:\s*[\d.]+rem/);
  assert.match(css, /\.sinopse-bloco\s*\{[^}]*\bheight:\s*9\.8rem/);
  assert.match(css, /\.card\.titulo-reservado \.bloco-titulo\s*\{[^}]*min-height:\s*[\d.]+rem/);
  assert.match(css, /\.provedores\s*\{[^}]*min-height:\s*[\d.]+rem/);
  // o humor de Séries reserva altura nas 3 larguras, como o de Filmes
  assert.match(css, /#series-humores\s*\{[^}]*min-height:\s*[\d.]+rem/);
  assert.match(css, /@media \(min-width: 32\.6rem\)\s*\{\s*#series-humores\s*\{[^}]*min-height:\s*[\d.]+rem/);
  assert.match(css, /@media \(min-width: 47\.2rem\)\s*\{\s*#series-humores\s*\{[^}]*min-height:\s*[\d.]+rem/);
});

test('D-9: nenhuma regra existente foi editada: o bloco novo vem antes do prefers-reduced-motion final', () => {
  const fim = css.trim().lastIndexOf('@media');
  assert.match(css.trim().slice(fim), /^@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.ok(css.indexOf('.abas {') < fim);
});
