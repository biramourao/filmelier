import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { criarEnriquecedor } from '../src/enriquecer.mjs';
import { criarProvedores } from '../src/provedores.mjs';
import { criarSessaoLista } from '../src/lista.mjs';
import { listarGeneros, recomendar } from '../src/recomendar.mjs';
import { alternar, filtroDoEstado, listaDeTags, montarChips, montarControles } from '../src/tags.mjs';
import { URL_WORKER } from '../src/config.mjs';
import { cspEsperada } from './apoio/csp.mjs';

const raiz = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const html = readFileSync(`${raiz}/index.html`, 'utf8');
const fonteSrc = readdirSync(`${raiz}/src`).map((n) => readFileSync(`${raiz}/src/${n}`, 'utf8')).join('\n');
const temas = JSON.parse(readFileSync(`${raiz}/data/temas.json`, 'utf8'));
const humores = JSON.parse(readFileSync(`${raiz}/data/humores.json`, 'utf8'));

test('AC-15: tags escolhidas (2 incluídas e 1 excluída) não aparecem em nenhuma URL externa, inclusive a do Worker', async () => {
  const urls = [];
  const fetchImpl = async (url) => { urls.push(String(url)); return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({}) }; };
  const logger = { warn() {}, error() {} };
  const provedores = criarProvedores({ urlWorker: URL_WORKER, fetchImpl, logger });
  assert.equal(provedores.ativo, true);
  const lista = [
    { id: 'bruxaria', rotulo: 'Bruxaria', filmes: 40 }, { id: 'conto-de-fadas', rotulo: 'Conto de fadas', filmes: 40 },
    { id: 'sombrio', rotulo: 'Clima sombrio', filmes: 40 },
  ];
  let estado = alternar(alternar(alternar(new Map(), 'bruxaria', 'incluir'), 'conto-de-fadas', 'incluir'), 'sombrio', 'excluir');
  const filmes = Array.from({ length: 8 }, (_, i) => ({ qid: `Q${100 + i}`, titulo: `F${i}`, ano: 2000, generos: ['Q157394'], sitelinks: 50 - i, imdb: `tt${1000000 + i}`, tags: ['bruxaria'], clima: 'leve' }));
  const resultado = recomendar({ filmes, humores, humorId: 'aventura', rng: () => 0.5, tagsValidas: lista.map((t) => t.id), ...filtroDoEstado(estado) });
  assert.ok(resultado.filmes.length > 0);
  const sessao = criarSessaoLista({
    enriquecedor: criarEnriquecedor({ fetchImpl, logger }), generos: listarGeneros(humores), aoAtualizar() {}, provedores, aoProvedores() {},
    lista, incluirAtual: () => filtroDoEstado(estado).incluir,
  });
  const { concluido, concluidoProvedores } = sessao.exibir(resultado);
  await Promise.all([concluido, concluidoProvedores]);
  assert.ok(urls.length > 0, 'a sessão fez requisições externas');
  for (const url of urls) {
    const decodificada = decodeURIComponent(url).toLowerCase();
    for (const id of ['bruxaria', 'conto-de-fadas', 'sombrio', 'incluir', 'excluir']) assert.ok(!decodificada.includes(id), `${id} em ${url}`);
  }
  estado = null;
});

test('AC-15: CSP igual à vigente (origem do Worker de config.mjs) e nenhuma ocorrência de api.themoviedb.org em src/ e index.html', () => {
  const m = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(html);
  assert.equal(m[1].replace(/\s+/g, ' ').trim(), cspEsperada(URL_WORKER));
  assert.ok(!fonteSrc.includes('api.themoviedb.org') && !html.includes('api.themoviedb.org'));
});

test('AC-16: textos novos em pt-BR presentes em src/ e index.html', () => {
  const fonte = `${fonteSrc}\n${html}`;
  for (const texto of [
    'Temas (opcional)', "'Menos'",
    'Nenhum filme com esses temas. Tente incluir outro tema ou desfazer um "menos disso".',
    'Nenhum filme com esses temas e filtros. Tente incluir outro tema, desfazer um "menos disso", ampliar o período, baixar a nota mínima ou mudar o filtro de Oscar.',
  ]) assert.ok(fonte.includes(texto), texto);
});

test('AC-16: nenhum texto de chip ou do grupo é igual a uma keyword de data/temas.json', () => {
  const keywords = new Set([...temas.temas, ...temas.climas].flatMap((t) => t.keywords).concat(temas.ignorar));
  const lista = listaDeTags({ temas: { lista: [...temas.temas, ...temas.climas].map((t) => ({ id: t.id, rotulo: t.rotulo, filmes: 25 })) } });
  const textos = ['Temas (opcional)', 'Menos'];
  for (const c of montarControles(lista, new Map())) textos.push(...c.botoes.flatMap((b) => [b.texto, b.nome]));
  const candidatos = lista.map((t) => ({ tags: [t.id] }));
  for (const c of montarChips({ candidatos, estado: new Map(), lista })) textos.push(c.rotulo);
  for (const t of textos) assert.ok(!keywords.has(t.toLowerCase()) && !keywords.has(t), t);
});
