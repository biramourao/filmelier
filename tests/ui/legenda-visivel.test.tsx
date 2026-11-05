import { expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../src/ui/App';
import { criarDados, criarDependencias } from './fixtures';

const LEGENDA = '+ quero · − não quero';

// Cobre o ENTÃO do AC-11: a legenda é visível (fora de .so-leitor e de qualquer [hidden]) e não é aria-hidden.
function legendaVisivel(el: Element) {
  expect(el.textContent).toBe(LEGENDA);
  expect(el.closest('.so-leitor')).toBeNull();
  expect(el.closest('[hidden]')).toBeNull();
  expect(el.closest('[aria-hidden="true"]')).toBeNull();
}

test('AC-11: a legenda no grupo de temas aberto e na área dos chips é visível e não é aria-hidden', async () => {
  const dependencias = criarDependencias({ carregarDados: vi.fn(async () => criarDados()) });
  const utilizador = userEvent.setup();
  const { container } = render(<App dependencias={dependencias} />);
  await screen.findByRole('radio', { name: 'Leve e engraçado' });

  const grupo = container.querySelector('details#grupo-temas') as HTMLDetailsElement;
  await utilizador.click(grupo.querySelector('summary')!);
  expect(grupo.open).toBe(true);
  legendaVisivel(grupo.querySelector('.legenda-tags')!);

  await utilizador.click(screen.getByRole('radio', { name: 'Leve e engraçado' }));
  await utilizador.click(screen.getByRole('button', { name: 'Recomendar' }));
  legendaVisivel(container.querySelector('#chips .legenda-tags')!);
});
