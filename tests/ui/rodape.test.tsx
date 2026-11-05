import { describe, expect, test } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../src/ui/App';
import { criarDependencias } from './fixtures';

async function abrir() {
  const dependencias = criarDependencias();
  const utilizador = userEvent.setup();
  const tela = render(<App dependencias={dependencias} />);
  await waitFor(() => expect(tela.container.querySelector('#data-geracao')?.textContent).toBe('04/11/2026'));
  return { utilizador, dependencias, ...tela };
}

describe('AC-9: rodapé', () => {
  test('Wikidata (CC0) com "gerado em" e a data da fixture, em link de nova aba', async () => {
    const { container } = await abrir();
    const rodape = container.querySelector('footer')!;
    const link = within(rodape, 'Dados de filmes e séries: Wikidata (CC0)');
    expect(link.getAttribute('href')).toBe('https://www.wikidata.org/');
    expect(rodape.querySelector('p')?.textContent).toBe('Dados de filmes e séries: Wikidata (CC0) — gerado em 04/11/2026');
  });

  test('atribuições de Rotten Tomatoes e Metacritic, do Oscar e o aviso exato do TMDB', async () => {
    const { container } = await abrir();
    const rodape = container.querySelector('footer')!;
    const textos = [...rodape.querySelectorAll('p')].map((p) => p.textContent);
    expect(textos).toContain('Notas da crítica: Rotten Tomatoes e Metacritic via Wikidata (CC0)');
    expect(textos).toContain('Oscar: dados do Wikidata (CC0)');
    expect(textos).toContain('Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.');
  });

  test('logo local do TMDB com alt, 123x16 e link com noopener noreferrer', async () => {
    const { container } = await abrir();
    const logo = screen.getByRole('img', { name: 'TMDB' });
    expect(logo.getAttribute('src')).toBe('assets/tmdb-logo.svg');
    expect(logo.getAttribute('width')).toBe('123');
    expect(logo.getAttribute('height')).toBe('16');
    const link = logo.closest('a')!;
    expect(link.getAttribute('href')).toBe('https://www.themoviedb.org/');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(container.querySelector('footer .logo-tmdb')).toBeTruthy();
  });

  test('todo a[target=_blank] da página, com resultado, tem rel="noopener noreferrer"', async () => {
    const { container, utilizador } = await abrir();
    await utilizador.click(screen.getByRole('radio', { name: 'Leve e engraçado' }));
    await utilizador.click(screen.getByRole('button', { name: 'Recomendar' }));
    const externos = [...container.querySelectorAll('a[target="_blank"]')];
    expect(externos.length).toBeGreaterThan(5);
    for (const a of externos) expect(a.getAttribute('rel'), a.outerHTML).toBe('noopener noreferrer');
    expect(container.querySelectorAll('a:not([target="_blank"])').length).toBe(0);
  });
});

function within(raiz: Element, texto: string) {
  const achado = [...raiz.querySelectorAll('a')].find((a) => a.textContent === texto);
  if (!achado) throw new Error(`link não encontrado: ${texto}`);
  return achado;
}
