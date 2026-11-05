import { afterEach, describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../src/ui/App';
import { criarDependencias, criarFilmes } from './fixtures';

const comedias = criarFilmes().slice(0, 2);
const recomendarFixo = () => ({ nivel: 'humor', filmes: comedias, aviso: '', mensagem: '', candidatos: comedias });

function adiado<T>() {
  let resolver!: (v: T) => void;
  const promessa = new Promise<T>((r) => { resolver = r; });
  return { promessa, resolver };
}

const ENRIQ = (n: number) => ({
  idioma: 'pt', sinopse: `Sinopse do filme ${n}.`, capaUrl: `https://upload.wikimedia.org/capa${n}.jpg`, artigoUrl: `https://pt.wikipedia.org/wiki/F${n}`,
});

async function abrir({ enriquecimento, provedores }: { enriquecimento?: Promise<Map<string, any>>; provedores?: Promise<Map<string, any>> | (() => Promise<Map<string, any>>) | null } = {}) {
  const enriquecedor = { enriquecer: vi.fn(() => enriquecimento ?? Promise.resolve(new Map())) };
  const buscar = vi.fn(() => (typeof provedores === 'function' ? provedores() : provedores) ?? Promise.resolve(new Map()));
  const dependencias = criarDependencias({
    recomendar: vi.fn(recomendarFixo),
    criarEnriquecedor: () => enriquecedor,
    criarProvedores: () => ({ ativo: provedores !== null && provedores !== undefined, buscar }),
  });
  const utilizador = userEvent.setup();
  const tela = render(<App dependencias={dependencias} />);
  await utilizador.click(await screen.findByRole('radio', { name: 'Leve e engraçado' }));
  await utilizador.click(screen.getByRole('button', { name: 'Recomendar' }));
  return { dependencias, utilizador, enriquecedor, buscar, ...tela };
}

const cards = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('#lista > li')];

const definirMedidas = (scroll: number, client: number) => {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => scroll });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => client });
};

afterEach(() => {
  delete (HTMLElement.prototype as any).scrollHeight;
  delete (HTMLElement.prototype as any).clientHeight;
});

describe('AC-6: atualização no lugar', () => {
  test('a lista nasce com reservas e o enriquecimento preenche o mesmo li, sem tirar o foco do link', async () => {
    const e = adiado<Map<string, any>>();
    const { container } = await abrir({ enriquecimento: e.promessa });
    const [li1] = cards(container);
    const link = li1.querySelector<HTMLAnchorElement>('.links a')!;
    expect(li1.querySelector('.sinopse-bloco')?.classList.contains('reservado')).toBe(true);
    expect(li1.querySelector('.capa')?.classList.contains('placeholder')).toBe(true);
    link.focus();
    expect(document.activeElement).toBe(link);
    await act(async () => { e.resolver(new Map([['Q101', ENRIQ(1)], ['Q102', ENRIQ(2)]])); await e.promessa; });
    expect(cards(container)[0]).toBe(li1);
    expect(li1.querySelector('.links a')).toBe(link);
    expect(document.activeElement).toBe(link);
    expect(li1.querySelector('.sinopse-bloco')?.classList.contains('reservado')).toBe(false);
    expect(li1.querySelector('.sinopse')?.textContent).toBe('Sinopse do filme 1.');
    expect(li1.querySelector('img')?.getAttribute('src')).toBe('https://upload.wikimedia.org/capa1.jpg');
    expect(li1.querySelector('.credito')?.textContent).toBe('Sinopse: Wikipédia (CC BY-SA)');
    expect(li1.querySelector('.credito-imagem')?.textContent).toBe('Imagem: Wikipédia');
    expect(li1.querySelector('.credito-imagem')?.classList.contains('reservado')).toBe(false);
  });

  test('sem sinopse mostra "Sinopse indisponível." no mesmo bloco e mantém o crédito da imagem reservado', async () => {
    const { container } = await abrir({ enriquecimento: Promise.resolve(new Map([['Q101', null], ['Q102', null]])) });
    const [li1] = cards(container);
    await waitFor(() => expect(li1.querySelector('.sinopse-indisponivel')?.textContent).toBe('Sinopse indisponível.'));
    expect(li1.querySelector('.sinopse-bloco')?.classList.contains('reservado')).toBe(false);
    expect(li1.querySelector('.sinopse-bloco')?.hasAttribute('aria-hidden')).toBe(false);
    expect(li1.querySelector('.capa')?.classList.contains('placeholder')).toBe(true);
    expect(li1.querySelector('.credito-imagem')?.classList.contains('reservado')).toBe(true);
  });

  test('erro da imagem depois do enriquecimento troca a capa pelo placeholder', async () => {
    const { container } = await abrir({ enriquecimento: Promise.resolve(new Map([['Q101', ENRIQ(1)], ['Q102', ENRIQ(2)]])) });
    const [li1] = cards(container);
    await waitFor(() => expect(li1.querySelector('img')).toBeTruthy());
    fireEvent.error(li1.querySelector('img')!);
    expect(li1.querySelector('.capa')?.classList.contains('placeholder')).toBe(true);
    expect(li1.querySelector('.credito-imagem')?.classList.contains('reservado')).toBe(true);
    expect(li1.querySelector('.sinopse')?.textContent).toBe('Sinopse do filme 1.');
  });

  test('enriquecimento de uma geração antiga é descartado depois de mudar o formulário', async () => {
    const e = adiado<Map<string, any>>();
    const { container, utilizador } = await abrir({ enriquecimento: e.promessa });
    await utilizador.click(screen.getByRole('radio', { name: 'Tenso, quero adrenalina' }));
    await act(async () => { e.resolver(new Map([['Q101', ENRIQ(1)]])); await e.promessa; });
    expect(cards(container).length).toBe(0);
  });
});

describe('AC-6: provedores e título pt-BR', () => {
  const entrada = (titulo: string) => ({
    status: 'ok', titulo, tituloOriginal: 'Comédia 1', link: 'https://www.themoviedb.org/movie/1/watch',
    flatrate: [{ provider_id: 1, provider_name: 'Netflix', logo_path: '/n.jpg', display_priority: 1 }],
  });

  test('os provedores chegam no mesmo li: título pt-BR no h2, título original e foco preservados', async () => {
    const p = adiado<Map<string, any>>();
    const { container } = await abrir({ provedores: p.promessa });
    const [li1] = cards(container);
    expect(li1.querySelector('.estado-provedores')?.textContent).toBe('Buscando onde assistir no Brasil');
    expect(li1.querySelector('.titulo-original')?.getAttribute('aria-hidden')).toBe('true');
    const link = li1.querySelector<HTMLAnchorElement>('.links a')!;
    link.focus();
    await act(async () => { p.resolver(new Map([['Q101', entrada('Título em português')]])); await p.promessa; });
    expect(cards(container)[0]).toBe(li1);
    expect(document.activeElement).toBe(link);
    expect(li1.querySelector('h2')?.textContent).toBe('Título em português');
    expect(li1.querySelector('.titulo-original')?.textContent).toBe('Título original: Comédia 1');
    expect(li1.querySelector('.titulo-original')?.hasAttribute('aria-hidden')).toBe(false);
    expect(li1.querySelector('.provedores img')?.getAttribute('alt')).toBe('Netflix');
    expect(li1.lastElementChild?.classList.contains('provedores')).toBe(true);
    // O segundo filme não veio no mapa: estado "sem dados".
    expect(cards(container)[1].querySelector('.estado-provedores')?.textContent).toBe('Sem dados de onde assistir no Brasil');
  });

  test('falha do Worker (status de erro) vira texto "Sem dados de onde assistir no Brasil" nos 2 cards', async () => {
    const { container } = await abrir({ provedores: Promise.resolve(new Map([['Q101', { status: 'erro' }], ['Q102', { status: 'erro' }]])) });
    await waitFor(() => expect(cards(container)[0].querySelector('.estado-provedores')?.textContent).toBe('Sem dados de onde assistir no Brasil'));
    expect(cards(container)[1].querySelector('.estado-provedores')?.textContent).toBe('Sem dados de onde assistir no Brasil');
  });

  test('provedores que rejeitam deixam o texto "Buscando" sem derrubar a página', async () => {
    const { container, dependencias } = await abrir({ provedores: () => new Promise((_, rejeitar) => { setTimeout(() => rejeitar(new Error('rede')), 0); }) });
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(cards(container).length).toBe(2);
    expect(dependencias.logger.error).not.toHaveBeenCalled();
  });

  test('com o Worker desligado o card não tem seção de provedores nem linha de título original', async () => {
    const { container } = await abrir();
    expect(container.querySelector('.provedores')).toBeNull();
    expect(container.querySelector('.titulo-original')).toBeNull();
  });
});

describe('AC-6: "Ler mais"', () => {
  test('só aparece com estouro simulado e alterna Ler mais e Ler menos com aria-expanded e aria-controls', async () => {
    definirMedidas(200, 80);
    const { container, utilizador } = await abrir({ enriquecimento: Promise.resolve(new Map([['Q101', ENRIQ(1)], ['Q102', ENRIQ(2)]])) });
    const botao = await screen.findAllByRole('button', { name: 'Ler mais' });
    expect(botao.length).toBe(2);
    const primeiro = botao[0];
    const texto = container.querySelector('p.sinopse')!;
    expect(primeiro.getAttribute('aria-controls')).toBe(texto.id);
    expect(primeiro.getAttribute('aria-expanded')).toBe('false');
    await utilizador.click(primeiro);
    expect(primeiro.textContent).toBe('Ler menos');
    expect(primeiro.getAttribute('aria-expanded')).toBe('true');
    expect(texto.classList.contains('expandida')).toBe(true);
    await utilizador.click(primeiro);
    expect(primeiro.textContent).toBe('Ler mais');
    expect(texto.classList.contains('expandida')).toBe(false);
  });

  test('sem estouro o botão fica oculto', async () => {
    definirMedidas(80, 80);
    const { container } = await abrir({ enriquecimento: Promise.resolve(new Map([['Q101', ENRIQ(1)], ['Q102', ENRIQ(2)]])) });
    await waitFor(() => expect(container.querySelector('p.sinopse')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Ler (mais|menos)/ })).toBeNull();
    expect(container.querySelector('.ler-mais')?.hasAttribute('hidden')).toBe(true);
  });

  test('"Ler mais" aberto continua aberto depois que os provedores chegam', async () => {
    definirMedidas(200, 80);
    const p = adiado<Map<string, any>>();
    const { container, utilizador } = await abrir({
      enriquecimento: Promise.resolve(new Map([['Q101', ENRIQ(1)], ['Q102', ENRIQ(2)]])), provedores: p.promessa,
    });
    const botoes = await screen.findAllByRole('button', { name: 'Ler mais' });
    await utilizador.click(botoes[0]);
    expect(botoes[0].textContent).toBe('Ler menos');
    await act(async () => { p.resolver(new Map([['Q101', { status: 'sem-dados' }]])); await p.promessa; });
    expect(container.querySelector('p.sinopse')?.classList.contains('expandida')).toBe(true);
    expect(container.querySelector('.ler-mais')).toBe(botoes[0]);
    expect(botoes[0].textContent).toBe('Ler menos');
  });
});
