import { describe, expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../src/ui/App';
import { criarEnriquecedor } from '../../src/enriquecer.mjs';
import { criarProvedores } from '../../src/provedores.mjs';
import { URL_WORKER } from '../../src/config.mjs';
import { criarDependencias } from './fixtures';

// AC-20: na aba Séries as tags e os filtros não saem da página e a URL do Worker só tem 4 parâmetros.
describe('AC-20: privacidade na aba Séries', () => {
  test('URLs sem tags e com só 4 parâmetros', async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      urls.push(String(url));
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({}) };
    });
    const logger = { warn: vi.fn(), error: vi.fn() };
    const dependencias = criarDependencias({
      criarEnriquecedor: () => (criarEnriquecedor as (o: any) => any)({ fetchImpl, logger }),
      criarProvedores: (tipo?: 'filme' | 'serie') => (criarProvedores as (o: any) => any)({ urlWorker: URL_WORKER, fetchImpl, logger, tipo }),
      urlWorker: URL_WORKER,
      logger: logger as any,
    });
    const utilizador = userEvent.setup();
    const { container } = render(<App dependencias={dependencias} />);
    await screen.findByRole('radio', { name: 'Leve e engraçado' });
    await utilizador.click(screen.getByRole('tab', { name: 'Séries' }));
    await utilizador.click(await screen.findByRole('radio', { name: 'Leve e engraçado' }));
    const grupo = within(container.querySelector<HTMLElement>('#series-temas-controles')!);
    await utilizador.click(grupo.getByRole('button', { name: 'Quero Bruxaria' }));
    await utilizador.click(grupo.getByRole('button', { name: 'Quero Clima sombrio' }));
    await utilizador.click(grupo.getByRole('button', { name: 'Não quero Magia' }));
    await utilizador.click(screen.getByRole('button', { name: 'Recomendar' }));
    await vi.waitFor(() => expect(urls.some((u) => u.startsWith(URL_WORKER))).toBe(true));
    expect(container.querySelectorAll('#series-lista > li').length).toBeGreaterThan(0);
    for (const url of urls) {
      const texto = decodeURIComponent(url).toLowerCase();
      for (const marca of ['bruxaria', 'magia', 'sombrio', 'incluir', 'excluir']) expect(texto, url).not.toContain(marca);
    }
    const doWorker = urls.filter((u) => u.startsWith(URL_WORKER));
    expect(doWorker.length).toBeGreaterThan(0);
    for (const url of doWorker) {
      const params = new URL(url).searchParams;
      const chaves = [...params.keys()];
      expect(chaves.every((c) => ['qids', 'imdb', 'tipo', 'tmdb'].includes(c)), url).toBe(true);
      expect(params.get('tipo')).toBe('serie');
      expect(params.get('tmdb')!.split(',').length).toBe(params.get('qids')!.split(',').length);
    }
  });

  test('Aba fora da URL', async () => {
    const antes = window.location.href;
    const historico = window.history.length;
    const utilizador = userEvent.setup();
    render(<App dependencias={criarDependencias()} />);
    await screen.findByRole('radio', { name: 'Leve e engraçado' });
    await utilizador.click(screen.getByRole('tab', { name: 'Séries' }));
    await screen.findByRole('radio', { name: 'Quero sentir medo' });
    await utilizador.click(screen.getByRole('tab', { name: 'Filmes' }));
    expect(window.location.href).toBe(antes);
    expect(window.history.length).toBe(historico);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});
