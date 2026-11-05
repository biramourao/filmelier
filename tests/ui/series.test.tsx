import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Formulario, FILTROS_VAZIOS } from '../../src/ui/Formulario';
import { GrupoTemas } from '../../src/ui/GrupoTemas';
import { HUMORES, LISTA_TAGS } from './fixtures';

const base = {
  humores: HUMORES.humores,
  generos: [{ qid: 'Q4', rotulo: 'Drama' }],
  pronta: true,
  humor: null,
  genero: '',
  filtros: FILTROS_VAZIOS,
  aoEscolherHumor: () => {},
  aoMudarGenero: () => {},
  aoMudarFiltro: () => {},
  aoEnviar: () => {},
};
const antes = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('AC-6: formulário de Séries', () => {
  test('Época e ordem dos controles em Séries', () => {
    render(
      <Formulario
        {...base}
        prefixo="series-"
        filtrosDeFilme={false}
        temas={<GrupoTemas prefixo="series-" lista={LISTA_TAGS} tags={new Map()} aoAcionar={() => {}} />}
      />,
    );
    const opcoes = (el: HTMLElement) => [...(el as HTMLSelectElement).options].map((o) => o.textContent);
    expect(opcoes(screen.getByRole('combobox', { name: 'De' }))).toEqual(['Qualquer', ...Array.from({ length: 11 }, (_, i) => String(1920 + i * 10))]);
    expect(opcoes(screen.getByRole('combobox', { name: 'Até' }))).toEqual(['Qualquer', ...Array.from({ length: 11 }, (_, i) => String(1929 + i * 10))]);
    const humor = screen.getAllByRole('radio')[0];
    const genero = screen.getByRole('combobox', { name: 'Gênero (opcional)' });
    const de = screen.getByRole('combobox', { name: 'De' });
    const ate = screen.getByRole('combobox', { name: 'Até' });
    const temas = document.getElementById('series-grupo-temas')!;
    const recomendar = screen.getByRole('button', { name: 'Recomendar' });
    const ordem = [humor, genero, de, ate, temas, recomendar];
    for (let i = 0; i < ordem.length - 1; i += 1) expect(antes(ordem[i], ordem[i + 1])).toBe(true);
    for (const nome of ['Nota mínima', 'Oscar', 'Emmy']) expect(screen.queryByRole('combobox', { name: nome })).toBeNull();
  });

  test('prefixo em todo id, htmlFor e name dos radios', () => {
    const { container } = render(<Formulario {...base} prefixo="series-" filtrosDeFilme={false} />);
    const ids = [...container.querySelectorAll('[id]')].map((e) => e.id);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(id.startsWith('series-')).toBe(true);
    for (const r of screen.getAllByRole('radio')) expect(r.getAttribute('name')).toBe('series-humor');
    for (const l of container.querySelectorAll('label[for]')) expect(l.getAttribute('for')!.startsWith('series-')).toBe(true);
  });

  test('padrões (sem prefixo e com filtrosDeFilme) mantêm os ids, o name e Nota mínima e Oscar de Filmes', () => {
    const { container } = render(<Formulario {...base} />);
    expect(container.querySelector('form')!.id).toBe('formulario');
    expect(container.querySelector('#humores')).not.toBeNull();
    expect(screen.getAllByRole('radio')[0].getAttribute('name')).toBe('humor');
    expect(screen.getByRole('combobox', { name: 'Nota mínima' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Oscar' })).toBeTruthy();
    expect(container.querySelector('#recomendar')).not.toBeNull();
  });
});

// ---- tarefa 7.4: painel de Séries ligado ----
import { afterEach, vi } from 'vitest';
import { act, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../src/ui/App';
import { HUMORES_SERIES, criarDadosSeries, criarDependencias, criarSeries, META_SERIES } from './fixtures';
import { adiado, ENRIQ, simularMedidas } from './medidas';

async function abrir(sobrescrever: Record<string, unknown> = {}) {
  const dependencias = criarDependencias(sobrescrever);
  const utilizador = userEvent.setup();
  const tela = render(<App dependencias={dependencias} />);
  await screen.findByRole('radio', { name: 'Leve e engraçado' });
  return { dependencias, utilizador, ...tela };
}
const aba = (nome: string) => screen.getByRole('tab', { name: nome });
const painel = (id: string) => document.getElementById(id)!;
async function irParaSeries(utilizador: ReturnType<typeof userEvent.setup>) {
  await utilizador.click(aba('Séries'));
  await screen.findByRole('radio', { name: 'Quero sentir medo' });
}
async function recomendar(utilizador: ReturnType<typeof userEvent.setup>, humor = 'Leve e engraçado') {
  await utilizador.click(screen.getByRole('radio', { name: humor }));
  await utilizador.click(screen.getByRole('button', { name: 'Recomendar' }));
}
const titulos = (lista: string) => [...document.querySelectorAll(`#${lista} > li h2`)].map((h) => h.textContent);
const pressionado = (nome: string) => screen.getByRole('button', { name: nome }).getAttribute('aria-pressed');

describe('AC-2: as 2 abas juntas', () => {
  test('Ida e volta preserva as 2 abas', async () => {
    const { utilizador } = await abrir();
    await recomendar(utilizador);
    await utilizador.selectOptions(screen.getByRole('combobox', { name: 'Gênero (opcional)' }), 'Q1');
    await utilizador.click(screen.getByRole('button', { name: 'Quero Bruxaria' }));
    const filmes = { titulos: titulos('lista'), pressionado: pressionado('Quero Bruxaria') };
    await irParaSeries(utilizador);
    await recomendar(utilizador, 'Quero me emocionar');
    await utilizador.selectOptions(screen.getByRole('combobox', { name: 'Gênero (opcional)' }), 'Q1366112');
    await utilizador.click(screen.getByRole('button', { name: 'Não quero Magia' }));
    const series = { titulos: titulos('series-lista'), pressionado: pressionado('Não quero Magia') };
    await utilizador.click(aba('Filmes'));
    await utilizador.click(aba('Séries'));
    await utilizador.click(aba('Filmes'));
    expect(titulos('lista')).toEqual(filmes.titulos);
    expect(pressionado('Quero Bruxaria')).toBe(filmes.pressionado);
    expect((screen.getByRole('radio', { name: 'Leve e engraçado' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('combobox', { name: 'Gênero (opcional)' }) as HTMLSelectElement).value).toBe('Q1');
    await utilizador.click(aba('Séries'));
    expect(titulos('series-lista')).toEqual(series.titulos);
    expect(pressionado('Não quero Magia')).toBe(series.pressionado);
    expect((screen.getByRole('radio', { name: 'Quero me emocionar' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('combobox', { name: 'Gênero (opcional)' }) as HTMLSelectElement).value).toBe('Q1366112');
  });

  test('Troca de aba sem chamada ao Worker e sem refazer a recomendação', async () => {
    const buscar = vi.fn(async () => new Map());
    const { utilizador, dependencias } = await abrir({ criarProvedores: () => ({ ativo: true, buscar }) });
    await recomendar(utilizador);
    await irParaSeries(utilizador);
    await recomendar(utilizador);
    const chamadas = buscar.mock.calls.length;
    const recomendacoes = (dependencias.recomendar as any).mock.calls.length;
    for (const nome of ['Filmes', 'Séries', 'Filmes']) await utilizador.click(aba(nome));
    expect(buscar.mock.calls.length).toBe(chamadas);
    expect((dependencias.recomendar as any).mock.calls.length).toBe(recomendacoes);
  });

  test('Ids únicos com os 2 painéis montados', async () => {
    const { utilizador } = await abrir();
    await recomendar(utilizador);
    await irParaSeries(utilizador);
    await recomendar(utilizador);
    const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
    expect(ids.length).toBeGreaterThan(20);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });
});

describe('AC-4: humor, gênero, lista', () => {
  test('Radios e gêneros de séries', async () => {
    const { utilizador } = await abrir();
    await irParaSeries(utilizador);
    const radios = within(painel('painel-series')).getAllByRole('radio');
    expect(radios.length).toBe(7);
    for (const r of radios) expect(r.getAttribute('name')).toBe('series-humor');
    for (const h of HUMORES_SERIES.humores) expect(within(painel('painel-series')).getByRole('radio', { name: h.rotulo })).toBeTruthy();
    const opcoes = [...(screen.getByRole('combobox', { name: 'Gênero (opcional)' }) as HTMLSelectElement).options].map((o) => [o.value, o.textContent]);
    expect(opcoes).toEqual([
      ['', 'Qualquer gênero'], ['Q343782', 'Ação'], ['Q56064758', 'Aventura'], ['Q9335576', 'Comédia'], ['Q9335577', 'Crime'], ['Q1366112', 'Drama'],
      ['Q140472311', 'Ficção científica'], ['Q1273568', 'Infantil'], ['Q170238', 'Sitcom'], ['Q20220309', 'Terror'],
    ]);
    for (const r of radios) {
      const rotulo = painel('painel-series').querySelector(`label[for="${r.id}"]`)!;
      expect(rotulo.querySelector('.emoji')?.getAttribute('aria-hidden')).toBe('true');
    }
  });

  test('Recomendar só habilita com dados e humor', async () => {
    let liberar!: (v: unknown) => void;
    const { utilizador } = await abrir({ carregarSeries: vi.fn(() => new Promise((r) => { liberar = r; })) });
    await utilizador.click(aba('Séries'));
    const botao = () => within(painel('painel-series')).getByRole('button', { name: 'Recomendar' }) as HTMLButtonElement;
    expect(botao().disabled).toBe(true);
    await act(async () => { liberar(criarDadosSeries()); });
    await screen.findByRole('radio', { name: 'Quero sentir medo' });
    expect(botao().disabled).toBe(true);
    await utilizador.click(screen.getByRole('radio', { name: 'Quero sentir medo' }));
    expect(botao().disabled).toBe(false);
  });

  test('Lista e nova rodada', async () => {
    const { utilizador, dependencias } = await abrir();
    await irParaSeries(utilizador);
    await recomendar(utilizador);
    expect(document.querySelectorAll('#series-lista > li').length).toBe(5);
    const exibidos = [...document.querySelectorAll('#series-lista > li')].length;
    expect(exibidos).toBe(Math.min(5, 8));
    await utilizador.click(screen.getByRole('button', { name: 'Outras sugestões' }));
    const chamadas = (dependencias.recomendar as any).mock.calls;
    const ultima = chamadas[chamadas.length - 1][0];
    expect(ultima.campoAno).toBe('anoInicio');
    expect(ultima.anteriores.length).toBe(5);
    expect(ultima.anteriores.every((q: any) => typeof q === 'string' && q.startsWith('Q5'))).toBe(true);
  });

  test('Nível nenhum oculta Outras sugestões', async () => {
    const { utilizador } = await abrir({ carregarSeries: vi.fn(async () => criarDadosSeries({ series: { meta: META_SERIES, series: criarSeries().filter((s) => !s.generos.includes('Q20220309')) } })) });
    await irParaSeries(utilizador);
    await recomendar(utilizador, 'Quero sentir medo');
    expect(document.getElementById('series-aviso')!.textContent).toBe('Não encontramos séries para essa combinação. Escolha outro humor ou gênero.');
    expect(document.querySelectorAll('#series-lista > li').length).toBe(0);
    expect(document.getElementById('series-outras')!.hasAttribute('hidden')).toBe(true);
  });
});

describe('AC-5: região live e limpeza', () => {
  test('Texto da região live de Séries', async () => {
    const { utilizador } = await abrir();
    await irParaSeries(utilizador);
    await recomendar(utilizador, 'Quero sentir medo');
    expect(document.getElementById('series-resumo-lista')!.textContent).toBe('1 sugestão: Terror 1.');
    await utilizador.click(screen.getByRole('radio', { name: 'Tenso, quero adrenalina' }));
    await utilizador.click(screen.getByRole('button', { name: 'Quero Bruxaria' }));
    await utilizador.click(screen.getByRole('button', { name: 'Não quero Magia' }));
    await utilizador.click(screen.getByRole('radio', { name: 'Leve e engraçado' }));
    await utilizador.click(screen.getByRole('button', { name: 'Recomendar' }));
    const texto = document.getElementById('series-resumo-lista')!.textContent!;
    expect(texto).toMatch(/^Com Bruxaria\. Sem Magia\. 4 sugestões: /);
    expect(texto).not.toMatch(/Sinopse/);
    const cartoes = titulos('series-lista');
    expect(texto.endsWith(`${cartoes.join(', ')}.`)).toBe(true);
    expect(cartoes.length).toBe(4);
  });

  const mudancas: [string, (u: ReturnType<typeof userEvent.setup>) => Promise<void>][] = [
    ['humor', async (u) => { await u.click(screen.getByRole('radio', { name: 'Tenso, quero adrenalina' })); }],
    ['gênero', async (u) => { await u.selectOptions(screen.getByRole('combobox', { name: 'Gênero (opcional)' }), 'Q343782'); }],
    ['De', async (u) => { await u.selectOptions(screen.getByRole('combobox', { name: 'De' }), '2000'); }],
    ['Até', async (u) => { await u.selectOptions(screen.getByRole('combobox', { name: 'Até' }), '2019'); }],
    ['tag', async (u) => { await u.click(within(document.getElementById('series-temas-controles')!).getByRole('button', { name: 'Quero Bruxaria' })); }],
  ];
  for (const [nome, mudar] of mudancas) {
    test(`Cinco mudanças limpam só Séries: ${nome}`, async () => {
      const { utilizador } = await abrir();
      await recomendar(utilizador);
      const filmes = titulos('lista');
      await irParaSeries(utilizador);
      await recomendar(utilizador);
      expect(titulos('series-lista').length).toBeGreaterThan(0);
      await mudar(utilizador);
      expect(titulos('series-lista')).toEqual([]);
      expect(document.getElementById('series-chips')!.children.length).toBe(0);
      expect(document.getElementById('series-aviso')).toBeNull();
      expect(document.getElementById('series-resumo-lista')!.textContent).toBe('');
      await utilizador.click(aba('Filmes'));
      expect(titulos('lista')).toEqual(filmes);
    });
  }
});

describe('AC-6: Nota mínima e Oscar só em Filmes', () => {
  test('Filmes mantém Nota mínima e Oscar', async () => {
    const { utilizador } = await abrir();
    const opcoes = (nome: string) => [...(screen.getByRole('combobox', { name: nome }) as HTMLSelectElement).options].map((o) => [o.value, o.textContent]);
    expect(opcoes('Nota mínima')).toEqual([['', 'Qualquer'], ['5', '5+'], ['6', '6+'], ['7', '7+'], ['8', '8+'], ['9', '9+']]);
    expect(opcoes('Oscar')).toEqual([['', 'Qualquer'], ['indicado', 'Indicado'], ['vencedor', 'Vencedor']]);
    await irParaSeries(utilizador);
    expect(within(painel('painel-series')).queryByRole('combobox', { name: 'Nota mínima' })).toBeNull();
    expect(within(painel('painel-series')).queryByRole('combobox', { name: 'Oscar' })).toBeNull();
  });
});

describe('AC-7: tags de Séries', () => {
  test('Chip refaz a lista de Séries', async () => {
    const { utilizador } = await abrir();
    await irParaSeries(utilizador);
    await recomendar(utilizador);
    const chips = document.getElementById('series-chips')!;
    expect(chips.querySelectorAll('.tag-controle').length).toBeLessThanOrEqual(10);
    const antes = (document.querySelectorAll('#series-lista > li').length);
    await utilizador.click(within(chips).getByRole('button', { name: 'Quero Bruxaria' }));
    expect(chips.querySelectorAll('.tag-controle').length).toBeLessThanOrEqual(10);
    const exibidos = [...document.querySelectorAll('#series-lista > li h2')].map((h) => h.textContent);
    expect(exibidos.length).toBeGreaterThan(0);
    expect(antes).toBeGreaterThan(0);
    const comBruxaria = criarSeries().filter((s) => s.tags?.includes('bruxaria')).map((s) => s.titulo);
    for (const t of exibidos) expect(comBruxaria).toContain(t);
  });

  // Base com 45 sitcoms em ordem decrescente de citações: a tag "raro" só existe na última (fora do top 40).
  function dadosRaros(comMagia: boolean) {
    const series: any[] = [];
    for (let i = 1; i <= 45; i += 1) {
      series.push({
        qid: `Q${1000 + i}`, titulo: `Sitcom ${i}`, anoInicio: 2000, anoFim: 2005, situacao: 'finalizada', temporadas: 1, episodios: 10, generos: ['Q9335576'],
        sitelinks: 200 - i, tmdbId: 5000 + i, tags: i === 45 ? ['raro'] : (comMagia && i <= 3 ? ['magia'] : []),
      });
    }
    const lista = [{ id: 'magia', rotulo: 'Magia', filmes: 30 }, { id: 'raro', rotulo: 'Raro', filmes: 30 }];
    return criarDadosSeries({ series: { meta: { ...META_SERIES, temas: { lista } }, series } });
  }
  const chipsSeries = () => document.getElementById('series-chips')!;
  const rotulosChips = () => [...chipsSeries().querySelectorAll('.tag-rotulo')].map((n) => n.textContent);

  test('Grupo fechado, legenda e foco depois do chip', async () => {
    const { utilizador } = await abrir();
    await irParaSeries(utilizador);
    const grupo = document.getElementById('series-grupo-temas')!;
    expect(grupo.hasAttribute('open')).toBe(false);
    expect(grupo.querySelector('.legenda-tags')?.textContent).toBe('+ quero · − não quero');
    await recomendar(utilizador);
    expect(chipsSeries().querySelector('.legenda-tags')?.textContent).toBe('+ quero · − não quero');
    await utilizador.click(within(chipsSeries()).getByRole('button', { name: 'Quero Bruxaria' }));
    const ativo = document.activeElement as HTMLElement;
    expect(ativo.dataset.tag).toBe('bruxaria');
    expect(ativo.dataset.acao).toBe('incluir');
    expect(chipsSeries().contains(ativo)).toBe(true);
  });

  test('foco 2 em Séries: se a tag sai dos chips, o foco vai ao 1º chip', async () => {
    const { utilizador } = await abrir({ carregarSeries: vi.fn(async () => dadosRaros(true)) });
    await irParaSeries(utilizador);
    await utilizador.click(screen.getByRole('button', { name: 'Quero Raro' }));
    await recomendar(utilizador);
    expect(rotulosChips()).toEqual(['Raro']);
    await utilizador.click(within(chipsSeries()).getByRole('button', { name: 'Quero Raro' }));
    expect(rotulosChips()).toEqual(['Magia']);
    const ativo = document.activeElement as HTMLElement;
    expect(ativo.dataset.tag).toBe('magia');
    expect(ativo.dataset.acao).toBe('incluir');
  });

  test('foco 3 em Séries: sem chips depois de refazer, o foco vai a "Recomendar" de Séries', async () => {
    const { utilizador } = await abrir({ carregarSeries: vi.fn(async () => dadosRaros(false)) });
    await irParaSeries(utilizador);
    await utilizador.click(screen.getByRole('button', { name: 'Quero Raro' }));
    await recomendar(utilizador);
    await utilizador.click(within(chipsSeries()).getByRole('button', { name: 'Quero Raro' }));
    expect(rotulosChips()).toEqual([]);
    expect(chipsSeries().hasAttribute('hidden')).toBe(true);
    expect(document.activeElement).toBe(document.getElementById('series-recomendar'));
  });

  test('Tags de Séries independentes das de Filmes', async () => {
    const { utilizador } = await abrir();
    await irParaSeries(utilizador);
    await utilizador.click(screen.getByRole('button', { name: 'Quero Bruxaria' }));
    expect(pressionado('Quero Bruxaria')).toBe('true');
    await utilizador.click(aba('Filmes'));
    expect(pressionado('Quero Bruxaria')).toBe('false');
  });

  test('Base de séries sem tags', async () => {
    const { utilizador } = await abrir({ carregarSeries: vi.fn(async () => criarDadosSeries({ series: { meta: META_SERIES, series: criarSeries(false) } })) });
    await irParaSeries(utilizador);
    expect(document.getElementById('series-grupo-temas')).toBeNull();
    await recomendar(utilizador);
    expect(document.getElementById('series-chips')!.children.length).toBe(0);
    expect(document.querySelector('#series-lista ul.tags-filme')).toBeNull();
    expect(document.querySelectorAll('#series-lista > li').length).toBeGreaterThan(0);
  });
});

describe('AC-2 e AC-10: enriquecimento de Séries com a aba oculta', () => {
  afterEach(() => {
    delete (HTMLElement.prototype as any).scrollHeight;
    delete (HTMLElement.prototype as any).clientHeight;
  });

  test('Enriquecimento de Séries com a aba oculta', async () => {
    simularMedidas();
    const e = adiado<Map<string, any>>();
    const enriquecer = vi.fn(() => e.promessa);
    const { utilizador } = await abrir({ criarEnriquecedor: () => ({ enriquecer }) });
    await irParaSeries(utilizador);
    await recomendar(utilizador, 'Quero sentir medo');
    await utilizador.click(aba('Filmes'));
    await act(async () => { e.resolver(new Map([['Q801', ENRIQ('Q801')]])); await e.promessa; });
    await utilizador.click(aba('Séries'));
    const botao = within(painel('painel-series')).getByRole('button', { name: 'Ler mais' });
    expect(botao.hasAttribute('hidden')).toBe(false);
    expect(botao.getAttribute('aria-expanded')).toBe('false');
  });
});
