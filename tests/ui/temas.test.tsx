import { describe, expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../src/ui/App';
import { HUMORES, LISTA_TAGS, META, criarDados, criarDependencias, criarFilmes } from './fixtures';

const LEGENDA = '+ quero · − não quero';

async function abrir(dados: any = criarDados(), sobrescrever: Record<string, unknown> = {}) {
  const dependencias = criarDependencias({ carregarDados: vi.fn(async () => dados), ...sobrescrever });
  const utilizador = userEvent.setup();
  const tela = render(<App dependencias={dependencias} />);
  await screen.findByRole('radio', { name: 'Leve e engraçado' });
  return { dependencias, utilizador, ...tela };
}

async function recomendarLeve(utilizador: ReturnType<typeof userEvent.setup>) {
  await utilizador.click(screen.getByRole('radio', { name: 'Leve e engraçado' }));
  await utilizador.click(screen.getByRole('button', { name: 'Recomendar' }));
}

const botao = (nome: string) => screen.getByRole('button', { name: nome });
const noChips = (container: HTMLElement) => container.querySelector<HTMLElement>('#chips')!;
const chipsDe = (container: HTMLElement) => [...noChips(container).querySelectorAll('.tag-rotulo')].map((n) => n.textContent);
const pressionados = (container: HTMLElement, tag: string, acao: string) =>
  [...container.querySelectorAll(`button[data-tag="${tag}"][data-acao="${acao}"]`)].map((b) => b.getAttribute('aria-pressed'));
const itens = (container: HTMLElement) => container.querySelectorAll('#lista > li');

// Base com 45 comédias em ordem decrescente de citações: a tag "raro" só existe no último filme (fora do top 40).
function dadosRaros(comMagia: boolean) {
  const filmes: any[] = [];
  for (let i = 1; i <= 45; i += 1) {
    filmes.push({
      qid: `Q${1000 + i}`, titulo: `Comédia ${i}`, ano: 2000, generos: ['Q1'], sitelinks: 200 - i,
      tags: i === 45 ? ['raro'] : (comMagia && i <= 3 ? ['magia'] : []),
    });
  }
  const lista = [{ id: 'magia', rotulo: 'Magia', filmes: 30 }, { id: 'raro', rotulo: 'Raro', filmes: 30 }];
  return { humores: HUMORES, filmes: { meta: { ...META, temas: { lista } }, filmes }, erro: null };
}

describe('AC-7: grupo de temas', () => {
  test('o grupo começa fechado, com summary e legend com textos distintos', async () => {
    const { container } = await abrir();
    const grupo = container.querySelector('details#grupo-temas')!;
    expect(grupo.hasAttribute('open')).toBe(false);
    expect(grupo.querySelector('summary')?.textContent).toBe('Filtrar por tema (opcional)');
    expect(grupo.querySelector('fieldset legend')?.textContent).toBe('Temas (opcional)');
  });

  test('o grupo aberto continua aberto depois de acionar "Quero" de 1 tag', async () => {
    const { container, utilizador } = await abrir();
    const grupo = container.querySelector('details#grupo-temas') as HTMLDetailsElement;
    await utilizador.click(grupo.querySelector('summary')!);
    expect(grupo.hasAttribute('open')).toBe(true);
    await utilizador.click(botao('Quero Bruxaria'));
    expect(grupo.hasAttribute('open')).toBe(true);
    await utilizador.click(botao('Não quero Magia'));
    expect(grupo.hasAttribute('open')).toBe(true);
  });

  test('sem filme com tags na base não há grupo, chips nem tags no card', async () => {
    const filmes = criarFilmes().map(({ tags, clima, ...resto }) => resto);
    const { container, utilizador } = await abrir(criarDados({ filmes: { meta: META, filmes } }));
    expect(container.querySelector('#grupo-temas')).toBeNull();
    await recomendarLeve(utilizador);
    expect(itens(container).length).toBe(5);
    expect(noChips(container).children.length).toBe(0);
    expect(container.querySelector('ul.tags-filme')).toBeNull();
  });

  test('aria-pressed do formulário e dos chips seguem o mesmo estado', async () => {
    const { container, utilizador } = await abrir();
    await recomendarLeve(utilizador);
    expect(pressionados(container, 'magia', 'incluir')).toEqual(['false', 'false']);
    await utilizador.click(within(noChips(container)).getByRole('button', { name: 'Quero Magia' }));
    expect(pressionados(container, 'magia', 'incluir')).toEqual(['true', 'true']);
    await utilizador.click(within(noChips(container)).getByRole('button', { name: 'Não quero Magia' }));
    expect(pressionados(container, 'magia', 'incluir')).toEqual(['false', 'false']);
    expect(pressionados(container, 'magia', 'excluir')).toEqual(['true', 'true']);
  });

  test('chips do conjunto candidato: filme candidato que não foi sorteado gera chip', async () => {
    const comedias = criarFilmes().slice(0, 8);
    const recomendar = vi.fn(() => ({ nivel: 'humor', filmes: [comedias[0]], aviso: '', mensagem: '', candidatos: comedias }));
    const { container, utilizador } = await abrir(criarDados(), { recomendar });
    await recomendarLeve(utilizador);
    expect(itens(container).length).toBe(1);
    expect(chipsDe(container)).toEqual(['Bruxaria', 'Magia', 'Clima sombrio']);
  });

  test('máximo de 10 chips', async () => {
    const lista = Array.from({ length: 12 }, (_, i) => ({ id: `t${String(i).padStart(2, '0')}`, rotulo: `Tema ${String.fromCharCode(65 + i)}`, filmes: 40 }));
    const filmes = criarFilmes().map((f, i) => (i < 8 ? { ...f, tags: lista.map((t) => t.id), clima: undefined } : f));
    const { container, utilizador } = await abrir(criarDados({ filmes: { meta: { ...META, temas: { lista } }, filmes } }));
    await recomendarLeve(utilizador);
    expect(noChips(container).querySelectorAll('.tag-controle').length).toBe(10);
  });
});

describe('AC-7: chip refaz a lista', () => {
  test('acionar o chip refaz a lista sem "Recomendar", com a tag incluída', async () => {
    const { dependencias, container, utilizador } = await abrir();
    await recomendarLeve(utilizador);
    expect(itens(container).length).toBe(5);
    await utilizador.click(within(noChips(container)).getByRole('button', { name: 'Quero Bruxaria' }));
    expect(dependencias.recomendar).toHaveBeenCalledTimes(2);
    expect((dependencias.recomendar as any).mock.calls[1][0]).toMatchObject({ incluir: ['bruxaria'], excluir: [], anteriores: [] });
    expect([...container.querySelectorAll('#lista h2')].map((h) => h.textContent).sort()).toEqual(['Comédia 1', 'Comédia 2', 'Comédia 3', 'Comédia 4']);
    expect(container.querySelector('#resumo-lista')?.textContent).toMatch(/^Com Bruxaria\. 4 sugestões: /);
  });

  test('chip ativo com resultado vazio continua entre os chips', async () => {
    const { container, utilizador } = await abrir();
    await utilizador.click(botao('Não quero Bruxaria'));
    await utilizador.click(botao('Quero Clima sombrio'));
    await recomendarLeve(utilizador);
    expect(itens(container).length).toBe(0);
    expect(container.querySelector('#aviso')?.textContent).toBe('Nenhum filme com esses temas. Tente incluir outro tema ou desfazer um "não quero".');
    expect(chipsDe(container)).toEqual(['Bruxaria', 'Clima sombrio']);
    expect(noChips(container).hasAttribute('hidden')).toBe(false);
    expect(screen.queryByRole('button', { name: 'Outras sugestões' })).toBeNull();
  });

  test('foco 1: o chip acionado continua sendo o foco quando permanece nos chips', async () => {
    const { container, utilizador } = await abrir();
    await recomendarLeve(utilizador);
    await utilizador.click(within(noChips(container)).getByRole('button', { name: 'Quero Bruxaria' }));
    const ativo = document.activeElement as HTMLElement;
    expect(ativo.dataset.tag).toBe('bruxaria');
    expect(ativo.dataset.acao).toBe('incluir');
    expect(noChips(container).contains(ativo)).toBe(true);
  });

  test('foco 2: se a tag sai dos chips, o foco vai ao 1º chip', async () => {
    const { container, utilizador } = await abrir(dadosRaros(true));
    await utilizador.click(botao('Quero Raro'));
    await recomendarLeve(utilizador);
    expect(chipsDe(container)).toEqual(['Raro']);
    await utilizador.click(within(noChips(container)).getByRole('button', { name: 'Quero Raro' }));
    expect(chipsDe(container)).toEqual(['Magia']);
    const ativo = document.activeElement as HTMLElement;
    expect(ativo.dataset.tag).toBe('magia');
    expect(ativo.dataset.acao).toBe('incluir');
  });

  test('foco 3: sem chips depois de refazer, o foco vai a "Recomendar"', async () => {
    const { container, utilizador } = await abrir(dadosRaros(false));
    await utilizador.click(botao('Quero Raro'));
    await recomendarLeve(utilizador);
    await utilizador.click(within(noChips(container)).getByRole('button', { name: 'Quero Raro' }));
    expect(chipsDe(container)).toEqual([]);
    expect(noChips(container).hasAttribute('hidden')).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Recomendar' }));
  });
});

describe('AC-3 e AC-5: tags no formulário', () => {
  test('recomendar recebe incluir e excluir do cenário e a região live traz "Com X. Sem Y."', async () => {
    const comedias = criarFilmes().slice(0, 3);
    const recomendar = vi.fn(() => ({ nivel: 'humor', filmes: comedias, aviso: '', mensagem: '', candidatos: comedias }));
    const { container, utilizador, dependencias } = await abrir(criarDados(), { recomendar });
    await utilizador.click(botao('Quero Bruxaria'));
    await utilizador.click(botao('Não quero Magia'));
    await recomendarLeve(utilizador);
    expect(dependencias.recomendar).toHaveBeenCalledTimes(1);
    expect((recomendar.mock.calls[0] as any)[0]).toMatchObject({ incluir: ['bruxaria'], excluir: ['magia'], tagsValidas: ['bruxaria', 'sombrio', 'magia'] });
    expect(container.querySelector('#resumo-lista')?.textContent).toBe('Com Bruxaria. Sem Magia. 3 sugestões: Comédia 1, Comédia 2, Comédia 3.');
  });

  test('"Quero" de 1 tag do grupo de temas limpa o resultado (6º controle do cenário de limpeza)', async () => {
    const { container, utilizador } = await abrir();
    await recomendarLeve(utilizador);
    expect(itens(container).length).toBe(5);
    await utilizador.click(within(container.querySelector<HTMLElement>('#temas-controles')!).getByRole('button', { name: 'Quero Magia' }));
    expect(itens(container).length).toBe(0);
    expect(container.querySelector('#resumo-lista')?.textContent).toBe('');
    expect(noChips(container).children.length).toBe(0);
    expect(screen.queryByRole('button', { name: 'Outras sugestões' })).toBeNull();
  });
});

describe('AC-11: botões "+" e "−" com Quero e Não quero', () => {
  test('cada tag tem 2 botões com os nomes novos e ícones decorativos, e nenhum botão "Menos"', async () => {
    const { container } = await abrir();
    for (const tag of LISTA_TAGS) {
      const grupo = screen.getByRole('group', { name: tag.rotulo });
      const botoes = within(grupo).getAllByRole('button');
      expect(botoes.map((b) => b.textContent)).toEqual([`+Quero ${tag.rotulo}`, `−Não quero ${tag.rotulo}`]);
      expect(botoes.map((b) => b.querySelector('.tag-icone')?.textContent)).toEqual(['+', '−']);
      for (const b of botoes) {
        expect(b.querySelector('.tag-icone')?.getAttribute('aria-hidden')).toBe('true');
        expect(b.hasAttribute('aria-label')).toBe(false);
        expect(b.getAttribute('type')).toBe('button');
      }
      expect(grupo.querySelectorAll('.tag-rotulo').length).toBe(1);
    }
    expect(screen.queryAllByRole('button', { name: /^Menos/ }).length).toBe(0);
    expect(container.textContent).not.toContain('Menos');
  });

  test('aria-pressed alterna: Quero, Não quero e de volta a neutra', async () => {
    const { utilizador } = await abrir();
    const quero = botao('Quero Bruxaria');
    const nao = botao('Não quero Bruxaria');
    expect([quero, nao].map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false']);
    await utilizador.click(quero);
    expect([quero, nao].map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    await utilizador.click(nao);
    expect([quero, nao].map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
    await utilizador.click(nao);
    expect([quero, nao].map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false']);
  });

  test('legenda "+ quero · − não quero" visível no grupo de temas e nos chips', async () => {
    const { container, utilizador } = await abrir();
    expect(container.querySelector('#grupo-temas .legenda-tags')?.textContent).toBe(LEGENDA);
    await recomendarLeve(utilizador);
    expect(noChips(container).querySelector('.legenda-tags')?.textContent).toBe(LEGENDA);
    expect(container.querySelectorAll('.legenda-tags').length).toBe(2);
  });

  test('"Não quero Bruxaria" no chip exclui a tag e refaz a lista sem ela', async () => {
    const { container, utilizador, dependencias } = await abrir();
    await recomendarLeve(utilizador);
    await utilizador.click(within(noChips(container)).getByRole('button', { name: 'Não quero Bruxaria' }));
    expect((dependencias.recomendar as any).mock.calls[1][0]).toMatchObject({ incluir: [], excluir: ['bruxaria'] });
    for (const h of container.querySelectorAll('#lista h2')) expect(['Comédia 5', 'Comédia 6', 'Comédia 7', 'Comédia 8']).toContain(h.textContent);
    expect(container.querySelector('#resumo-lista')?.textContent).toMatch(/^Sem Bruxaria\./);
  });

  test('incluir e depois "Não quero" no chip deixa só a exclusão', async () => {
    const { container, utilizador } = await abrir();
    await recomendarLeve(utilizador);
    const chip = () => within(noChips(container));
    await utilizador.click(chip().getByRole('button', { name: 'Quero Magia' }));
    await utilizador.click(chip().getByRole('button', { name: 'Não quero Magia' }));
    expect(pressionados(container, 'magia', 'incluir')).toEqual(['false', 'false']);
    expect(pressionados(container, 'magia', 'excluir')).toEqual(['true', 'true']);
  });
});
