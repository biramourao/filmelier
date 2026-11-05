import { afterEach, describe, expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../src/ui/App';
import { recomendar as recomendarReal } from '../../src/recomendar.mjs';
import { criarDependencias, criarFilmes } from './fixtures';

// AC-10: textos em pt-BR (tabela D-9). Os controles são achados por papel e nome, que é o que o usuário percebe.
const comedias = criarFilmes().slice(0, 2);
const ENRIQ = {
  idioma: 'pt', sinopse: 'Uma sinopse de teste.', capaUrl: 'https://upload.wikimedia.org/capa.jpg', artigoUrl: 'https://pt.wikipedia.org/wiki/Teste',
};
const PROV = { status: 'ok', titulo: 'Título pt-BR', tituloOriginal: 'Comédia 1', link: 'https://www.themoviedb.org/movie/1/watch', flatrate: [{ provider_id: 1, provider_name: 'Netflix', logo_path: '/n.jpg', display_priority: 1 }] };

async function abrir(comResultado: boolean, sobrescrever: Record<string, unknown> = {}) {
  const dependencias = criarDependencias({
    recomendar: vi.fn(() => ({ nivel: 'humor', filmes: comedias, aviso: '', mensagem: '', candidatos: comedias })),
    criarEnriquecedor: () => ({ enriquecer: async () => new Map([['Q101', ENRIQ], ['Q102', ENRIQ]]) }),
    criarProvedores: () => ({ ativo: true, buscar: async () => new Map([['Q101', PROV], ['Q102', PROV]]) }),
    ...sobrescrever,
  });
  const utilizador = userEvent.setup();
  const tela = render(<App dependencias={dependencias} />);
  await utilizador.click(await screen.findByRole('radio', { name: 'Leve e engraçado' }));
  if (comResultado) {
    await utilizador.click(screen.getByRole('button', { name: 'Recomendar' }));
    await screen.findAllByText('Sinopse: ', { exact: false });
    await screen.findAllByText('Título pt-BR');
  }
  return { utilizador, dependencias, ...tela };
}

afterEach(() => {
  delete (HTMLElement.prototype as any).scrollHeight;
  delete (HTMLElement.prototype as any).clientHeight;
});

describe('AC-10: controles da tabela D-9', () => {
  test('formulário: humor, gênero, Época, Nota mínima, Oscar, grupo de temas e Recomendar', async () => {
    await abrir(false);
    expect(screen.getByRole('radio', { name: 'Leve e engraçado' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Qual é o seu humor hoje?' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Gênero (opcional)' })).toBeTruthy();
    const epoca = screen.getByRole('group', { name: 'Época' });
    expect(within(epoca).getByRole('combobox', { name: 'De' })).toBeTruthy();
    expect(within(epoca).getByRole('combobox', { name: 'Até' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Nota mínima' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Oscar' })).toBeTruthy();
    expect(screen.getByText('Filtrar por tema (opcional)').tagName).toBe('SUMMARY');
    expect(screen.getByText('Temas (opcional)').tagName).toBe('LEGEND');
    expect(screen.getByText('+ quero · − não quero').tagName).toBe('P');
    expect(screen.getByRole('button', { name: 'Quero Bruxaria' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Não quero Bruxaria' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Recomendar' })).toBeTruthy();
  });

  test('com resultado: chips, Outras sugestões, tags do filme, Onde assistir, links e créditos', async () => {
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => 200 });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 80 });
    const { container, utilizador } = await abrir(true);
    expect(screen.getByRole('group', { name: 'Refinar por tema' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Outras sugestões' })).toBeTruthy();
    expect(screen.getAllByRole('list', { name: 'Tags do filme' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('group', { name: 'Onde assistir no Brasil' }).length).toBe(2);
    const primeiro = container.querySelector<HTMLElement>('#lista > li')!;
    const card = within(primeiro);
    const wikidata = card.getByRole('link', { name: 'Wikidata' });
    expect(wikidata.getAttribute('href')).toBe('https://www.wikidata.org/wiki/Q101');
    expect(wikidata.getAttribute('target')).toBe('_blank');
    expect(card.getByRole('link', { name: 'IMDb' }).getAttribute('href')).toBe('https://www.imdb.com/title/tt000001/');
    expect(card.getAllByRole('link', { name: 'Wikipédia' }).length).toBe(2);
    expect(card.getByRole('link', { name: 'CC BY-SA' }).getAttribute('href')).toContain('creativecommons.org');
    expect(card.getByRole('link', { name: 'Onde assistir: JustWatch via TMDB' })).toBeTruthy();
    expect(primeiro.querySelector('.credito')?.textContent).toBe('Sinopse: Wikipédia (CC BY-SA)');
    expect(primeiro.querySelector('.credito-imagem')?.textContent).toBe('Imagem: Wikipédia');
    const lerMais = card.getByRole('button', { name: 'Ler mais' });
    await utilizador.click(lerMais);
    expect(card.getByRole('button', { name: 'Ler menos' })).toBe(lerMais);
  });

  test('rodapé: links e textos da tabela', async () => {
    await abrir(false);
    expect(screen.getByRole('link', { name: 'Dados de filmes: Wikidata (CC0)' })).toBeTruthy();
    expect(screen.getByText('Notas da crítica: Rotten Tomatoes e Metacritic via Wikidata (CC0)')).toBeTruthy();
    expect(screen.getByText('Oscar: dados do Wikidata (CC0)')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'TMDB' })).toBeTruthy();
  });

  test('mensagem de resultado vazio com temas orienta a desfazer um "não quero"', async () => {
    const { container, utilizador } = await abrir(false, { recomendar: recomendarReal as (p: any) => any });
    await utilizador.click(screen.getByRole('button', { name: 'Não quero Bruxaria' }));
    await utilizador.click(screen.getByRole('button', { name: 'Quero Clima sombrio' }));
    await utilizador.click(screen.getByRole('button', { name: 'Recomendar' }));
    expect(container.querySelector('#aviso')?.textContent).toContain('desfazer um "não quero"');
    expect(container.textContent).not.toContain('menos disso');
  });
});

// Palavras comuns de interface em inglês que NÃO podem aparecer. Nomes próprios (Wikidata, IMDb, TMDB, Rotten Tomatoes,
// Metacritic, JustWatch, Oscar, CC0, CC BY-SA, Netflix, Filmelier) e a marca "(en)" de sinopse em inglês ficam fora da varredura.
const INGLES = [
  'the', 'and', 'for', 'with', 'from', 'your', 'loading', 'submit', 'search', 'filter', 'filters', 'clear', 'close', 'open', 'error', 'read',
  'more', 'less', 'show', 'hide', 'menu', 'home', 'next', 'previous', 'recommend', 'suggestions', 'genre', 'movie', 'movies', 'rating', 'want', 'dont',
];

function textoVisivel(raiz: HTMLElement) {
  const partes = [raiz.textContent ?? ''];
  for (const img of raiz.querySelectorAll('img')) partes.push(img.getAttribute('alt') ?? '');
  for (const no of raiz.querySelectorAll('[aria-label]')) partes.push(no.getAttribute('aria-label') ?? '');
  return partes.join(' ').toLowerCase().split(/[^\p{L}0-9]+/u).filter(Boolean);
}

describe('AC-10: nenhuma palavra em inglês fora dos nomes próprios', () => {
  for (const [nome, comResultado] of [['estado inicial', false], ['com resultado', true]] as const) {
    test(nome, async () => {
      const { container } = await abrir(comResultado);
      const palavras = new Set(textoVisivel(container));
      for (const palavra of INGLES) expect(palavras.has(palavra), palavra).toBe(false);
    });
  }
});
