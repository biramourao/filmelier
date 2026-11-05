import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../src/ui/App';
import { criarDependencias, criarFilmes } from './fixtures';

const filmes = criarFilmes();
const comedias = filmes.slice(0, 8);

function resultadoFixo(lista: any[], extras: Record<string, unknown> = {}) {
  return { nivel: 'humor', filmes: lista, aviso: '', mensagem: '', candidatos: lista, ...extras };
}

async function abrir(sobrescrever = {}) {
  const dependencias = criarDependencias(sobrescrever);
  const utilizador = userEvent.setup();
  const tela = render(<App dependencias={dependencias} />);
  await screen.findByRole('radio', { name: 'Leve e engraçado' });
  return { dependencias, utilizador, ...tela };
}

async function recomendarLeve(utilizador: ReturnType<typeof userEvent.setup>) {
  await utilizador.click(screen.getByRole('radio', { name: 'Leve e engraçado' }));
  await utilizador.click(screen.getByRole('button', { name: 'Recomendar' }));
}

const itens = (container: HTMLElement) => container.querySelectorAll('#lista > li');
const botaoOutras = () => screen.queryByRole('button', { name: 'Outras sugestões' });

describe('AC-3: o formulário limpa o resultado', () => {
  const casos: [string, (u: ReturnType<typeof userEvent.setup>) => Promise<unknown>][] = [
    ['humor', (u) => u.click(screen.getByRole('radio', { name: 'Tenso, quero adrenalina' }))],
    ['gênero', (u) => u.selectOptions(screen.getByRole('combobox', { name: 'Gênero (opcional)' }), 'Q1')],
    ['De', (u) => u.selectOptions(screen.getByRole('combobox', { name: 'De' }), '2000')],
    ['Até', (u) => u.selectOptions(screen.getByRole('combobox', { name: 'Até' }), '2009')],
    ['Nota mínima', (u) => u.selectOptions(screen.getByRole('combobox', { name: 'Nota mínima' }), '7')],
    ['Oscar', (u) => u.selectOptions(screen.getByRole('combobox', { name: 'Oscar' }), 'indicado')],
  ];

  test.each(casos)('mudar %s esvazia lista, aviso e região live e oculta "Outras sugestões"', async (_nome, alterar) => {
    const recomendar = vi.fn(() => resultadoFixo(comedias.slice(0, 3), { nivel: 'genero', aviso: 'Aviso de teste.' }));
    const { utilizador, container } = await abrir({ recomendar });
    await recomendarLeve(utilizador);
    expect(itens(container).length).toBe(3);
    expect(container.querySelector('#aviso')?.textContent).toBe('Aviso de teste.');
    expect(container.querySelector('#resumo-lista')?.textContent).not.toBe('');
    expect(botaoOutras()).toBeTruthy();
    await alterar(utilizador);
    expect(itens(container).length).toBe(0);
    expect(container.querySelector('#aviso')).toBeNull();
    expect(container.querySelector('#resumo-lista')?.textContent).toBe('');
    expect(container.querySelector('#chips')?.children.length ?? 0).toBe(0);
    expect(botaoOutras()).toBeNull();
  });
});

describe('AC-3: parâmetros do cenário fixo', () => {
  test('recomendar é chamado 1 vez com humor, gênero, filtros e tagsValidas do cenário, e a lista tem min(5, filmes) cards', async () => {
    const recomendar = vi.fn(() => resultadoFixo(comedias.slice(0, 2)));
    const { utilizador, container } = await abrir({ recomendar });
    await utilizador.click(screen.getByRole('radio', { name: 'Leve e engraçado' }));
    await utilizador.selectOptions(screen.getByRole('combobox', { name: 'Gênero (opcional)' }), 'Q1');
    await utilizador.selectOptions(screen.getByRole('combobox', { name: 'De' }), '1990');
    await utilizador.selectOptions(screen.getByRole('combobox', { name: 'Até' }), '1999');
    await utilizador.selectOptions(screen.getByRole('combobox', { name: 'Nota mínima' }), '6');
    await utilizador.selectOptions(screen.getByRole('combobox', { name: 'Oscar' }), 'indicado');
    await utilizador.click(screen.getByRole('button', { name: 'Recomendar' }));
    expect(recomendar).toHaveBeenCalledTimes(1);
    const p = (recomendar.mock.calls[0] as any)[0];
    expect(p).toMatchObject({
      humorId: 'leve', generoQid: 'Q1', anoDe: 1990, anoAte: 1999, notaMin: 6, oscar: 'indicado',
      incluir: [], excluir: [], tagsValidas: ['bruxaria', 'sombrio', 'magia'], anteriores: [],
    });
    expect(itens(container).length).toBe(2);
  });

  test('com 8 comédias o recomendar real devolve 5 cards', async () => {
    const { utilizador, container } = await abrir();
    await recomendarLeve(utilizador);
    expect(itens(container).length).toBe(5);
  });
});

describe('AC-4: Outras sugestões e nível nenhum', () => {
  test('a 2ª chamada recebe os qids exibidos como anteriores', async () => {
    const recomendar = vi.fn(() => resultadoFixo(comedias.slice(0, 3)));
    const { utilizador } = await abrir({ recomendar });
    await recomendarLeve(utilizador);
    await utilizador.click(screen.getByRole('button', { name: 'Outras sugestões' }));
    expect(recomendar).toHaveBeenCalledTimes(2);
    expect((recomendar.mock.calls[1] as any)[0].anteriores).toEqual(['Q101', 'Q102', 'Q103']);
  });

  test('nível nenhum: botão oculto, mensagem antes da lista e nenhum card', async () => {
    const mensagem = 'Não encontramos filmes para essa combinação. Escolha outro humor ou gênero.';
    const recomendar = vi.fn(() => resultadoFixo([], { nivel: 'nenhum', mensagem }));
    const { utilizador, container } = await abrir({ recomendar });
    await recomendarLeve(utilizador);
    expect(botaoOutras()).toBeNull();
    const aviso = container.querySelector('#aviso')!;
    expect(aviso.textContent).toBe(mensagem);
    const lista = container.querySelector('#lista')!;
    expect(aviso.compareDocumentPosition(lista) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(itens(container).length).toBe(0);
  });

  test('com aviso vazio o elemento do aviso não é renderizado', async () => {
    const { utilizador, container } = await abrir();
    await recomendarLeve(utilizador);
    expect(container.querySelector('#aviso')).toBeNull();
  });

  test('o aviso de relaxamento aparece acima da lista', async () => {
    const recomendar = vi.fn(() => resultadoFixo(comedias.slice(0, 2), { nivel: 'humor', aviso: 'Mostrando filmes para o humor Leve e engraçado.' }));
    const { utilizador, container } = await abrir({ recomendar });
    await recomendarLeve(utilizador);
    const aviso = container.querySelector('#aviso')!;
    expect(aviso.compareDocumentPosition(container.querySelector('#lista')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('AC-5: região live curta', () => {
  test('1 filme: "1 sugestão: {título}." e 3 filmes com aviso: texto exato, sem sinopse', async () => {
    let n = 0;
    const respostas = [
      resultadoFixo(comedias.slice(0, 1)),
      resultadoFixo(comedias.slice(0, 3), { nivel: 'genero', aviso: 'Aviso de teste.' }),
    ];
    const recomendar = vi.fn(() => respostas[n++]);
    const { utilizador, container } = await abrir({ recomendar });
    await recomendarLeve(utilizador);
    const viva = container.querySelector('[aria-live="polite"]')!;
    expect(viva.id).toBe('resumo-lista');
    expect(viva.textContent).toBe('1 sugestão: Comédia 1.');
    await utilizador.click(screen.getByRole('button', { name: 'Recomendar' }));
    expect(viva.textContent).toBe('Aviso de teste. 3 sugestões: Comédia 1, Comédia 2, Comédia 3.');
  });

  test('nenhum ancestral de ul#lista tem aria-live', async () => {
    const { utilizador, container } = await abrir();
    await recomendarLeve(utilizador);
    for (let no = container.querySelector('#lista'); no; no = no.parentElement) expect(no.hasAttribute('aria-live')).toBe(false);
    expect(container.querySelectorAll('[aria-live]').length).toBe(1);
  });
});
