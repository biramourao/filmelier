import { describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../src/ui/App';
import { carregarDados } from '../../src/dados.mjs';
import { criarEnriquecedor } from '../../src/enriquecer.mjs';
import { criarProvedores } from '../../src/provedores.mjs';
import { URL_WORKER } from '../../src/config.mjs';
import { criarDados, criarDependencias, criarLogger } from './fixtures';

// AC-16: as 9 marcas de desempenho (6 marks e 3 measures) e 1 linha de log por falha de carga, enriquecimento e provedores.
const MARCAS = [
  'filmelier:dados-carregados', 'filmelier:recomendar-inicio', 'filmelier:lista-renderizada',
  'filmelier:provedores-inicio', 'filmelier:enriquecimento-fim', 'filmelier:provedores-fim',
];
const MEDIDAS = ['filmelier:recomendar', 'filmelier:enriquecimento', 'filmelier:provedores'];

const resposta500 = async () => ({ ok: false, status: 500, headers: { get: () => null }, json: async () => ({}) });

async function recomendarLeve(utilizador: ReturnType<typeof userEvent.setup>) {
  await utilizador.click(await screen.findByRole('radio', { name: 'Leve e engraçado' }));
  await utilizador.click(screen.getByRole('button', { name: 'Recomendar' }));
}

describe('AC-16: marcas de desempenho', () => {
  test('um fluxo completo emite os 9 nomes, na ordem dos eventos', async () => {
    const performance = { mark: vi.fn(), measure: vi.fn() };
    const dependencias = criarDependencias({
      performance: performance as unknown as Performance,
      criarEnriquecedor: () => ({ enriquecer: async () => new Map() }),
      criarProvedores: () => ({ ativo: true, buscar: async () => new Map() }),
    });
    const utilizador = userEvent.setup();
    render(<App dependencias={dependencias} />);
    await recomendarLeve(utilizador);
    await waitFor(() => expect(performance.measure).toHaveBeenCalledTimes(3));
    const marcas = performance.mark.mock.calls.map((c) => c[0]);
    const medidas = performance.measure.mock.calls.map((c) => c[0]);
    expect(new Set(marcas)).toEqual(new Set(MARCAS));
    expect(new Set(medidas)).toEqual(new Set(MEDIDAS));
    expect(marcas.length).toBe(MARCAS.length);
    expect(marcas[0]).toBe('filmelier:dados-carregados');
    expect(marcas.indexOf('filmelier:recomendar-inicio')).toBeLessThan(marcas.indexOf('filmelier:provedores-inicio'));
    expect(marcas.indexOf('filmelier:provedores-inicio')).toBeLessThan(marcas.indexOf('filmelier:provedores-fim'));
    expect(performance.measure).toHaveBeenCalledWith('filmelier:recomendar', 'filmelier:recomendar-inicio', 'filmelier:lista-renderizada');
    expect(performance.measure).toHaveBeenCalledWith('filmelier:enriquecimento', 'filmelier:recomendar-inicio', 'filmelier:enriquecimento-fim');
    expect(performance.measure).toHaveBeenCalledWith('filmelier:provedores', 'filmelier:provedores-inicio', 'filmelier:provedores-fim');
  });

  test('com o Worker desligado não há marca de provedores', async () => {
    const performance = { mark: vi.fn(), measure: vi.fn() };
    const dependencias = criarDependencias({ performance: performance as unknown as Performance });
    const utilizador = userEvent.setup();
    render(<App dependencias={dependencias} />);
    await recomendarLeve(utilizador);
    await waitFor(() => expect(performance.measure).toHaveBeenCalledTimes(2));
    const marcas = performance.mark.mock.calls.map((c) => c[0]);
    expect(marcas).not.toContain('filmelier:provedores-inicio');
    expect(marcas).not.toContain('filmelier:provedores-fim');
  });

  test('o agendamento do quadro usa a dependência (a medida do recomendar vem depois do commit)', async () => {
    const agendarQuadro = vi.fn();
    const performance = { mark: vi.fn(), measure: vi.fn() };
    const dependencias = criarDependencias({ agendarQuadro, performance: performance as unknown as Performance });
    const utilizador = userEvent.setup();
    render(<App dependencias={dependencias} />);
    await recomendarLeve(utilizador);
    const medidasAntes = performance.measure.mock.calls.map((c) => c[0]);
    expect(medidasAntes).not.toContain('filmelier:recomendar');
    agendarQuadro.mock.calls[0][0]();
    expect(performance.measure.mock.calls.map((c) => c[0])).toContain('filmelier:recomendar');
  });
});

describe('AC-16: 1 linha de log por falha', () => {
  test('falha de carga: 1 console.error [filmelier] e nenhum outro', async () => {
    const logger = criarLogger();
    const dependencias = criarDependencias({
      logger,
      carregarDados: () => carregarDados(async () => { throw new Error('rede'); }, logger as unknown as Console),
    });
    render(<App dependencias={dependencias} />);
    await screen.findByRole('alert');
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(String(logger.error.mock.calls[0][0])).toMatch(/^\[filmelier\] falha ao carregar dados: /);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test('falha do enriquecimento: 1 console.warn [filmelier] e a lista continua', async () => {
    const logger = criarLogger();
    const fetchImpl = vi.fn(resposta500);
    const dependencias = criarDependencias({
      logger,
      carregarDados: async () => criarDados(),
      criarEnriquecedor: () => (criarEnriquecedor as (o: any) => any)({ fetchImpl, logger }),
    });
    const utilizador = userEvent.setup();
    const { container } = render(<App dependencias={dependencias} />);
    await recomendarLeve(utilizador);
    await waitFor(() => expect(logger.warn).toHaveBeenCalledTimes(1));
    expect(String(logger.warn.mock.calls[0][0])).toMatch(/^\[filmelier\] enriquecimento falhou/);
    expect(logger.error).not.toHaveBeenCalled();
    await waitFor(() => expect(container.querySelector('.sinopse-indisponivel')).toBeTruthy());
    expect(container.querySelectorAll('#lista > li').length).toBe(5);
  });

  test('falha dos provedores: 1 console.warn [filmelier] e o card mostra o texto de sem dados', async () => {
    const logger = criarLogger();
    const fetchImpl = vi.fn(resposta500);
    const dependencias = criarDependencias({
      logger,
      urlWorker: URL_WORKER,
      criarProvedores: () => (criarProvedores as (o: any) => any)({ urlWorker: URL_WORKER, fetchImpl, logger }),
    });
    const utilizador = userEvent.setup();
    const { container } = render(<App dependencias={dependencias} />);
    await recomendarLeve(utilizador);
    await waitFor(() => expect(logger.warn).toHaveBeenCalledTimes(1));
    expect(String(logger.warn.mock.calls[0][0])).toMatch(/^\[filmelier\] provedores falhou/);
    await waitFor(() => expect(container.querySelector('.estado-provedores')?.textContent).toBe('Sem dados de onde assistir no Brasil'));
    expect((fetchImpl.mock.calls as unknown[][]).every((c) => String(c[0]).startsWith(URL_WORKER))).toBe(true);
  });
});
