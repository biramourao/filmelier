import { describe, expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../src/ui/App';
import { criarEnriquecedor } from '../../src/enriquecer.mjs';
import { criarProvedores } from '../../src/provedores.mjs';
import { URL_WORKER } from '../../src/config.mjs';
import { criarDependencias } from './fixtures';

// AC-8: as tags escolhidas nunca saem da página. O `fetch` é espionado dentro do enriquecedor e dos provedores reais.
describe('AC-8: tags fora das URLs externas', () => {
  test('2 tags incluídas e 1 excluída geram 0 URLs com id de tag', async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      urls.push(String(url));
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({}) };
    });
    const logger = { warn: vi.fn(), error: vi.fn() };
    const dependencias = criarDependencias({
      criarEnriquecedor: () => (criarEnriquecedor as (o: any) => any)({ fetchImpl, logger }),
      criarProvedores: () => (criarProvedores as (o: any) => any)({ urlWorker: URL_WORKER, fetchImpl, logger }),
      urlWorker: URL_WORKER,
      logger,
    });
    const utilizador = userEvent.setup();
    const { container } = render(<App dependencias={dependencias} />);
    await utilizador.click(await screen.findByRole('radio', { name: 'Leve e engraçado' }));
    const grupo = within(container.querySelector<HTMLElement>('#temas-controles')!);
    await utilizador.click(grupo.getByRole('button', { name: 'Quero Bruxaria' }));
    await utilizador.click(grupo.getByRole('button', { name: 'Quero Clima sombrio' }));
    await utilizador.click(grupo.getByRole('button', { name: 'Não quero Magia' }));
    await utilizador.click(screen.getByRole('button', { name: 'Recomendar' }));
    await vi.waitFor(() => expect(urls.length).toBeGreaterThan(0));
    expect(container.querySelectorAll('#lista > li').length).toBeGreaterThan(0);
    expect(urls.some((u) => u.startsWith(URL_WORKER))).toBe(true);
    for (const url of urls) {
      const texto = decodeURIComponent(url).toLowerCase();
      for (const marca of ['bruxaria', 'magia', 'sombrio', 'incluir', 'excluir']) expect(texto, url).not.toContain(marca);
    }
  });

  test('a página não escreve tag em location, histórico nem armazenamento', async () => {
    const antes = window.location.href;
    const dependencias = criarDependencias();
    const utilizador = userEvent.setup();
    render(<App dependencias={dependencias} />);
    await utilizador.click(await screen.findByRole('button', { name: 'Quero Bruxaria' }));
    expect(window.location.href).toBe(antes);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
  });
});
