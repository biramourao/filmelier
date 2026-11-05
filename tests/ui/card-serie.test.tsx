import { describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../src/ui/App';
import { Card } from '../../src/ui/Card';
import { montarCardSerie } from '../../src/serie.mjs';
import { listarGeneros } from '../../src/recomendar.mjs';
import { criarProvedores } from '../../src/provedores.mjs';
import { HUMORES_SERIES, LISTA_TAGS, criarDadosSeries, criarDependencias, criarSeries } from './fixtures';
import { adiado } from './medidas';

const generos = listarGeneros(HUMORES_SERIES);
const fabricaProvedores = criarProvedores as (opcoes: any) => any;
const agendar = (retorno: () => void) => retorno();
const ENRIQ = { idioma: 'pt', sinopse: 'Uma sinopse de série.', capaUrl: 'https://upload.wikimedia.org/capa.jpg', artigoUrl: 'https://pt.wikipedia.org/wiki/Serie' };
const PROV = {
  status: 'ok', link: 'https://www.themoviedb.org/tv/1/watch?locale=BR',
  flatrate: [{ provider_id: 1, provider_name: 'Netflix', logo_path: '/abc.jpg', display_priority: 1 }],
  rent: [{ provider_id: 2, provider_name: 'Locadora', logo_path: 'invalido', display_priority: 2 }],
};
const serie = (extra: Record<string, unknown> = {}) => ({
  qid: 'Q1079', titulo: 'Liberdade Vigiada', tituloOriginal: 'Breaking Bad', anoInicio: 2008, anoFim: 2013, situacao: 'finalizada', temporadas: 5, episodios: 62,
  generos: ['Q1366112', 'Q9335577'], sitelinks: 103, tmdbId: 1396, imdb: 'tt0903747', tags: ['bruxaria'], clima: 'sombrio', ...extra,
});
function modelo(s: any, enriquecimento: any = null, provedores: any = null, tags: any = { lista: LISTA_TAGS, incluir: [] }) {
  return montarCardSerie(s, generos, enriquecimento, provedores, tags);
}
function renderizar(card: any, enriquecido = true) {
  const tela = render(<ul><Card card={card} enriquecido={enriquecido} agendarQuadro={agendar} /></ul>);
  return { ...tela, li: tela.container.querySelector('li.card') as HTMLElement };
}
const classes = (no: Element) => no.className.split(' ')[0];

describe('AC-8: ordem e título do card de série', () => {
  test('Blocos na ordem', () => {
    const { li } = renderizar(modelo(serie(), ENRIQ, PROV));
    const ordem = [...li.children].map((no) => (no.tagName === 'DIV' ? classes(no) : `${no.tagName.toLowerCase()}.${classes(no)}`));
    expect(ordem).toEqual(['capa', 'bloco-titulo', 'p.meta', 'p.linha-serie', 'ul.tags-filme', 'sinopse-bloco', 'p.credito-imagem', 'p.links', 'provedores']);
    expect(li.querySelector('.meta')?.textContent).toBe('2008–2013 · Drama, Crime');
    expect(li.querySelector('.linha-serie')?.textContent).toBe('Finalizada · 5 temporadas · 62 episódios');
    const tags = li.querySelector('ul.tags-filme')!;
    expect(tags.getAttribute('aria-label')).toBe('Tags da série');
    expect(tags.querySelectorAll('button, a').length).toBe(0);
    expect(li.querySelector('.oscar')).toBeNull();
    expect(li.querySelector('.meta')?.textContent).not.toMatch(/Nota/);
    expect([...li.querySelectorAll('.links a')].map((a) => a.textContent)).toEqual(['Wikidata', 'IMDb']);
  });

  test('Card sem tags', () => {
    const { tags, clima, ...sem } = serie();
    const { li } = renderizar(modelo(sem, ENRIQ));
    expect(li.querySelector('ul.tags-filme')).toBeNull();
    expect(li.querySelector('.linha-serie')).not.toBeNull();
  });

  test('Título pt-BR e original da base', () => {
    const { li } = renderizar(modelo(serie(), ENRIQ, { ...PROV, titulo: 'Outro', tituloOriginal: 'Another' }));
    expect(li.querySelector('h2')?.textContent).toBe('Liberdade Vigiada');
    const original = li.querySelector('.titulo-original')!;
    expect(original.textContent).toBe('Título original: Breaking Bad');
    expect(original.hasAttribute('aria-hidden')).toBe(false);
  });

  test('Sem título original com Worker', () => {
    const { li } = renderizar(modelo(serie({ titulo: 'Friends', tituloOriginal: undefined }), ENRIQ, PROV));
    expect(li.querySelector('h2')?.textContent).toBe('Friends');
    const original = li.querySelector('.titulo-original')!;
    expect(original.textContent).toBe('');
    expect(original.getAttribute('aria-hidden')).toBe('true');
  });

  test('Sem título original e sem Worker', () => {
    const { li } = renderizar(modelo(serie({ titulo: 'Friends', tituloOriginal: undefined }), ENRIQ, null));
    expect(li.querySelector('h2')?.textContent).toBe('Friends');
    expect(li.querySelector('.titulo-original')).toBeNull();
  });

  test('Título original sem Worker', () => {
    const { li } = renderizar(modelo(serie(), ENRIQ, null));
    const original = li.querySelector('.titulo-original')!;
    expect(original.textContent).toBe('Título original: Breaking Bad');
    expect(original.hasAttribute('aria-hidden')).toBe(false);
    expect(li.querySelector('.provedores')).toBeNull();
  });
});

describe('AC-9: situação visível', () => {
  test('Situação no conteúdo do card', () => {
    const casos: [string | null, string][] = [['cancelada', 'Cancelada'], ['finalizada', 'Finalizada'], ['em-andamento', 'Em andamento'], [null, 'Situação não informada']];
    for (const [situacao, texto] of casos) {
      const { li, unmount } = renderizar(modelo(serie({ situacao }), ENRIQ));
      const linha = li.querySelector('.linha-serie')!;
      expect(linha.textContent!.startsWith(texto)).toBe(true);
      expect(linha.closest('[aria-hidden]')).toBeNull();
      expect(linha.closest('.so-leitor')).toBeNull();
      expect(li.textContent).toContain(texto);
      unmount();
    }
  });
});

// Painel de Séries com o cliente de provedores real sobre um `fetch` do Worker simulado.
async function abrirSeries({ worker, enriquecedor }: { worker?: (url: string) => any; enriquecedor?: any } = {}) {
  const fetchImpl = vi.fn(async (url: string) => worker!(url));
  const dependencias = criarDependencias({
    carregarSeries: vi.fn(async () => criarDadosSeries({ series: { meta: criarDadosSeries().series.meta, series: [serie({ qid: 'Q801', tmdbId: 4001, generos: ['Q9335577', 'Q20220309'], tags: undefined, clima: undefined }), ...criarSeries().filter((s) => s.qid !== 'Q801')] } })),
    criarEnriquecedor: () => enriquecedor ?? { enriquecer: async () => new Map() },
    criarProvedores: (tipo?: 'filme' | 'serie') => (worker
      ? fabricaProvedores({ urlWorker: 'https://filmelier-provedores.exemplo.workers.dev', fetchImpl, logger: { warn() {}, error() {} }, tipo })
      : { ativo: false, buscar: async () => new Map() }),
  });
  const utilizador = userEvent.setup();
  render(<App dependencias={dependencias} />);
  await screen.findByRole('radio', { name: 'Leve e engraçado' });
  await utilizador.click(screen.getByRole('tab', { name: 'Séries' }));
  await screen.findByRole('radio', { name: 'Quero sentir medo' });
  await utilizador.click(screen.getByRole('radio', { name: 'Quero sentir medo' }));
  await utilizador.click(screen.getByRole('button', { name: 'Recomendar' }));
  return { utilizador, dependencias, fetchImpl, li: () => document.querySelector('#series-lista > li') as HTMLElement };
}
const resposta = (corpo: unknown, status = 200) => ({ ok: status < 300, status, headers: { get: () => null }, json: async () => corpo });

describe('AC-10: enriquecimento e provedores no card de série', () => {
  test('Enriquecimento no mesmo nó', async () => {
    const e = adiado<Map<string, any>>();
    const { li } = await abrirSeries({ enriquecedor: { enriquecer: () => e.promessa } });
    const antes = li();
    const link = antes.querySelector<HTMLAnchorElement>('.links a')!;
    link.focus();
    await act(async () => { e.resolver(new Map([['Q801', ENRIQ]])); await e.promessa; });
    expect(li()).toBe(antes);
    expect(document.activeElement).toBe(link);
    expect(antes.querySelector('.credito')?.textContent).toBe('Sinopse: Wikipédia (CC BY-SA)');
    expect(antes.querySelector('.credito-imagem')?.textContent).toBe('Imagem: Wikipédia');
  });

  test('Sem sinopse e imagem com erro', async () => {
    const semSinopse = await abrirSeries({ enriquecedor: { enriquecer: async () => new Map([['Q801', { idioma: 'pt', sinopse: '', capaUrl: null, artigoUrl: null }]]) } });
    expect(await within(semSinopse.li()).findByText('Sinopse indisponível.')).toBeTruthy();
  });

  test('Capa com erro vira placeholder e o crédito da imagem fica reservado', async () => {
    const { li } = await abrirSeries({ enriquecedor: { enriquecer: async () => new Map([['Q801', ENRIQ]]) } });
    const img = await vi.waitFor(() => { const i = li().querySelector('img'); if (!i) throw new Error('sem img'); return i; });
    await act(async () => { fireEvent.error(img); });
    expect(li().querySelector('.capa')?.classList.contains('placeholder')).toBe(true);
    expect(li().querySelector('.credito-imagem')?.classList.contains('reservado')).toBe(true);
  });

  test('Seção com categorias', async () => {
    const { li, fetchImpl } = await abrirSeries({ worker: () => resposta({ resultados: { Q801: { status: 'ok', link: 'https://www.themoviedb.org/tv/4001/watch?locale=BR', flatrate: PROV.flatrate, rent: PROV.rent, buy: [], ads: [], free: [] } } }) });
    const secao = await vi.waitFor(() => { const s = li().querySelector('.provedores .categoria, .provedores'); if (!s || !/Assinatura/.test(li().textContent!)) throw new Error('aguardando'); return li().querySelector('.provedores')!; });
    expect(secao.textContent).toContain('Assinatura');
    expect(secao.textContent).toContain('Aluguel');
    expect(secao.textContent).toContain('Onde assistir: JustWatch via TMDB');
    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.searchParams.get('tipo')).toBe('serie');
    expect(url.searchParams.get('tmdb')).toBe('4001');
  });

  const falhas: [string, (url: string) => any][] = [
    ['rejeição', () => { throw new Error('rede'); }],
    ['HTTP 500', () => resposta({}, 500)],
    ['sem-tmdb', () => resposta({ resultados: { Q801: { status: 'sem-tmdb' } } })],
  ];
  for (const [nome, worker] of falhas) {
    test(`Caminhos de erro mantêm o card: ${nome}`, async () => {
      const { li } = await abrirSeries({ worker, enriquecedor: { enriquecer: async () => new Map([['Q801', ENRIQ]]) } });
      await vi.waitFor(() => { if (!/Sem dados de onde assistir no Brasil/.test(li().textContent!)) throw new Error('aguardando'); });
      const card = li();
      expect(card.querySelector('h2')?.textContent).toBe('Liberdade Vigiada');
      expect(card.querySelector('.linha-serie')?.textContent).toMatch(/^Finalizada/);
      expect(card.querySelector('.meta')?.textContent).toMatch(/^2008/);
      expect(card.querySelector('.sinopse')?.textContent).toContain('Uma sinopse de série.');
      expect(card.querySelectorAll('.links a').length).toBeGreaterThan(0);
      expect(card.querySelector('.capa img')).not.toBeNull();
    });
  }
});
