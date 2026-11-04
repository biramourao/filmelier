import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { cspEsperada } from './apoio/csp.mjs';
import { validarUrlWorker } from '../src/provedores.mjs';

const raiz = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
// `.github` fica fora das varreduras de segredo: o workflow referencia o segredo por expressão do Actions (nunca o valor).
// Ele tem teste próprio (tests/workflow-atualizar-base.test.mjs).
const EXCLUIDOS = new Set(['.git', '.github', '.studioai', '.studio', 'openspec', 'node_modules', '.claude']);

// Lista arquivos recursivamente a partir de um caminho (arquivo ou diretório).
function arquivos(caminho, excluidos = new Set()) {
  if (!existsSync(caminho)) return [];
  if (statSync(caminho).isFile()) return [caminho];
  return readdirSync(caminho, { withFileTypes: true }).flatMap((e) =>
    excluidos.has(e.name) ? [] : arquivos(join(caminho, e.name), excluidos));
}

function buscar(padrao, caminhos, excluidos) {
  const achados = [];
  for (const c of caminhos) {
    for (const arq of arquivos(join(raiz, c), excluidos)) {
      readFileSync(arq, 'utf8').split('\n').forEach((linha, i) => {
        if (padrao.test(linha)) achados.push(`${relative(raiz, arq)}:${i + 1}`);
      });
    }
  }
  return achados;
}

const html = readFileSync(join(raiz, 'index.html'), 'utf8');

test('AC-18: src/ e index.html sem innerHTML nem armazenamento ou rastreio', () => {
  const padrao = new RegExp(['innerHTML', 'localStorage', 'sessionStorage', 'document\\.cookie', 'sendBeacon'].join('|'));
  assert.deepEqual(buscar(padrao, ['src', 'index.html']), []);
});

test('AC-18: sem segredo no repositório, fora de .git, ledger e openspec', () => {
  // Padrão montado por fragmentos para este arquivo não casar com a própria busca.
  const palavras = [['api', '[_-]?', 'key'], ['sec', 'ret'], ['pass', 'word'], ['bear', 'er'], ['author', 'ization']];
  const padrao = new RegExp(`(${palavras.map((p) => p.join('')).join('|')})`, 'i');
  // data/filmes.json guarda títulos de filmes da Wikidata; ver DECISION.md D-impl-5.
  // Ele não é varrido como texto: só os campos que não são título entram na busca, abaixo.
  // `url.` + a propriedade da API URL (aceitarCapa recusa credenciais na URL da capa, FILMELIER-2 nit) não é segredo.
  const semApiUrl = { test: (linha) => padrao.test(linha.replaceAll('url.' + 'pass' + 'word', '')) };
  // FILMELIER-3: `worker/` fica fora desta busca porque o Worker precisa montar o cabeçalho de autorização do TMDB
  // (palavras do padrão). Ele tem varredura própria de token literal (varrerTokens, mais abaixo).
  assert.deepEqual(buscar(semApiUrl, ['.'], new Set([...EXCLUIDOS, 'filmes.json', 'worker'])), []);
  const dataset = JSON.parse(readFileSync(join(raiz, 'data/filmes.json'), 'utf8'));
  const semTitulos = JSON.stringify({ meta: dataset.meta, filmes: dataset.filmes.map(({ titulo, ...resto }) => resto) });
  assert.ok(!padrao.test(semTitulos));
});

test('AC-18: CSP default-src self declarada no index.html', () => {
  assert.match(html, /<meta\s+http-equiv="Content-Security-Policy"\s+content="[^"]*default-src 'self'/);
});

test('AC-21: html com lang pt-BR', () => {
  assert.match(html, /<html[^>]*\slang="pt-BR"/);
});

test('AC-19: aria-live polite, fieldset com legend e label[for] do gênero', () => {
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /<fieldset>[\s\S]*<legend>[^<]+<\/legend>[\s\S]*<\/fieldset>/);
  assert.match(html, /<label\s+for="genero"/);
  assert.match(html, /<select\s+id="genero"/);
  const app = readFileSync(join(raiz, 'src/app.mjs'), 'utf8');
  assert.match(app, /for: id/);
  assert.match(app, /type: 'radio'/);
});

test('AC-18: todo a com target _blank no index.html tem noopener e noreferrer', () => {
  const ancoras = html.match(/<a\s[^>]*>/g) ?? [];
  assert.ok(ancoras.length > 0);
  for (const a of ancoras.filter((x) => /target="_blank"/.test(x))) {
    assert.match(a, /rel="[^"]*noopener[^"]*"/);
    assert.match(a, /rel="[^"]*noreferrer[^"]*"/);
  }
});

test('AC-21: sem script externo no index.html', () => {
  const scripts = html.match(/<script\s[^>]*>/g) ?? [];
  for (const s of scripts) {
    const src = /src="([^"]+)"/.exec(s)?.[1];
    if (src) assert.ok(!/^(https?:)?\/\//.test(src), src);
  }
});

test('AC-13: scripts/ sem GROUP_CONCAT', () => {
  assert.deepEqual(buscar(/GROUP_CONCAT/, ['scripts']), []);
});

test('AC-10: src/ sem rótulo fixo de humor', () => {
  assert.deepEqual(buscar(/Leve e engraçado/, ['src']), []);
});

test('AC-21 e AC-22: sem configuração de outra hospedagem, credenciais nem chave pem', () => {
  for (const ausente of ['vercel.json', 'netlify.toml', '.aws', 'credentials']) {
    assert.ok(!existsSync(join(raiz, ausente)), ausente);
  }
  const pem = arquivos(raiz, EXCLUIDOS).filter((a) => a.endsWith('.pem') || a.endsWith('/credentials'));
  assert.deepEqual(pem, []);
});

test('AC-10 e AC-14: app liga a sessão da lista, as marcas de enriquecimento e o erro da capa', () => {
  const app = readFileSync(join(raiz, 'src/app.mjs'), 'utf8');
  assert.match(app, /criarSessaoLista\(/);
  assert.match(app, /criarEnriquecedor\(/);
  assert.match(app, /performance\.mark\('filmelier:enriquecimento-fim'\)/);
  assert.match(app, /performance\.measure\('filmelier:enriquecimento', 'filmelier:recomendar-inicio', 'filmelier:enriquecimento-fim'\)/);
  assert.match(app, /addEventListener\('error'/);
  assert.match(app, /invalidar\(\)/);
  assert.match(app, /aviso\.textContent = texto/);
});

test('AC-12: marcação da FILMELIER-1 preservada no index.html redesenhado', () => {
  assert.match(html, /<fieldset>\s*<legend>[^<]+<\/legend>/);
  assert.match(html, /<label\s+for="genero"/);
  assert.match(html, /<select\s+id="genero"/);
  assert.match(html, /<ul id="lista"><\/ul>/);
  assert.match(html, /<button[^>]*id="recomendar"[^>]*\sdisabled[\s>]/);
  assert.match(html, /<button[^>]*id="outras"[^>]*\shidden/);
  assert.match(html, /<p id="erro"[^>]*\shidden>/);
  assert.match(html, /<p id="aviso" hidden><\/p>/);
});

test('AC-11: iniciar tem try/catch com entrarEmErro e mantém os literais da FILMELIER-1', () => {
  const app = readFileSync(join(raiz, 'src/app.mjs'), 'utf8');
  assert.match(app, /function entrarEmErro\(\)/);
  assert.match(app, /inicializar\(\{[\s\S]*entrarEmErro,/);
  assert.match(app, /if \(dados\.erro\) \{\s*el\('erro'\)\.hidden = false;/);
  assert.match(app, /el\('data-geracao'\)\.textContent = formatarData\(dados\.filmes\.meta\.geradoEm\)/);
});

// FILMELIER-3 (design D-13): a CSP esperada sai de cspEsperada(URL_WORKER), lida de src/config.mjs.
// Trocar a URL do Worker exige mudar config.mjs e index.html no mesmo commit; este teste não precisa mudar.
const CSP_SEM_WORKER = "default-src 'self'; connect-src 'self' https://www.wikidata.org https://pt.wikipedia.org https://en.wikipedia.org; img-src 'self' https://upload.wikimedia.org https://image.tmdb.org; object-src 'none'; base-uri 'none'; form-action 'none'";

test('AC-8: cspEsperada com URL vazia é a string exata e com origem acrescenta só ao fim de connect-src', () => {
  assert.equal(cspEsperada(''), CSP_SEM_WORKER);
  const com = cspEsperada('https://exemplo.workers.dev');
  assert.equal(com, CSP_SEM_WORKER.replace("https://en.wikipedia.org;", 'https://en.wikipedia.org https://exemplo.workers.dev;'));
  assert.match(com, /connect-src [^;]* https:\/\/exemplo\.workers\.dev;/);
  assert.match(com, /img-src 'self' https:\/\/upload\.wikimedia\.org https:\/\/image\.tmdb\.org;/);
  assert.equal(com.split('https://exemplo.workers.dev').length, 2);
});

test('AC-8: CSP do index.html igual a cspEsperada(URL_WORKER de src/config.mjs)', () => {
  const casou = /export const URL_WORKER = '(.*)';/.exec(readFileSync(join(raiz, 'src/config.mjs'), 'utf8'));
  assert.ok(casou, 'a leitura de URL_WORKER em src/config.mjs não casou com a regex');
  const urlWorker = casou[1];
  if (urlWorker !== '') assert.equal(validarUrlWorker(urlWorker), true, 'URL_WORKER não vazio precisa passar em validarUrlWorker');
  const m = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(html);
  assert.ok(m, 'meta CSP');
  assert.equal(m[1].replace(/\s+/g, ' ').trim(), cspEsperada(urlWorker));
});

test('AC-13: meta referrer no-referrer e ordem do head (charset, viewport, CSP, referrer)', () => {
  assert.match(html, /<meta\s+name="referrer"\s+content="no-referrer"\s*\/?>/);
  const ordem = ['<meta charset', 'name="viewport"', 'Content-Security-Policy', 'name="referrer"'].map((t) => html.indexOf(t));
  assert.ok(ordem.every((i) => i >= 0));
  assert.deepEqual(ordem, [...ordem].sort((a, b) => a - b));
});

test('AC-13: src/ e index.html sem outerHTML, insertAdjacentHTML nem document.write', () => {
  assert.deepEqual(buscar(/outerHTML|insertAdjacentHTML|document\.write/, ['src', 'index.html']), []);
});

test('AC-13: nenhum atributo style no código (a CSP não tem style-src próprio)', () => {
  assert.deepEqual(buscar(/setAttribute\(\s*['"]style['"]|\.style\.|\sstyle=|style:/, ['src', 'index.html']), []);
});

test('AC-1: montarHumores monta span.emoji aria-hidden antes do texto do rótulo', () => {
  const app = readFileSync(join(raiz, 'src/app.mjs'), 'utf8');
  assert.match(app, /class: 'emoji'/);
  assert.match(app, /'aria-hidden': 'true'/);
  assert.match(app, /humor\.emoji/);
  assert.match(app, /type: 'radio', name: 'humor'/);
  assert.match(app, /for: id/);
});

test('AC-21 e AC-22: sem package.json ou sem dependencies e devDependencies', () => {
  const caminho = join(raiz, 'package.json');
  if (!existsSync(caminho)) return;
  const pacote = JSON.parse(readFileSync(caminho, 'utf8'));
  assert.ok(!('dependencies' in pacote) && !('devDependencies' in pacote));
});

// ---- R-1 e R-2 (code review): atualização no lugar, região live curta e espaço reservado ----
const app = readFileSync(join(raiz, 'src/app.mjs'), 'utf8');
const estilos = readFileSync(join(raiz, 'styles.css'), 'utf8');
const corpoDe = (fonte, nome) => {
  const ini = fonte.indexOf(`function ${nome}(`);
  assert.ok(ini >= 0, nome);
  const prox = fonte.indexOf('\nfunction ', ini + 1);
  return fonte.slice(ini, prox < 0 ? undefined : prox);
};

test('AC-19 Região live curta sem sinopses (R-1): a lista de cards fica fora de qualquer região aria-live; só um resumo curto é live', () => {
  assert.doesNotMatch(html, /<section[^>]*id="resultado"[^>]*aria-live/);
  assert.doesNotMatch(html, /<ul[^>]*aria-live/);
  assert.match(html, /<p\s+id="resumo-lista"[^>]*aria-live="polite"/);
  assert.match(html, /id="resumo-lista"[^>]*class="so-leitor"|class="so-leitor"[^>]*id="resumo-lista"/);
  assert.match(estilos, /\.so-leitor\s*\{[^}]*position:\s*absolute/);
});

test('R-1: mostrar anuncia só títulos no resumo; limparResultado esvazia o resumo', () => {
  assert.match(corpoDe(app, 'mostrar'), /el\('resumo-lista'\)\.textContent = /);
  assert.match(corpoDe(app, 'mostrar'), /cards\.map\(\(c\) => c\.titulo\)/);
  assert.match(corpoDe(app, 'limparResultado'), /el\('resumo-lista'\)\.textContent = ''/);
});

test('R-1: o enriquecimento atualiza cada li no lugar, sem replaceChildren da lista (foco preservado)', () => {
  const corpo = corpoDe(app, 'aplicarEnriquecimento');
  assert.doesNotMatch(corpo, /replaceChildren/);
  assert.doesNotMatch(corpo, /desenharItem/);
  assert.match(corpo, /atualizarItem\(/);
  const atualizar = corpoDe(app, 'atualizarItem');
  assert.doesNotMatch(atualizar, /\.links|querySelector\('\.links'\)\.(replace|remove)/);
  assert.doesNotMatch(atualizar, /\.replaceWith\(\s*desenharItem/);
});

test('R-2: o primeiro desenho reserva espaço da sinopse e do crédito da imagem, e o CSS dá altura mínima', () => {
  assert.match(corpoDe(app, 'desenharItem'), /reservaSinopse\(\)[\s\S]*reservaCredito\(\)/);
  assert.match(estilos, /\.credito-imagem\.reservado\s*\{[^}]*min-height:\s*[\d.]+rem/);
  assert.match(corpoDe(app, 'atualizarItem'), /\.reservado/);
});

test('R-10: #humores reserva altura para os chips nas 3 larguras antes de o JS montá-los', () => {
  const base = /#humores\s*\{[^}]*min-height:\s*[\d.]+rem/;
  assert.match(estilos, base);
  assert.match(estilos, /@media \(min-width: 32\.6rem\)\s*\{\s*#humores\s*\{[^}]*min-height:\s*[\d.]+rem/);
  assert.match(estilos, /@media \(min-width: 47\.2rem\)\s*\{\s*#humores\s*\{[^}]*min-height:\s*[\d.]+rem/);
});

test('R-11: o bloco de sinopse tem altura fixa (reservado e preenchido), liberada só quando expandido', () => {
  assert.match(estilos, /\.sinopse-bloco\s*\{[^}]*\bheight:\s*9\.8rem/);
  assert.doesNotMatch(estilos, /\.sinopse-bloco[^{]*\{[^}]*min-height/);
  assert.match(estilos, /\.sinopse-bloco:has\(\.sinopse\.expandida\)\s*\{[^}]*height:\s*auto/);
});

test('R-11: sem sinopse o esqueleto vira "Sinopse indisponível." e nenhum esqueleto é removido', () => {
  const atualizar = corpoDe(app, 'atualizarItem');
  assert.match(atualizar, /Sinopse indisponível\./);
  assert.doesNotMatch(atualizar, /\.remove\(\)/);
  assert.doesNotMatch(corpoDe(app, 'desenharCapa'), /\.credito-imagem'\)\?\.remove\(\)/);
  assert.match(corpoDe(app, 'desenharCapa'), /reservaCredito\(\)/);
});

test('nit: loading vem antes de src na imagem da capa e a marca "(en)" fica fora do elemento lang="en"', () => {
  const capa = corpoDe(app, 'desenharCapa');
  assert.ok(capa.indexOf('loading: capa.loading') < capa.indexOf('src: capa.src'));
  const sinopse = corpoDe(app, 'desenharSinopse');
  assert.doesNotMatch(sinopse, /texto\.append\(criar\('span', card\.marcaIdioma/);
  assert.match(sinopse, /card\.marcaIdioma/);
});

// ---- FILMELIER-3: seção de provedores no DOM (P-14) ----
test('AC-7: app cria os provedores com URL_WORKER e passa à sessão com a notificação própria', () => {
  assert.match(app, /import \{ URL_WORKER \} from '\.\/config\.mjs'/);
  assert.match(app, /criarProvedores\(\{ urlWorker: URL_WORKER,/);
  assert.match(app, /provedores, aoProvedores: aplicarProvedores/);
});

test('AC-7: aplicarProvedores atualiza no lugar e atualizarProvedores só troca o conteúdo da seção', () => {
  const aplicar = corpoDe(app, 'aplicarProvedores');
  assert.doesNotMatch(aplicar, /el\('lista'\)\.replaceChildren/);
  assert.doesNotMatch(aplicar, /desenharItem/);
  assert.match(aplicar, /atualizarProvedores\(/);
  const atualizar = corpoDe(app, 'atualizarProvedores');
  assert.match(atualizar, /querySelector\('\.provedores'\)/);
  assert.match(atualizar, /replaceChildren/);
  assert.doesNotMatch(atualizar, /\.links|resumo-lista|desenharItem|replaceWith/);
  assert.doesNotMatch(atualizar, /focus\(/);
});

test('AC-7: a seção de provedores é o último filho do li, depois dos links, e só com provedores no card', () => {
  const item = corpoDe(app, 'desenharItem');
  assert.ok(item.indexOf('li.append(links)') < item.indexOf("class: 'provedores'"));
  assert.match(item, /if \(card\.provedores\)/);
  assert.ok(item.indexOf("class: 'provedores'") < item.indexOf('return li'));
});

test('R-6: cada rótulo de categoria liga ao seu ul por aria-labelledby e a seção tem nome acessível', () => {
  const conteudo = corpoDe(app, 'conteudoProvedores');
  assert.match(conteudo, /'aria-labelledby': idRotulo/);
  assert.match(conteudo, /class: 'rotulo-categoria', id: idRotulo/);
  assert.match(conteudo, /`categoria-provedores-\$\{contadorCategoria \+= 1\}`/);
  const item = corpoDe(app, 'desenharItem');
  assert.match(item, /role: 'group'/);
  assert.match(item, /'aria-label': 'Onde assistir no Brasil'/);
});

test('AC-7: .provedores reserva altura com min-height em rem, quebra de linha e logos de 46 px', () => {
  assert.match(estilos, /\.provedores\s*\{[^}]*min-height:\s*[\d.]+rem/);
  // R-1 do review: reserva atribuição + 3 categorias (15,72 rem medidos); abaixo disso o card cresce após o clique.
  const reserva = Number(/\.provedores\s*\{[^}]*min-height:\s*([\d.]+)rem/.exec(estilos)[1]);
  assert.ok(reserva >= 15.8, `min-height ${reserva}rem < 15.8rem`);
  assert.match(estilos, /\.lista-provedores\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap|\.lista-provedores\s*\{[^}]*flex-wrap:\s*wrap[^}]*display:\s*flex/);
  assert.match(estilos, /\.lista-provedores img\s*\{[^}]*width:\s*46px[^}]*height:\s*46px/);
  assert.match(estilos, /border:\s*1px solid var\(--cor-logo-borda\)/);
});

test('AC-8: rodapé com o aviso exato do TMDB e links de nova aba com noopener e noreferrer', () => {
  const rodape = /<footer>([\s\S]*?)<\/footer>/.exec(html)?.[1];
  assert.ok(rodape, 'footer');
  const texto = rodape.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.ok(texto.includes('Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.'));
  for (const a of (rodape.match(/<a\s[^>]*>/g) ?? []).filter((x) => /target="_blank"/.test(x))) {
    assert.match(a, /rel="[^"]*noopener[^"]*"/);
    assert.match(a, /rel="[^"]*noreferrer[^"]*"/);
  }
});

test('AC-13: src/ e index.html sem api.themoviedb.org nem TMDB_TOKEN', () => {
  assert.deepEqual(buscar(/api\.themoviedb\.org|TMDB_TOKEN/, ['src', 'index.html']), []);
});

test('AC-6: textos fixos novos em pt-BR presentes em src/ e index.html, com html lang pt-BR', () => {
  assert.match(html, /<html[^>]*\slang="pt-BR"/);
  const fonte = [...arquivos(join(raiz, 'src')).map((a) => readFileSync(a, 'utf8')), html].join('\n');
  for (const texto of [
    'Onde assistir: JustWatch via TMDB', 'Assinatura', 'Aluguel', 'Compra', 'Grátis com anúncios',
    'Buscando onde assistir no Brasil', 'Sem dados de onde assistir no Brasil',
    'Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.',
  ]) assert.ok(fonte.includes(texto), texto);
  assert.doesNotMatch(fonte, /Where to watch|Streaming on|Rent|Buy now|Subscription/);
});

test('AC-14: worker/wrangler.toml publica em workers.dev no plano Free, sem conta, rota, usage_model nem token', () => {
  const toml = readFileSync(join(raiz, 'worker/wrangler.toml'), 'utf8');
  const semComentarios = toml.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  assert.match(semComentarios, /^workers_dev\s*=\s*true\s*$/m);
  assert.doesNotMatch(semComentarios, /workers_dev\s*=\s*false/);
  // R-3 do review: [vars] (produção) só com origem https do site; as de desenvolvimento ficam em [env.dev.vars].
  const producao = /^\[vars\]\s*$([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(semComentarios)?.[1] ?? '';
  const origensProducao = /^ORIGENS_PERMITIDAS\s*=\s*"([^"]+)"/m.exec(producao)?.[1];
  assert.ok(origensProducao, 'ORIGENS_PERMITIDAS em [vars]');
  for (const o of origensProducao.split(',')) assert.match(o.trim(), /^https:\/\/[A-Za-z0-9.-]+$/, `origem de produção ${o}`);
  assert.doesNotMatch(producao, /127\.0\.0\.1|192\.168\.|localhost|http:\/\//);
  const dev = /^\[env\.dev\.vars\]\s*$([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(semComentarios)?.[1] ?? '';
  assert.match(dev, /^ORIGENS_PERMITIDAS\s*=\s*"http:\/\/127\.0\.0\.1:8765,http:\/\/192\.168\.18\.227:8765"/m);
  assert.doesNotMatch(semComentarios, /^\s*(account_id|route|routes|usage_model|TMDB_TOKEN)\s*=/m);
  assert.doesNotMatch(semComentarios, /^\s*\[+\s*(routes?|limits)\s*\]+/m);
  assert.match(toml, /plano Free/);
  assert.match(toml, /100\.000 requisições por dia/);
});

// ---- Varredura de worker/ atrás de token literal do TMDB (design D-15); padrões montados por fragmentos ----
const PADROES_TOKEN = [
  new RegExp(['ey', 'J[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}'].join('')),
  new RegExp('\\b[0-9a-fA-F]{32}\\b'),
  new RegExp(['api', '[_-]?', 'key', '\\s*=\\s*\\S+'].join(''), 'i'),
];
const PADRAO_TOKEN_ATRIBUIDO = new RegExp(['TMDB', '_TOKEN', '\\s*='].join(''));

// `.wrangler/` é estado local do wrangler (cache com o id da conta), ignorado pelo .gitignore e nunca
// versionado; sem esta exclusão a varredura acusa falso positivo em qualquer máquina que já fez deploy.
function varrerTokens(dir) {
  const achados = [];
  for (const arq of arquivos(dir, new Set(['.wrangler']))) {
    const padroes = arq.endsWith('wrangler.toml') ? [...PADROES_TOKEN, PADRAO_TOKEN_ATRIBUIDO] : PADROES_TOKEN;
    readFileSync(arq, 'utf8').split('\n').forEach((linha, i) => {
      if (padroes.some((p) => p.test(linha))) achados.push(`${relative(dir, arq)}:${i + 1}`);
    });
  }
  return achados;
}

test('AC-13: worker/ não contém JWT, hexadecimal de 32 caracteres, chave na URL nem token atribuído no wrangler.toml', () => {
  assert.ok(arquivos(join(raiz, 'worker')).length >= 2);
  assert.deepEqual(varrerTokens(join(raiz, 'worker')), []);
});

test('AC-13: a varredura reprova fixtures com JWT, hexadecimal, chave na URL e token atribuído, fora de worker/', () => {
  const dir = mkdtempSync(join(tmpdir(), 'filmelier-varredura-'));
  try {
    writeFileSync(join(dir, 'jwt.mjs'), `const x = '${'ey' + 'JhbGciOiJIUzI1NiJ9.aaaaaaaaaaaa'}';\n`);
    assert.deepEqual(varrerTokens(dir), ['jwt.mjs:1']);
    writeFileSync(join(dir, 'hex.mjs'), `const h = '${'0123456789abcdef'.repeat(2)}';\n`);
    writeFileSync(join(dir, 'chave.mjs'), `const u = 'x?${'api' + '_key'}=abc123';\n`);
    writeFileSync(join(dir, 'wrangler.toml'), `${'TMDB' + '_TOKEN'} = "x"\n`);
    assert.deepEqual(varrerTokens(dir).sort(), ['chave.mjs:1', 'hex.mjs:1', 'jwt.mjs:1', 'wrangler.toml:1']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const limpo = mkdtempSync(join(tmpdir(), 'filmelier-varredura-'));
  try {
    writeFileSync(join(limpo, 'ok.mjs'), "const a = 'tok-teste-123';\n");
    assert.deepEqual(varrerTokens(limpo), []);
  } finally {
    rmSync(limpo, { recursive: true, force: true });
  }
});

test('AC-13: .gitignore ignora os arquivos locais do wrangler', () => {
  const linhas = readFileSync(join(raiz, '.gitignore'), 'utf8').split('\n').map((l) => l.trim());
  assert.ok(linhas.includes('.dev.vars'));
  assert.ok(linhas.includes('.wrangler/'));
});

test('AC-13: todo import de worker/*.mjs é relativo ao próprio worker/ e package.json não traz wrangler nem dependências', () => {
  const modulos = readdirSync(join(raiz, 'worker')).filter((n) => n.endsWith('.mjs'));
  assert.ok(modulos.includes('index.mjs'));
  for (const nome of modulos) {
    const fonte = readFileSync(join(raiz, 'worker', nome), 'utf8');
    const origens = [...fonte.matchAll(/^\s*(?:import|export)\s[^'"\n]*?from\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/gm)].map((m) => m[1] ?? m[2] ?? m[3]);
    for (const origem of origens) {
      assert.ok(origem.startsWith('./'), `${nome}: ${origem}`);
      assert.ok(!origem.includes('src/'), `${nome}: ${origem}`);
    }
  }
  const textoPacote = readFileSync(join(raiz, 'package.json'), 'utf8');
  const pacote = JSON.parse(textoPacote);
  assert.ok(!('dependencies' in pacote) && !('devDependencies' in pacote));
  assert.doesNotMatch(textoPacote, /wrangler/);
});

test('AC-7: marcas e medida de desempenho dos provedores (início em mostrar, fim em aplicarProvedores)', () => {
  assert.match(app, /performance\.mark\('filmelier:provedores-inicio'\)/);
  assert.match(app, /performance\.mark\('filmelier:provedores-fim'\)/);
  assert.match(app, /performance\.measure\('filmelier:provedores', 'filmelier:provedores-inicio', 'filmelier:provedores-fim'\)/);
  const mostrarCorpo = corpoDe(app, 'mostrar');
  assert.ok(mostrarCorpo.indexOf("performance.mark('filmelier:provedores-inicio')") < mostrarCorpo.indexOf('estado.sessao.exibir('));
  assert.match(corpoDe(app, 'aplicarProvedores'), /performance\.mark\('filmelier:provedores-fim'\)/);
});

test('AC-6: o conteúdo dos provedores usa só createElement, textContent e atributos', () => {
  const corpo = corpoDe(app, 'conteudoProvedores');
  assert.doesNotMatch(corpo, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.match(corpo, /criar\('span', p\.nome, \{ class: 'nome-provedor' \}\)/);
  assert.ok(corpo.indexOf('loading: p.logo.loading') < corpo.indexOf('src: p.logo.src'));
});

// ---- Título pt-BR (ajuste pós-FILMELIER-3) ----
test('título pt-BR: bloco do título reserva 2 linhas e a linha do título original é fixa e aria-hidden', () => {
  assert.match(estilos, /\.card\.titulo-reservado \.bloco-titulo\s*\{[^}]*min-height:\s*(\d+(\.\d+)?)rem/);
  const altura = Number(/\.titulo-reservado \.bloco-titulo\s*\{[^}]*min-height:\s*([\d.]+)rem/.exec(estilos)[1]);
  assert.ok(altura >= 2 * 1.15 * 1.3 + 0.85 * 1.4, `min-height ${altura}rem`);
  assert.match(estilos, /\.card \.titulo-original\s*\{[^}]*min-height:\s*[\d.]+rem[^}]*color:\s*var\(--cor-texto-secundario\)/);
  assert.match(corpoDe(app, 'desenharItem'), /'titulo-original'[^)]*'aria-hidden': 'true'/);
});

test('título pt-BR: a troca é no lugar, só com textContent, e não toca #resumo-lista', () => {
  const t = corpoDe(app, 'atualizarTitulo');
  assert.match(t, /textContent/);
  assert.doesNotMatch(t, /innerHTML|insertAdjacentHTML|replaceWith|replaceChildren|resumo-lista/);
  const p = corpoDe(app, 'aplicarProvedores');
  assert.match(p, /atualizarTitulo\(li, cards\[i\]\)/);
  assert.doesNotMatch(p, /resumo-lista|desenharItem|replaceChildren\(\.\.\.cards/);
});
