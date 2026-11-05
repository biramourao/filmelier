import { describe, expect, test } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { Card } from '../../src/ui/Card';
import { montarCard } from '../../src/card.mjs';
import { montarItem } from '../../src/item.mjs';
import { LISTA_TAGS, criarFilmes } from './fixtures';

const generos = [{ qid: 'Q1', rotulo: 'Comédia' }, { qid: 'Q2', rotulo: 'Animação' }, { qid: 'Q3', rotulo: 'Ação' }];
const agendar = (retorno: () => void) => retorno();

const ENRIQUECIMENTO = {
  idioma: 'pt', sinopse: 'Uma sinopse de teste.', capaUrl: 'https://upload.wikimedia.org/capa.jpg', artigoUrl: 'https://pt.wikipedia.org/wiki/Teste',
};

const PROVEDORES = {
  status: 'ok',
  link: 'https://www.themoviedb.org/movie/1/watch?locale=BR',
  flatrate: [{ provider_id: 1, provider_name: 'Netflix', logo_path: '/abc.jpg', display_priority: 1 }],
  rent: [{ provider_id: 2, provider_name: '<b>Locadora</b>', logo_path: 'invalido', display_priority: 2 }],
};

function filmeComTudo() {
  return { ...criarFilmes()[0], oscarVitorias: 1, oscarIndicacoes: 2 };
}

function modelo(filme: any, enriquecimento: any = null, provedores: any = null, tags: any = { lista: LISTA_TAGS, incluir: [] }) {
  return montarCard(montarItem(filme, generos), enriquecimento, provedores, tags);
}

function renderizar(card: any, enriquecido = true) {
  const tela = render(<ul><Card card={card} enriquecido={enriquecido} agendarQuadro={agendar} /></ul>);
  return { ...tela, li: tela.container.querySelector('li.card') as HTMLElement };
}

const classes = (no: Element) => no.className.split(' ')[0];

describe('AC-4: ordem dos blocos do card', () => {
  test('card completo: capa, título, meta, tags, Oscar, sinopse, crédito da imagem, links e provedores', () => {
    const { li } = renderizar(modelo(filmeComTudo(), ENRIQUECIMENTO, PROVEDORES));
    const ordem = [...li.children].map((no) => (no.tagName === 'DIV' ? classes(no) : `${no.tagName.toLowerCase()}.${classes(no)}`));
    expect(ordem).toEqual(['capa', 'bloco-titulo', 'p.meta', 'ul.tags-filme', 'p.oscar', 'sinopse-bloco', 'p.credito-imagem', 'p.links', 'provedores']);
    expect(li.querySelector('h2')?.textContent).toBe('Comédia 1');
    expect(li.querySelector('.meta')?.textContent).toBe('1991 · Animação · Nota 7,0');
  });

  test('card sem tags e sem Oscar não tem a lista de tags nem o selo, e termina nos links sem Worker', () => {
    const { li } = renderizar(modelo({ ...criarFilmes()[10] }, ENRIQUECIMENTO), true);
    expect(li.querySelector('ul.tags-filme')).toBeNull();
    expect(li.querySelector('.oscar')).toBeNull();
    expect(li.lastElementChild?.classList.contains('links')).toBe(true);
    expect(li.querySelector('.provedores')).toBeNull();
  });

  test('a lista de tags do card não tem button nem a', () => {
    const { li } = renderizar(modelo(filmeComTudo()));
    const tags = li.querySelector('ul.tags-filme')!;
    expect(tags.getAttribute('aria-label')).toBe('Tags do filme');
    expect(tags.querySelectorAll('li').length).toBeGreaterThan(0);
    expect(tags.querySelectorAll('button, a').length).toBe(0);
  });

  test('selo do Oscar em linha própria, com emoji decorativo antes do texto', () => {
    const { li } = renderizar(modelo(filmeComTudo()));
    const selo = li.querySelector('p.oscar')!;
    expect(selo.querySelector('.emoji')?.getAttribute('aria-hidden')).toBe('true');
    expect(selo.textContent).toContain('Venceu 1 Oscar · indicado em 2 categorias');
  });

  test('links Wikidata e IMDb abrem em nova aba com rel noopener noreferrer', () => {
    const { li } = renderizar(modelo(filmeComTudo(), ENRIQUECIMENTO));
    const links = [...li.querySelectorAll('a')];
    expect(links.length).toBeGreaterThanOrEqual(5);
    for (const a of links) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    }
    expect([...li.querySelectorAll('.links a')].map((a) => a.textContent)).toEqual(['Wikidata', 'IMDb']);
  });
});

describe('AC-6: capa, sinopse e provedores', () => {
  test('a imagem declara loading antes de src e o crédito de sinopse tem os 2 links', () => {
    const { li } = renderizar(modelo(filmeComTudo(), ENRIQUECIMENTO));
    const nomes = li.querySelector('img')!.getAttributeNames();
    expect(nomes.indexOf('loading')).toBeGreaterThanOrEqual(0);
    expect(nomes.indexOf('loading')).toBeLessThan(nomes.indexOf('src'));
    expect(li.querySelector('img')!.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(li.querySelector('.credito')?.textContent).toBe('Sinopse: Wikipédia (CC BY-SA)');
    expect(li.querySelector('.credito-imagem')?.textContent).toBe('Imagem: Wikipédia');
  });

  test('sinopse em inglês leva a marca (en) fora do lang e o texto com lang="en"', () => {
    const { li } = renderizar(modelo(filmeComTudo(), { ...ENRIQUECIMENTO, idioma: 'en' }));
    const p = li.querySelector('p.sinopse')!;
    expect(p.querySelector('.marca-idioma')?.textContent).toBe('(en)');
    expect(p.querySelector('.marca-idioma')?.closest('[lang]')).toBeNull();
    expect(p.querySelector('[lang="en"]')?.textContent).toBe(ENRIQUECIMENTO.sinopse);
  });

  test('provedores: último filho do card, categorias com aria-labelledby e nome com marcação vira texto', () => {
    const { li } = renderizar(modelo(filmeComTudo(), ENRIQUECIMENTO, PROVEDORES));
    const secao = li.lastElementChild!;
    expect(secao.classList.contains('provedores')).toBe(true);
    expect(secao.getAttribute('role')).toBe('group');
    expect(secao.getAttribute('aria-label')).toBe('Onde assistir no Brasil');
    const listas = [...secao.querySelectorAll('ul.lista-provedores')];
    expect(listas.length).toBe(2);
    for (const ul of listas) {
      const rotulo = li.ownerDocument.getElementById(ul.getAttribute('aria-labelledby')!);
      expect(rotulo?.classList.contains('rotulo-categoria')).toBe(true);
    }
    expect([...secao.querySelectorAll('.rotulo-categoria')].map((n) => n.textContent)).toEqual(['Assinatura', 'Aluguel']);
    expect(secao.querySelector('b')).toBeNull();
    expect(secao.querySelector('.nome-provedor')?.textContent).toBe('<b>Locadora</b>');
    expect(secao.querySelector('img')?.getAttribute('alt')).toBe('Netflix');
    expect(secao.querySelector('.atribuicao-provedores a')?.textContent).toBe('Onde assistir: JustWatch via TMDB');
  });

  test('provedores no estado "buscando" e "sem dados" mostram só o texto', () => {
    const buscando = renderizar(modelo(filmeComTudo(), null, { estado: 'buscando' }));
    expect(buscando.li.querySelector('.estado-provedores')?.textContent).toBe('Buscando onde assistir no Brasil');
    buscando.unmount();
    const sem = renderizar(modelo(filmeComTudo(), null, { status: 'sem-dados' }));
    expect(sem.li.querySelector('.estado-provedores')?.textContent).toBe('Sem dados de onde assistir no Brasil');
  });

  test('título reservado: linha do título original sempre presente, vazia e aria-hidden quando não usada', () => {
    const { li } = renderizar(modelo(filmeComTudo(), null, { estado: 'buscando' }));
    expect(li.classList.contains('titulo-reservado')).toBe(true);
    const linha = li.querySelector('.titulo-original')!;
    expect(linha.textContent).toBe('');
    expect(linha.getAttribute('aria-hidden')).toBe('true');
  });

  test('sem enriquecimento a capa é placeholder aria-hidden e o crédito e a sinopse ficam reservados', () => {
    const { li } = renderizar(modelo(filmeComTudo()), false);
    expect(li.querySelector('.capa')?.classList.contains('placeholder')).toBe(true);
    expect(li.querySelector('.capa')?.getAttribute('aria-hidden')).toBe('true');
    expect(li.querySelector('.sinopse-bloco')?.classList.contains('reservado')).toBe(true);
    expect(li.querySelector('.sinopse-bloco')?.getAttribute('aria-hidden')).toBe('true');
    expect(li.querySelector('.credito-imagem')?.classList.contains('reservado')).toBe(true);
  });

  test('erro da imagem troca a capa pelo placeholder e o crédito pela reserva', () => {
    const { li } = renderizar(modelo(filmeComTudo(), ENRIQUECIMENTO));
    fireEvent.error(li.querySelector('img')!);
    expect(li.querySelector('img')).toBeNull();
    expect(li.querySelector('.capa')?.classList.contains('placeholder')).toBe(true);
    expect(li.querySelector('.credito-imagem')?.classList.contains('reservado')).toBe(true);
    expect(li.querySelector('.credito-imagem')?.textContent).toBe('');
  });
});
