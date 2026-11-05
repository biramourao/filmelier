import { describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { App } from '../../src/ui/App';
import { LimiteDeErro, TEXTO_ERRO } from '../../src/ui/LimiteDeErro';
import { criarDados, criarDependencias } from './fixtures';

const TEXTO_EXATO = 'Não foi possível carregar a lista de filmes. Recarregue a página.';

async function esperarEstadoDeErro(container: HTMLElement) {
  const alerta = await screen.findByRole('alert');
  expect(alerta.textContent).toBe(TEXTO_EXATO);
  expect(container.querySelectorAll('input[type="radio"]').length).toBe(0);
  const opcoes = [...container.querySelectorAll<HTMLOptionElement>('#genero option')].map((o) => o.textContent);
  expect(opcoes).toEqual(['Qualquer gênero']);
  expect((screen.getByRole('button', { name: 'Recomendar' }) as HTMLButtonElement).disabled).toBe(true);
  expect(container.querySelector('#grupo-temas')).toBeNull();
  expect(container.querySelector('#data-geracao')?.textContent).toBe('');
}

describe('AC-9: estado de erro da carga', () => {
  test('carregarDados com erro (rede rejeitada ou JSON inválido) mostra o alerta e o estado vazio', async () => {
    const dependencias = criarDependencias({ carregarDados: vi.fn(async () => ({ humores: null, filmes: null, erro: 'rede' })) });
    const { container } = render(<App dependencias={dependencias} />);
    await esperarEstadoDeErro(container);
    expect(dependencias.logger.error).not.toHaveBeenCalled();
  });

  test('dados de forma inválida (humores sem generos) levam ao estado de erro com 1 console.error [filmelier]', async () => {
    const invalido = criarDados({ humores: { humores: [{ id: 'x', rotulo: 'X', emoji: '', generos: null }] } });
    const dependencias = criarDependencias({ carregarDados: vi.fn(async () => invalido) });
    const { container } = render(<App dependencias={dependencias} />);
    await esperarEstadoDeErro(container);
    expect(dependencias.logger.error).toHaveBeenCalledTimes(1);
    expect(String((dependencias.logger.error as any).mock.calls[0][0])).toMatch(/^\[filmelier\]/);
  });

  test('derivação que lança (meta.geradoEm inexistente) cai no erro com 1 console.error [filmelier]', async () => {
    const dados = criarDados({ filmes: { meta: undefined, filmes: [] } });
    const dependencias = criarDependencias({ carregarDados: vi.fn(async () => dados) });
    const { container } = render(<App dependencias={dependencias} />);
    await esperarEstadoDeErro(container);
    expect(dependencias.logger.error).toHaveBeenCalledTimes(1);
    expect(String((dependencias.logger.error as any).mock.calls[0][0])).toMatch(/^\[filmelier\]/);
  });

  test('carregarDados que rejeita (violação do contrato) também cai no erro, com 1 log', async () => {
    const dependencias = criarDependencias({ carregarDados: vi.fn(async () => { throw new Error('quebrou'); }) });
    const { container } = render(<App dependencias={dependencias} />);
    await esperarEstadoDeErro(container);
    expect(dependencias.logger.error).toHaveBeenCalledTimes(1);
  });

  test('carga com sucesso não mostra o alerta e preenche a data', async () => {
    const dependencias = criarDependencias();
    const { container } = render(<App dependencias={dependencias} />);
    await waitFor(() => expect(container.querySelector('#data-geracao')?.textContent).toBe('04/11/2026'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(dependencias.logger.error).not.toHaveBeenCalled();
  });
});

describe('AC-9: LimiteDeErro', () => {
  function Quebrado(): never {
    throw new Error('falha de renderização');
  }

  test('componente que lança na renderização: alerta com role="alert" e 1 console.error [filmelier] no logger injetado', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = { error: vi.fn(), warn: vi.fn() };
    render(<LimiteDeErro logger={logger}><Quebrado /></LimiteDeErro>);
    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toBe(TEXTO_EXATO);
    expect(alerta.id).toBe('erro');
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(String(logger.error.mock.calls[0][0])).toMatch(/^\[filmelier\] .*falha de renderização/);
  });

  test('sem falha, os filhos aparecem e nada é logado', () => {
    const logger = { error: vi.fn(), warn: vi.fn() };
    render(<LimiteDeErro logger={logger}><p>conteúdo</p></LimiteDeErro>);
    expect(screen.getByText('conteúdo')).toBeTruthy();
    expect(logger.error).not.toHaveBeenCalled();
  });
});
