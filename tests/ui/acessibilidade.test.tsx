import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../src/ui/App';
import { criarDependencias } from './fixtures';

// Acessibilidade da marcação renderizada (migra estatico:87 e estatico:224, D-13).
async function abrir() {
  const dependencias = criarDependencias();
  const utilizador = userEvent.setup();
  const tela = render(<App dependencias={dependencias} />);
  await screen.findByRole('radio', { name: 'Leve e engraçado' });
  return { utilizador, ...tela };
}

describe('AC-18: marcação acessível', () => {
  test('região aria-live polite, fieldset com legend e label[for] do gênero', async () => {
    const { container } = await abrir();
    expect(container.querySelector('p#resumo-lista[aria-live="polite"]')).toBeTruthy();
    const fieldset = container.querySelector('fieldset')!;
    expect(fieldset.querySelector('legend')?.textContent).toBe('Qual é o seu humor hoje?');
    expect(container.querySelector('label[for="genero"]')?.textContent).toBe('Gênero (opcional)');
    expect(container.querySelector('select#genero')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Gênero (opcional)' })).toBeTruthy();
  });

  test('a lista de cards fica fora de qualquer região aria-live', async () => {
    const { container, utilizador } = await abrir();
    await utilizador.click(screen.getByRole('radio', { name: 'Leve e engraçado' }));
    await utilizador.click(screen.getByRole('button', { name: 'Recomendar' }));
    const lista = container.querySelector('ul#lista')!;
    expect(lista.querySelectorAll('li').length).toBeGreaterThan(0);
    for (let no: Element | null = lista; no; no = no.parentElement) expect(no.hasAttribute('aria-live')).toBe(false);
    expect(lista.querySelector('[aria-live]')).toBeNull();
    expect(container.querySelector('section#resultado')?.hasAttribute('aria-live')).toBe(false);
  });

  test('o alerta de erro só aparece na falha e todo botão tem nome acessível', async () => {
    const { container } = await abrir();
    expect(screen.queryByRole('alert')).toBeNull();
    for (const botao of container.querySelectorAll('button')) {
      expect((botao.textContent ?? '').trim(), botao.outerHTML).not.toBe('');
    }
  });
});
