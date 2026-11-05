import { afterEach, describe, expect, test, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../src/ui/App';
import { criarDadosSeries, criarDependencias, criarFilmes } from './fixtures';
import { adiado, ENRIQ, simularMedidas } from './medidas';

afterEach(() => {
  delete (HTMLElement.prototype as any).scrollHeight;
  delete (HTMLElement.prototype as any).clientHeight;
});

async function abrir(sobrescrever = {}) {
  const dependencias = criarDependencias(sobrescrever);
  const utilizador = userEvent.setup();
  const tela = render(<App dependencias={dependencias} />);
  await screen.findByRole('radio', { name: 'Leve e engraçado' });
  return { dependencias, utilizador, ...tela };
}
const aba = (nome: string) => screen.getByRole('tab', { name: nome });
async function irParaSeries(utilizador: ReturnType<typeof userEvent.setup>) {
  await utilizador.click(aba('Séries'));
  await screen.findByRole('radio', { name: 'Quero sentir medo' });
}

describe('AC-1: abas', () => {
  test('Estrutura inicial das abas', async () => {
    await abrir();
    const lista = screen.getByRole('tablist', { name: 'Tipo de recomendação' });
    const tabs = within(lista).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Filmes', 'Séries']);
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false']);
    expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1']);
    for (const t of tabs) {
      const painel = document.getElementById(t.getAttribute('aria-controls')!)!;
      expect(painel.getAttribute('role')).toBe('tabpanel');
      expect(painel.getAttribute('aria-labelledby')).toBe(t.id);
    }
    const series = document.getElementById('painel-series')!;
    expect(series.hasAttribute('hidden')).toBe(true);
    expect(series.children.length).toBe(0);
    expect(document.getElementById('painel-filmes')!.hasAttribute('hidden')).toBe(false);
  });

  test('Wrapper de Séries vazio na carga', async () => {
    await abrir();
    const painel = document.getElementById('painel-series')!;
    expect(painel.getAttribute('role')).toBe('tabpanel');
    expect(painel.hasAttribute('hidden')).toBe(true);
    expect(painel.children.length).toBe(0);
    expect(screen.getAllByRole('button', { name: 'Recomendar', hidden: true }).length).toBe(1);
    expect(screen.getAllByRole('button', { name: 'Recomendar' }).length).toBe(1);
  });

  test('Setas, Home e End', async () => {
    const { utilizador } = await abrir();
    aba('Filmes').focus();
    const passos: [string, string][] = [['{ArrowRight}', 'Séries'], ['{ArrowRight}', 'Filmes'], ['{ArrowLeft}', 'Séries'], ['{End}', 'Séries'], ['{Home}', 'Filmes']];
    for (const [tecla, esperado] of passos) {
      await utilizador.keyboard(tecla);
      const ativa = aba(esperado);
      expect(document.activeElement).toBe(ativa);
      expect(ativa.getAttribute('aria-selected')).toBe('true');
      expect(ativa.getAttribute('tabindex')).toBe('0');
    }
  });

  test('Clique ativa a aba', async () => {
    const { utilizador } = await abrir();
    await utilizador.click(aba('Séries'));
    expect(aba('Séries').getAttribute('aria-selected')).toBe('true');
    expect(document.getElementById('painel-series')!.hasAttribute('hidden')).toBe(false);
    expect(document.getElementById('painel-filmes')!.hasAttribute('hidden')).toBe(true);
    await utilizador.click(aba('Filmes'));
    expect(aba('Filmes').getAttribute('aria-selected')).toBe('true');
    expect(document.getElementById('painel-filmes')!.hasAttribute('hidden')).toBe(false);
    expect(document.getElementById('painel-series')!.hasAttribute('hidden')).toBe(true);
  });

  test('Tab leva ao 1º humor do painel ativo', async () => {
    const { utilizador } = await abrir();
    aba('Filmes').focus();
    await utilizador.tab();
    expect(document.activeElement).toBe(screen.getAllByRole('radio')[0]);
    expect((document.activeElement as HTMLInputElement).name).toBe('humor');
    await irParaSeries(utilizador);
    aba('Séries').focus();
    await utilizador.tab();
    expect(document.activeElement).toBe(screen.getAllByRole('radio')[0]);
    expect((document.activeElement as HTMLInputElement).name).toBe('series-humor');
  });

  test('Conteúdo de Séries mantido depois da 1ª ativação', async () => {
    const { utilizador } = await abrir();
    await irParaSeries(utilizador);
    await utilizador.click(aba('Filmes'));
    const painel = document.getElementById('painel-series')!;
    expect(painel.hasAttribute('hidden')).toBe(true);
    expect(painel.querySelectorAll('input[name="series-humor"]').length).toBe(7);
  });
});

describe('AC-2: texto de abertura', () => {
  test('Parágrafo e título por aba', async () => {
    const { utilizador } = await abrir();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Filmelier');
    expect(screen.getByText('Diga como você está hoje e receba sugestões de filmes.')).toBeTruthy();
    await irParaSeries(utilizador);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Filmelier');
    expect(screen.getByText('Diga como você está hoje e receba sugestões de séries.')).toBeTruthy();
    expect(screen.queryByText('Diga como você está hoje e receba sugestões de filmes.')).toBeNull();
  });
});

describe('AC-2 e AC-10: "Ler mais" com a aba oculta', () => {
  test('Enriquecimento de Filmes com a aba oculta', async () => {
    simularMedidas();
    const filmes = criarFilmes().slice(0, 2);
    const e = adiado<Map<string, any>>();
    const { utilizador } = await abrir({
      recomendar: vi.fn(() => ({ nivel: 'humor', filmes, aviso: '', mensagem: '', candidatos: filmes })),
      criarEnriquecedor: () => ({ enriquecer: vi.fn(() => e.promessa) }),
    });
    await utilizador.click(screen.getByRole('radio', { name: 'Leve e engraçado' }));
    await utilizador.click(screen.getByRole('button', { name: 'Recomendar' }));
    await irParaSeries(utilizador);
    await act(async () => { e.resolver(new Map(filmes.map((f) => [f.qid, ENRIQ(f.qid)]))); await e.promessa; });
    await utilizador.click(aba('Filmes'));
    const botoes = screen.getAllByRole('button', { name: 'Ler mais' });
    expect(botoes.length).toBe(2);
    for (const b of botoes) expect(b.hasAttribute('hidden')).toBe(false);
  });

  test('Sem troca de aba Filmes mede como hoje', async () => {
    simularMedidas();
    const filmes = criarFilmes().slice(0, 2);
    const { utilizador } = await abrir({
      recomendar: vi.fn(() => ({ nivel: 'humor', filmes, aviso: '', mensagem: '', candidatos: filmes })),
      criarEnriquecedor: () => ({ enriquecer: async () => new Map(filmes.map((f) => [f.qid, ENRIQ(f.qid)])) }),
    });
    await utilizador.click(screen.getByRole('radio', { name: 'Leve e engraçado' }));
    await utilizador.click(screen.getByRole('button', { name: 'Recomendar' }));
    const botoes = await screen.findAllByRole('button', { name: 'Ler mais' });
    expect(botoes.length).toBe(2);
  });
});

describe('AC-16: rodapé por aba', () => {
  test('Data da aba ativa', async () => {
    let liberar!: (v: unknown) => void;
    const { utilizador } = await abrir({ carregarSeries: vi.fn(() => new Promise((r) => { liberar = r; })) });
    const data = () => document.getElementById('data-geracao')!.textContent;
    expect(data()).toBe('04/11/2026');
    await utilizador.click(aba('Séries'));
    expect(data()).toBe('');
    await act(async () => { liberar(criarDadosSeries()); });
    await screen.findByRole('radio', { name: 'Quero sentir medo' });
    expect(data()).toBe('12/11/2026');
    await utilizador.click(aba('Filmes'));
    expect(data()).toBe('04/11/2026');
    expect(document.querySelectorAll('#data-geracao').length).toBe(1);
  });

  test('Texto do link e demais linhas', async () => {
    await abrir();
    const rodape = document.querySelector('footer')!;
    const link = within(rodape).getByRole('link', { name: 'Dados de filmes e séries: Wikidata (CC0)' });
    expect(link.getAttribute('href')).toBe('https://www.wikidata.org/');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    const textos = [...rodape.querySelectorAll('p')].map((p) => p.textContent);
    expect(textos).toContain('Notas da crítica: Rotten Tomatoes e Metacritic via Wikidata (CC0)');
    expect(textos).toContain('Oscar: dados do Wikidata (CC0)');
    expect(textos).toContain('Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.');
    const logo = rodape.querySelector('.logo-tmdb a img')!;
    expect(logo.getAttribute('src')).toBe('assets/tmdb-logo.svg');
    expect(logo.getAttribute('alt')).toBe('TMDB');
  });
});
