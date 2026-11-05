import { describe, expect, test } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../src/ui/App';
import { criarDependencias } from './fixtures';

async function abrir(sobrescrever = {}) {
  const dependencias = criarDependencias(sobrescrever);
  const utilizador = userEvent.setup();
  const resultado = render(<App dependencias={dependencias} />);
  await screen.findByRole('radio', { name: 'Leve e engraçado' });
  return { dependencias, utilizador, ...resultado };
}

const opcoes = (select: HTMLElement) => [...(select as HTMLSelectElement).options].map((o) => [o.value, o.textContent]);

describe('AC-1: humor, gênero e botão', () => {
  test('radios de humor com o mesmo name e o emoji fora do nome acessível', async () => {
    const { container } = await abrir();
    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBe(3);
    expect(new Set(radios.map((r) => r.getAttribute('name'))).size).toBe(1);
    expect(radios.map((r) => r.getAttribute('name'))[0]).toBe('humor');
    expect(screen.getByRole('radio', { name: 'Tenso, quero adrenalina' })).toBeTruthy();
    for (const emoji of container.querySelectorAll('.emoji')) expect(emoji.getAttribute('aria-hidden')).toBe('true');
  });

  test('gênero com "Qualquer gênero" primeiro e os gêneros de listarGeneros em ordem pt-BR', async () => {
    await abrir();
    const genero = screen.getByRole('combobox', { name: 'Gênero (opcional)' });
    expect(opcoes(genero)).toEqual([['', 'Qualquer gênero'], ['Q3', 'Ação'], ['Q2', 'Animação'], ['Q1', 'Comédia'], ['Q4', 'Drama']]);
  });

  test('"Recomendar" fica desabilitado sem dados e sem humor, e habilita ao escolher o humor', async () => {
    const dependencias = criarDependencias();
    const utilizador = userEvent.setup();
    render(<App dependencias={dependencias} />);
    const botao = screen.getByRole('button', { name: 'Recomendar' }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    await utilizador.click(await screen.findByRole('radio', { name: 'Quero me emocionar' }));
    expect(botao.disabled).toBe(false);
  });

  test('com dados mas sem humor o botão continua desabilitado', async () => {
    await abrir();
    expect((screen.getByRole('button', { name: 'Recomendar' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('AC-2: Época, Nota mínima e Oscar', () => {
  test('opções exatas de Época (De e Até), Nota mínima e Oscar', async () => {
    await abrir();
    const grupo = screen.getByRole('group', { name: 'Época' });
    expect(opcoes(within(grupo).getByRole('combobox', { name: 'De' })).map((o) => o[1])).toEqual(
      ['Qualquer', '1920', '1930', '1940', '1950', '1960', '1970', '1980', '1990', '2000', '2010', '2020']);
    expect(opcoes(within(grupo).getByRole('combobox', { name: 'Até' })).map((o) => o[1])).toEqual(
      ['Qualquer', '1929', '1939', '1949', '1959', '1969', '1979', '1989', '1999', '2009', '2019', '2029']);
    expect(opcoes(screen.getByRole('combobox', { name: 'Nota mínima' }))).toEqual(
      [['', 'Qualquer'], ['5', '5+'], ['6', '6+'], ['7', '7+'], ['8', '8+'], ['9', '9+']]);
    expect(opcoes(screen.getByRole('combobox', { name: 'Oscar' }))).toEqual([['', 'Qualquer'], ['indicado', 'Indicado'], ['vencedor', 'Vencedor']]);
  });

  test('o envio passa De=2000, Até=1999 (menor que De, a troca é de recomendar), 7+ e Vencedor', async () => {
    const { dependencias, utilizador } = await abrir();
    await utilizador.click(screen.getByRole('radio', { name: 'Leve e engraçado' }));
    await utilizador.selectOptions(screen.getByRole('combobox', { name: 'De' }), '2000');
    await utilizador.selectOptions(screen.getByRole('combobox', { name: 'Até' }), '1999');
    await utilizador.selectOptions(screen.getByRole('combobox', { name: 'Nota mínima' }), '7');
    await utilizador.selectOptions(screen.getByRole('combobox', { name: 'Oscar' }), 'vencedor');
    await utilizador.selectOptions(screen.getByRole('combobox', { name: 'Gênero (opcional)' }), 'Q1');
    await utilizador.click(screen.getByRole('button', { name: 'Recomendar' }));
    expect(dependencias.recomendar).toHaveBeenCalledTimes(1);
    const parametros = (dependencias.recomendar as any).mock.calls[0][0];
    expect(parametros).toMatchObject({ humorId: 'leve', generoQid: 'Q1', anoDe: 2000, anoAte: 1999, notaMin: 7, oscar: 'vencedor' });
  });

  test('sem filtros o envio passa null e "" (qualquer)', async () => {
    const { dependencias, utilizador } = await abrir();
    await utilizador.click(screen.getByRole('radio', { name: 'Leve e engraçado' }));
    await utilizador.click(screen.getByRole('button', { name: 'Recomendar' }));
    expect((dependencias.recomendar as any).mock.calls[0][0]).toMatchObject({ generoQid: null, anoDe: null, anoAte: null, notaMin: null, oscar: '' });
  });

  test('ordem no DOM: humor, gênero, Época, Nota mínima, Oscar, Recomendar', async () => {
    await abrir();
    const nos = [
      screen.getByRole('group', { name: 'Qual é o seu humor hoje?' }),
      screen.getByRole('combobox', { name: 'Gênero (opcional)' }),
      screen.getByRole('group', { name: 'Época' }),
      screen.getByRole('combobox', { name: 'Nota mínima' }),
      screen.getByRole('combobox', { name: 'Oscar' }),
      screen.getByRole('button', { name: 'Recomendar' }),
    ];
    for (let i = 0; i < nos.length - 1; i += 1) {
      expect(nos[i].compareDocumentPosition(nos[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });
});

describe('AC-10: marcação da FILMELIER-1 preservada', () => {
  test('ids, classes e vínculos de label e radio', async () => {
    const { container } = await abrir();
    expect(container.querySelector('form#formulario')).toBeTruthy();
    expect(container.querySelector('#humores')).toBeTruthy();
    const opcao = container.querySelector('#humores .opcao')!;
    const radio = opcao.querySelector('input[type="radio"]') as HTMLInputElement;
    const rotulo = opcao.querySelector('label')!;
    expect(radio.id).toBe('humor-leve');
    expect(radio.value).toBe('leve');
    expect(rotulo.getAttribute('for')).toBe('humor-leve');
    const emoji = rotulo.querySelector('span.emoji')!;
    expect(emoji.getAttribute('aria-hidden')).toBe('true');
    expect(rotulo.firstElementChild).toBe(emoji);
    for (const id of ['genero', 'ano-de', 'ano-ate', 'nota-min', 'oscar', 'recomendar']) expect(container.querySelector(`#${id}`)).toBeTruthy();
    expect(container.querySelector('fieldset.epoca .periodo')).toBeTruthy();
    expect(container.querySelector('#recomendar')!.getAttribute('type')).toBe('submit');
  });
});
