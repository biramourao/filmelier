import { describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../src/ui/App';
import { carregarDados, carregarSeries } from '../../src/dados.mjs';
import { criarDados, criarDadosSeries, criarDependencias, criarLogger } from './fixtures';

const TEXTO_ERRO_SERIES = 'Não foi possível carregar a lista de séries. Recarregue a página.';
const ok = (corpo: unknown) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => corpo });
const dadosPorUrl = (url: string): unknown => {
  if (url === 'data/humores.json') return criarDados().humores;
  if (url === 'data/filmes.json') return criarDados().filmes;
  if (url === 'data/humores-series.json') return criarDadosSeries().humores;
  if (url === 'data/series.json') return criarDadosSeries().series;
  throw new Error(`url inesperada ${url}`);
};

// App com carregarDados e carregarSeries reais sobre um `fetch` falso (que registra os pedidos).
function abrirComFetch(falha: Partial<Record<string, () => unknown>> = {}, extras = {}) {
  const pedidos: string[] = [];
  const fetchImpl = async (url: string) => {
    pedidos.push(url);
    if (falha[url]) return falha[url]!();
    return ok(dadosPorUrl(url));
  };
  const logger = criarLogger();
  const dependencias = criarDependencias({
    logger,
    carregarDados: () => carregarDados(fetchImpl, logger as unknown as Console),
    carregarSeries: () => carregarSeries(fetchImpl, logger as unknown as Console),
    ...extras,
  });
  const utilizador = userEvent.setup();
  const tela = render(<App dependencias={dependencias} />);
  return { pedidos, logger, dependencias, utilizador, ...tela };
}
const aba = (nome: string) => screen.getByRole('tab', { name: nome });
const painelSeries = () => document.getElementById('painel-series')!;

describe('AC-3: carga sob demanda', () => {
  test('Carga da página só com filmes', async () => {
    const { pedidos } = abrirComFetch();
    await screen.findByRole('radio', { name: 'Leve e engraçado' });
    expect([...pedidos].sort()).toEqual(['data/filmes.json', 'data/humores.json']);
  });

  test('Três ativações, 1 pedido de cada arquivo', async () => {
    const { pedidos, utilizador } = abrirComFetch();
    await screen.findByRole('radio', { name: 'Leve e engraçado' });
    for (let i = 0; i < 3; i += 1) {
      await utilizador.click(aba('Séries'));
      await within(painelSeries()).findByRole('radio', { name: 'Quero sentir medo' });
      await utilizador.click(aba('Filmes'));
    }
    expect(pedidos.filter((p) => p === 'data/series.json').length).toBe(1);
    expect(pedidos.filter((p) => p === 'data/humores-series.json').length).toBe(1);
  });

  test('Estado de carregamento', async () => {
    let liberar!: (v: unknown) => void;
    const pendente = new Promise((r) => { liberar = r; });
    const { utilizador } = abrirComFetch({}, { carregarSeries: vi.fn(() => pendente) });
    await screen.findByRole('radio', { name: 'Leve e engraçado' });
    await utilizador.click(aba('Séries'));
    expect(within(painelSeries()).getByText('Carregando séries…')).toBeTruthy();
    expect((within(painelSeries()).getByRole('button', { name: 'Recomendar' }) as HTMLButtonElement).disabled).toBe(true);
    liberar(criarDadosSeries());
    await within(painelSeries()).findByRole('radio', { name: 'Quero sentir medo' });
    expect(within(painelSeries()).queryByText('Carregando séries…')).toBeNull();
  });
});

async function esperarErroDeSeries(logger: ReturnType<typeof criarLogger>) {
  const alerta = await within(painelSeries()).findByRole('alert');
  expect(alerta.textContent).toBe(TEXTO_ERRO_SERIES);
  expect((within(painelSeries()).getByRole('button', { name: 'Recomendar' }) as HTMLButtonElement).disabled).toBe(true);
  expect(painelSeries().querySelectorAll('input[type="radio"]').length).toBe(0);
  expect(painelSeries().querySelector('#series-grupo-temas')).toBeNull();
  expect(logger.error).toHaveBeenCalledTimes(1);
  expect(String((logger.error as any).mock.calls[0][0])).toMatch(/^\[filmelier\]/);
}

describe('AC-3: falhas de carga das séries', () => {
  const falhasSeries: [string, () => unknown][] = [
    ['rejeição', () => { throw new Error('rede'); }],
    ['HTTP 500', () => ({ ok: false, status: 500, headers: { get: () => null }, json: async () => ({}) })],
    ['JSON inválido', () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => { throw new SyntaxError('x'); } })],
    ['sem a lista series', () => ok({ meta: { geradoEm: '2026-11-12T09:00:00.000Z' } })],
  ];
  for (const [nome, falha] of falhasSeries) {
    test(`Quatro falhas de series.json: ${nome}`, async () => {
      const { logger, utilizador } = abrirComFetch({ 'data/series.json': falha });
      await screen.findByRole('radio', { name: 'Leve e engraçado' });
      await utilizador.click(aba('Séries'));
      await esperarErroDeSeries(logger);
    });
  }

  const falhasHumores: [string, () => unknown][] = [
    ['rejeição', () => { throw new Error('rede'); }],
    ['sem a lista humores', () => ok({ outro: [] })],
  ];
  for (const [nome, falha] of falhasHumores) {
    test(`Duas falhas de humores-series.json: ${nome}`, async () => {
      const { logger, utilizador } = abrirComFetch({ 'data/humores-series.json': falha });
      await screen.findByRole('radio', { name: 'Leve e engraçado' });
      await utilizador.click(aba('Séries'));
      await esperarErroDeSeries(logger);
    });
  }

  test('Filmes funciona com séries em erro', async () => {
    const { logger, utilizador } = abrirComFetch({ 'data/series.json': () => { throw new Error('rede'); } });
    await screen.findByRole('radio', { name: 'Leve e engraçado' });
    await utilizador.click(aba('Séries'));
    await esperarErroDeSeries(logger);
    await utilizador.click(aba('Filmes'));
    await utilizador.click(screen.getByRole('radio', { name: 'Leve e engraçado' }));
    await utilizador.click(screen.getByRole('button', { name: 'Recomendar' }));
    await waitFor(() => expect(document.querySelectorAll('#lista > li').length).toBeGreaterThan(0));
  });
});

describe('AC-3 e AC-19: marcas de desempenho', () => {
  test('Marcas na 1ª ativação de Séries', async () => {
    const performance = { mark: vi.fn(), measure: vi.fn() };
    const { utilizador } = abrirComFetch({}, { performance: performance as unknown as Performance });
    await screen.findByRole('radio', { name: 'Leve e engraçado' });
    expect(performance.mark.mock.calls.map((c) => c[0]).filter((n: string) => n.startsWith('filmelier:series'))).toEqual([]);
    for (let i = 0; i < 2; i += 1) {
      await utilizador.click(aba('Séries'));
      await within(painelSeries()).findByRole('radio', { name: 'Quero sentir medo' });
      await utilizador.click(aba('Filmes'));
    }
    const marcas = performance.mark.mock.calls.map((c) => c[0] as string);
    expect(marcas.filter((n) => n === 'filmelier:series-inicio').length).toBe(1);
    expect(marcas.filter((n) => n === 'filmelier:series-carregadas').length).toBe(1);
    expect(marcas.indexOf('filmelier:series-inicio')).toBeLessThan(marcas.indexOf('filmelier:series-carregadas'));
    const medidas = performance.measure.mock.calls.filter((c) => c[0] === 'filmelier:series');
    expect(medidas.length).toBe(1);
    expect(medidas[0]).toEqual(['filmelier:series', 'filmelier:series-inicio', 'filmelier:series-carregadas']);
  });

  test('Fluxo de filmes com os mesmos 9 nomes', async () => {
    const performance = { mark: vi.fn(), measure: vi.fn() };
    const { utilizador } = abrirComFetch({}, {
      performance: performance as unknown as Performance,
      criarEnriquecedor: () => ({ enriquecer: async () => new Map() }),
      criarProvedores: () => ({ ativo: true, buscar: async () => new Map() }),
    });
    await utilizador.click(await screen.findByRole('radio', { name: 'Leve e engraçado' }));
    await utilizador.click(screen.getByRole('button', { name: 'Recomendar' }));
    await waitFor(() => expect(performance.measure).toHaveBeenCalledTimes(3));
    const nomes = new Set([...performance.mark.mock.calls, ...performance.measure.mock.calls].map((c) => c[0] as string));
    expect(nomes).toEqual(new Set([
      'filmelier:dados-carregados', 'filmelier:recomendar-inicio', 'filmelier:lista-renderizada', 'filmelier:provedores-inicio',
      'filmelier:enriquecimento-fim', 'filmelier:provedores-fim', 'filmelier:recomendar', 'filmelier:enriquecimento', 'filmelier:provedores',
    ]));
    expect([...nomes].some((n) => n.startsWith('filmelier:series'))).toBe(false);
  });
});
