import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { criarEnriquecedor } from '../src/enriquecer.mjs';
import { criarProvedores } from '../src/provedores.mjs';
import { criarSessaoLista } from '../src/lista.mjs';
import { listarGeneros, recomendar } from '../src/recomendar.mjs';
import { alternar, filtroDoEstado, listaDeTags, montarChips, montarControles } from '../src/tags.mjs';
import { URL_WORKER } from '../src/config.mjs';

const raiz = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
// Só arquivos, recursivo: com src/ui/ (FILMELIER-5) um diretório não pode quebrar a leitura.
const arquivosDe = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? arquivosDe(join(dir, e.name)) : [join(dir, e.name)]));
const fonteSrc = arquivosDe(`${raiz}/src`).map((arq) => readFileSync(arq, 'utf8')).join('\n');
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

test('AC-15: nenhuma ocorrência de api.themoviedb.org em src/ (a CSP do build é testada em tests/dist)', () => {
  assert.ok(!fonteSrc.includes('api.themoviedb.org'));
});

test('AC-16: textos novos em pt-BR presentes em src/', () => {
  const fonte = fonteSrc;
  for (const texto of [
    'Temas (opcional)', 'Quero ', 'Não quero ', '+ quero · \u2212 não quero',
    'Nenhum filme com esses temas. Tente incluir outro tema ou desfazer um "não quero".',
    'Nenhum filme com esses temas e filtros. Tente incluir outro tema, desfazer um "não quero", ampliar o período, baixar a nota mínima ou mudar o filtro de Oscar.',
  ]) assert.ok(fonte.includes(texto), texto);
});

test('AC-16: nenhum texto de chip ou do grupo é igual a uma keyword de data/temas.json', () => {
  const keywords = new Set([...temas.temas, ...temas.climas].flatMap((t) => t.keywords).concat(temas.ignorar));
  const lista = listaDeTags({ temas: { lista: [...temas.temas, ...temas.climas].map((t) => ({ id: t.id, rotulo: t.rotulo, filmes: 25 })) } });
  const textos = ['Temas (opcional)', 'Quero', 'Não quero'];
  for (const c of montarControles(lista, new Map())) textos.push(...c.botoes.flatMap((b) => [b.icone, b.nome]));
  const candidatos = lista.map((t) => ({ tags: [t.id] }));
  for (const c of montarChips({ candidatos, estado: new Map(), lista })) textos.push(c.rotulo);
  for (const t of textos) assert.ok(!keywords.has(t.toLowerCase()) && !keywords.has(t), t);
});

test('AC-11: nenhuma ocorrência de "menos disso" em src/', () => {
  assert.ok(!fonteSrc.toLowerCase().includes('menos disso'));
});
