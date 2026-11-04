// Camada de DOM da página (design.md D4). Toda inserção usa createElement e textContent.

import { carregarDados, formatarData } from './dados.mjs';
import { listarGeneros, recomendar } from './recomendar.mjs';
import { criarEnriquecedor } from './enriquecer.mjs';
import { criarSessaoLista } from './lista.mjs';
import { criarProvedores } from './provedores.mjs';
import { URL_WORKER } from './config.mjs';
import { inicializar } from './inicializar.mjs';

const el = (id) => document.getElementById(id);

const estado = { humores: null, filmes: null, generos: [], anteriores: [], sessao: null };
const enriquecedor = criarEnriquecedor({ fetchImpl: (url, opcoes) => fetch(url, opcoes), logger: console });
const provedores = criarProvedores({ urlWorker: URL_WORKER, fetchImpl: (url, opcoes) => fetch(url, opcoes), logger: console });
let contadorSinopse = 0;
let contadorCategoria = 0;

function criar(tag, texto, atributos = {}) {
  const no = document.createElement(tag);
  if (texto !== undefined) no.textContent = texto;
  for (const [nome, valor] of Object.entries(atributos)) no.setAttribute(nome, valor);
  return no;
}

function humorMarcado() {
  const marcado = document.querySelector('input[name="humor"]:checked');
  return marcado ? marcado.value : null;
}

function atualizarBotao() {
  el('recomendar').disabled = !(estado.humores && humorMarcado());
}

function limparResultado() {
  estado.sessao?.invalidar();
  el('lista').replaceChildren();
  el('resumo-lista').textContent = '';
  el('aviso').textContent = '';
  el('aviso').hidden = true;
  el('outras').hidden = true;
  estado.anteriores = [];
}

function montarHumores(humores) {
  const container = el('humores');
  for (const humor of humores.humores) {
    const linha = criar('div', undefined, { class: 'opcao' });
    const id = `humor-${humor.id}`;
    const rotulo = criar('label', undefined, { for: id });
    rotulo.append(
      criar('span', humor.emoji, { class: 'emoji', 'aria-hidden': 'true' }),
      document.createTextNode(humor.rotulo),
    );
    linha.append(
      criar('input', undefined, { type: 'radio', name: 'humor', id, value: humor.id }),
      rotulo,
    );
    container.append(linha);
  }
}

function montarGeneros(generos) {
  const select = el('genero');
  for (const g of generos) select.append(criar('option', g.rotulo, { value: g.qid }));
}

function criarLink(texto, href, atributosLink) {
  return criar('a', texto, { href, ...atributosLink });
}

function criarPlaceholder() {
  return criar('div', undefined, { class: 'capa placeholder', 'aria-hidden': 'true' });
}

function desenharCapa(capa, li) {
  if (!capa) return criarPlaceholder();
  const caixa = criar('div', undefined, { class: 'capa' });
  const imagem = criar('img', undefined, {
    loading: capa.loading, referrerpolicy: capa.referrerPolicy,
    src: capa.src, alt: capa.alt, width: capa.width, height: capa.height,
  });
  imagem.addEventListener('error', () => {
    caixa.replaceWith(criarPlaceholder());
    li.querySelector('.credito-imagem')?.replaceWith(reservaCredito());
  });
  caixa.append(imagem);
  return caixa;
}

function desenharSinopse(card, bloco = criar('div', undefined, { class: 'sinopse-bloco' })) {
  const id = `sinopse-${contadorSinopse += 1}`;
  const texto = criar('p', undefined, { class: 'sinopse', id });
  const conteudo = criar('span', card.sinopse);
  if (card.lang) conteudo.setAttribute('lang', card.lang);
  if (card.marcaIdioma) {
    const marca = criar('span', card.marcaIdioma, { class: 'marca-idioma' });
    texto.append(marca, ' ', conteudo);
  } else {
    texto.append(conteudo);
  }
  const botao = criar('button', 'Ler mais', { type: 'button', class: 'ler-mais', 'aria-expanded': 'false', 'aria-controls': id });
  botao.hidden = true;
  botao.addEventListener('click', () => {
    const aberta = texto.classList.toggle('expandida');
    botao.textContent = aberta ? 'Ler menos' : 'Ler mais';
    botao.setAttribute('aria-expanded', String(aberta));
  });
  const credito = criar('p', undefined, { class: 'credito' });
  credito.append('Sinopse: ', criarLink('Wikipédia', card.creditoUrl, card.atributosLink), ' (', criarLink('CC BY-SA', card.licencaUrl, card.atributosLink), ')');
  bloco.append(texto, botao, credito);
  // O "Ler mais" só aparece se o texto passa das 4 linhas recolhidas.
  requestAnimationFrame(() => {
    botao.hidden = !(texto.scrollHeight > texto.clientHeight);
  });
  return bloco;
}

function desenharCreditoImagem(card, credito = criar('p', undefined, { class: 'credito-imagem' })) {
  credito.append('Imagem: ', criarLink('Wikipédia', card.creditoImagemUrl, card.atributosLink));
  return credito;
}

// Esqueletos vazios com altura mínima: reservam o espaço da sinopse e do crédito antes do enriquecimento (R-2).
const reservaSinopse = () => criar('div', undefined, { class: 'sinopse-bloco reservado', 'aria-hidden': 'true' });
const reservaCredito = () => criar('p', undefined, { class: 'credito-imagem reservado', 'aria-hidden': 'true' });

// Conteúdo da seção "Onde assistir" (design D-10): só createElement, textContent e setAttribute; nada do Worker vira HTML.
function conteudoProvedores(secao) {
  if (secao.estado !== 'com-dados') return [criar('p', secao.texto, { class: 'estado-provedores' })];
  const { atribuicao } = secao;
  const rotuloAtribuicao = criar('p', undefined, { class: 'atribuicao-provedores' });
  rotuloAtribuicao.append(atribuicao.url
    ? criarLink(atribuicao.texto, atribuicao.url, { target: atribuicao.target, rel: atribuicao.rel })
    : criar('span', atribuicao.texto));
  const categorias = secao.categorias.map((categoria) => {
    const idRotulo = `categoria-provedores-${contadorCategoria += 1}`;
    const lista = criar('ul', undefined, { class: 'lista-provedores', 'aria-labelledby': idRotulo });
    for (const p of categoria.provedores) {
      const item = criar('li');
      if (p.logo) {
        item.append(criar('img', undefined, {
          loading: p.logo.loading, referrerpolicy: p.logo.referrerPolicy,
          src: p.logo.src, alt: p.logo.alt, width: p.logo.width, height: p.logo.height,
        }));
      } else {
        item.append(criar('span', p.nome, { class: 'nome-provedor' }));
      }
      lista.append(item);
    }
    const bloco = criar('div', undefined, { class: 'categoria-provedores' });
    bloco.append(criar('p', categoria.rotulo, { class: 'rotulo-categoria', id: idRotulo }), lista);
    return bloco;
  });
  return [rotuloAtribuicao, ...categorias];
}

// Ordem do card (design D-11): capa, título, meta, sinopse com crédito, crédito da imagem, links e, só com o
// Worker configurado, a seção de provedores (FILMELIER-3).
function desenharItem(card, { reservar = false } = {}) {
  // Com o Worker ligado o título pt-BR pode chegar depois: o bloco do título reserva 2 linhas e a linha do título
  // original fica sempre presente (vazia e aria-hidden quando não usada), então a troca não desloca o layout.
  const li = criar('li', undefined, { class: card.provedores ? 'card titulo-reservado' : 'card' });
  li.append(desenharCapa(card.capa, li));
  const blocoTitulo = criar('div', undefined, { class: 'bloco-titulo' });
  blocoTitulo.append(criar('h2', card.titulo));
  if (card.provedores) blocoTitulo.append(criar('p', undefined, { class: 'titulo-original', 'aria-hidden': 'true' }));
  li.append(blocoTitulo);
  li.append(criar('p', `${card.ano} · ${card.generos.join(', ')}`, { class: 'meta' }));
  if (card.sinopse) li.append(desenharSinopse(card));
  else if (reservar) li.append(reservaSinopse());
  if (card.creditoImagemUrl) li.append(desenharCreditoImagem(card));
  else if (reservar) li.append(reservaCredito());
  const links = criar('p', undefined, { class: 'links' });
  for (const l of card.links) {
    links.append(criar('a', l.texto, { href: l.href, target: l.target, rel: l.rel }));
  }
  li.append(links);
  if (card.provedores) {
    const secao = criar('div', undefined, { class: 'provedores', role: 'group', 'aria-label': 'Onde assistir no Brasil' });
    secao.append(...conteudoProvedores(card.provedores));
    li.append(secao);
  }
  return li;
}

// Título pt-BR do Worker, no lugar: só o texto do h2 e da linha reservada (textContent); li, foco e #resumo-lista intactos.
function atualizarTitulo(li, card) {
  const h2 = li.querySelector('h2');
  if (h2 && h2.textContent !== card.titulo) h2.textContent = card.titulo;
  const linha = li.querySelector('.titulo-original');
  if (!linha) return;
  linha.textContent = card.tituloOriginalTexto ?? '';
  if (card.tituloOriginalTexto) linha.removeAttribute('aria-hidden');
  else linha.setAttribute('aria-hidden', 'true');
}

// Troca só o conteúdo da seção de provedores do li, no lugar: o li, os links e o foco não são tocados.
function atualizarProvedores(li, secao) {
  li.querySelector('.provedores')?.replaceChildren(...conteudoProvedores(secao));
}

// Chamada só para a geração atual, pela notificação própria dos provedores (separada do enriquecimento).
function aplicarProvedores(cards) {
  [...el('lista').children].forEach((li, i) => {
    if (!cards[i]?.provedores) return;
    atualizarTitulo(li, cards[i]);
    atualizarProvedores(li, cards[i].provedores);
  });
  performance.mark('filmelier:provedores-fim');
  performance.measure('filmelier:provedores', 'filmelier:provedores-inicio', 'filmelier:provedores-fim');
}

// Atualiza o li existente no lugar (R-1): só troca a capa e preenche ou remove os esqueletos, sem recriar
// o card. Os links ficam intactos, então o foco do teclado e o "Ler mais" aberto não se perdem.
function atualizarItem(li, card) {
  const capaAtual = li.querySelector('.capa');
  if (card.capa && capaAtual?.classList.contains('placeholder')) capaAtual.replaceWith(desenharCapa(card.capa, li));
  const blocoReservado = li.querySelector('.sinopse-bloco.reservado');
  if (blocoReservado) {
    blocoReservado.classList.remove('reservado');
    blocoReservado.removeAttribute('aria-hidden');
    if (card.sinopse) desenharSinopse(card, blocoReservado);
    else blocoReservado.append(criar('p', 'Sinopse indisponível.', { class: 'sinopse-indisponivel' }));
  }
  // Sem capa o crédito da imagem continua reservado (vazio, aria-hidden): a altura do card não muda.
  const creditoReservado = li.querySelector('.credito-imagem.reservado');
  if (creditoReservado && card.creditoImagemUrl) {
    creditoReservado.classList.remove('reservado');
    creditoReservado.removeAttribute('aria-hidden');
    desenharCreditoImagem(card, creditoReservado);
  }
}

function mostrar(resultado) {
  const aviso = el('aviso');
  const texto = resultado.nivel === 'nenhum' ? resultado.mensagem : resultado.aviso;
  aviso.textContent = texto;
  aviso.hidden = texto === '';
  // O lote de provedores parte dentro de exibir: a marca de início vem antes (FILMELIER-3, design D-11).
  if (provedores.ativo) performance.mark('filmelier:provedores-inicio');
  const { cards } = estado.sessao.exibir(resultado);
  el('lista').replaceChildren(...cards.map((c) => desenharItem(c, { reservar: true })));
  // Região live curta (R-1): só a nova lista de títulos, nunca as sinopses.
  const lista = cards.length > 0 ? `${cards.length} ${cards.length === 1 ? 'sugestão' : 'sugestões'}: ${cards.map((c) => c.titulo).join(', ')}.` : '';
  el('resumo-lista').textContent = [texto, lista].filter(Boolean).join(' ');
  estado.anteriores = resultado.filmes.map((f) => f.qid);
  el('outras').hidden = resultado.nivel === 'nenhum';
  requestAnimationFrame(() => {
    performance.mark('filmelier:lista-renderizada');
    performance.measure('filmelier:recomendar', 'filmelier:recomendar-inicio', 'filmelier:lista-renderizada');
  });
}

// Chamada só para a geração atual (design D-6): troca os placeholders por capa e sinopse.
function aplicarEnriquecimento(cards) {
  // A geração atual garante a mesma lista de filmes; qualquer troca passa por mostrar ou limparResultado.
  [...el('lista').children].forEach((li, i) => cards[i] && atualizarItem(li, cards[i]));
  performance.mark('filmelier:enriquecimento-fim');
  performance.measure('filmelier:enriquecimento', 'filmelier:recomendar-inicio', 'filmelier:enriquecimento-fim');
}

function sugerir(comAnteriores) {
  const humorId = humorMarcado();
  if (!humorId || !estado.humores) return;
  performance.mark('filmelier:recomendar-inicio');
  const generoQid = el('genero').value || null;
  mostrar(recomendar({
    filmes: estado.filmes.filmes,
    humores: estado.humores,
    humorId,
    generoQid,
    rng: Math.random,
    anteriores: comAnteriores ? estado.anteriores : [],
  }));
}

// Estado de erro da página (design D-7): sem humores, gênero só com "Qualquer gênero", botão desabilitado.
function entrarEmErro() {
  estado.humores = null;
  estado.filmes = null;
  estado.sessao = null;
  el('humores').replaceChildren();
  const select = el('genero');
  while (select.options.length > 1) select.remove(1);
  el('data-geracao').textContent = '';
  el('erro').hidden = false;
  atualizarBotao();
}

function desenharPagina(dados) {
  if (dados.erro) {
    el('erro').hidden = false;
    atualizarBotao();
    return;
  }
  estado.humores = dados.humores;
  estado.filmes = dados.filmes;
  estado.generos = listarGeneros(dados.humores);
  estado.sessao = criarSessaoLista({
    enriquecedor, generos: estado.generos, aoAtualizar: aplicarEnriquecimento, provedores, aoProvedores: aplicarProvedores,
  });
  montarHumores(dados.humores);
  montarGeneros(estado.generos);
  el('data-geracao').textContent = formatarData(dados.filmes.meta.geradoEm);
  performance.mark('filmelier:dados-carregados');
  atualizarBotao();
}

// A sequência (carregar, desenhar, cair em erro se algo lançar) vive em inicializar.mjs, sem DOM e testada.
function iniciar() {
  return inicializar({
    carregar: () => carregarDados(fetch, console),
    desenhar: desenharPagina,
    entrarEmErro,
    logger: console,
  });
}

el('formulario').addEventListener('submit', (evento) => {
  evento.preventDefault();
  sugerir(false);
});
el('outras').addEventListener('click', () => sugerir(true));
el('formulario').addEventListener('change', () => {
  limparResultado();
  atualizarBotao();
});

iniciar();
