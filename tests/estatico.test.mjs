import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { cspEsperada } from './apoio/csp.mjs';

const raiz = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
// `.github` fica fora das varreduras de segredo: o workflow referencia o segredo por expressão do Actions (nunca o valor).
// Ele tem teste próprio (tests/workflow-atualizar-base.test.mjs).
const EXCLUIDOS = new Set(['.git', '.github', '.studioai', '.studio', 'openspec', 'node_modules', 'dist', '.claude']);
// FILMELIER-4 (D-11): nomes de entrada excluídos da busca por palavras; só estes 2 caminhos podem ter esses nomes.
const EXCLUIDOS_TEMAS = ['temas.json', 'temas.mjs', 'series-tmdb.mjs', 'series.json'];
const CAMINHOS_TEMAS = ['data/temas.json', 'scripts/lib/temas.mjs', 'scripts/lib/series-tmdb.mjs', 'data/series.json'];

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
  const padrao = new RegExp(['innerHTML', 'dangerouslySetInnerHTML', 'localStorage', 'sessionStorage', 'document\\.cookie', 'sendBeacon', 'history\\.'].join('|'));
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
  // FILMELIER-4 (design D-11): `data/temas.json` e `scripts/lib/temas.mjs` ficam fora desta busca por nome de entrada.
  // A tabela de temas tem keywords que casam o padrão desta busca e o módulo do build monta o cabeçalho de acesso
  // ao TMDB (também palavra do padrão). Ambos têm varredura própria de token literal (varrerTokens em scripts/).
  assert.deepEqual(buscar(semApiUrl, ['.'], new Set([...EXCLUIDOS, 'filmes.json', 'worker', ...EXCLUIDOS_TEMAS])), []);
  const dataset = JSON.parse(readFileSync(join(raiz, 'data/filmes.json'), 'utf8'));
  const semTitulos = JSON.stringify({ meta: dataset.meta, filmes: dataset.filmes.map(({ titulo, ...resto }) => resto) });
  assert.ok(!padrao.test(semTitulos));
  // FILMELIER-6 (D-13): data/series.json também tem títulos livres; só `meta` e os campos sem título entram na busca.
  const base = JSON.parse(readFileSync(join(raiz, 'data/series.json'), 'utf8'));
  const semTitulosSeries = JSON.stringify({ meta: base.meta, series: base.series.map(({ titulo, tituloOriginal, ...resto }) => resto) });
  assert.ok(!padrao.test(semTitulosSeries));
});

test('AC-15: as exclusões por nome da busca de segredos casam só data/temas.json e scripts/lib/temas.mjs', () => {
  const casados = arquivos(raiz, new Set([...EXCLUIDOS, 'node_modules']))
    .map((a) => relative(raiz, a))
    .filter((a) => EXCLUIDOS_TEMAS.includes(a.split('/').at(-1)));
  assert.deepEqual(casados.filter((c) => !CAMINHOS_TEMAS.includes(c)), []);
});

test('AC-1: README.md tem a seção "Rotação da chave do TMDB" citando GitHub Actions e Cloudflare', () => {
  const readme = readFileSync(join(raiz, 'README.md'), 'utf8');
  assert.match(readme, /^## Rotação da chave do TMDB$/m);
  const secao = readme.split('## Rotação da chave do TMDB')[1];
  assert.ok(secao.includes('GitHub Actions'));
  assert.ok(secao.includes('Cloudflare'));
});

test('AC-21: html com lang pt-BR', () => {
  assert.match(html, /<html[^>]*\slang="pt-BR"/);
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

test('AC-13: meta referrer no-referrer na casca e ordem do head (charset, viewport, referrer); a CSP entra só no build e é testada em tests/dist', () => {
  assert.match(html, /<meta\s+name="referrer"\s+content="no-referrer"\s*\/?>/);
  const ordem = ['<meta charset', 'name="viewport"', 'name="referrer"'].map((t) => html.indexOf(t));
  assert.ok(ordem.every((i) => i >= 0));
  assert.deepEqual(ordem, [...ordem].sort((a, b) => a - b));
});

test('AC-13: src/ e index.html sem outerHTML, insertAdjacentHTML nem document.write', () => {
  assert.deepEqual(buscar(/outerHTML|insertAdjacentHTML|dangerouslySetInnerHTML|document\.write/, ['src', 'index.html']), []);
});

test('AC-13: nenhum atributo style no código (a CSP não tem style-src próprio)', () => {
  assert.deepEqual(buscar(/setAttribute\(\s*['"]style['"]|\.style\.|\sstyle=|style=\{|style:/, ['src', 'index.html']), []);
});

// FILMELIER-5: a política de dependências saiu daqui e vive em tests/dependencias.test.mjs (D-12).

// ---- R-1 e R-2 (code review): atualização no lugar, região live curta e espaço reservado ----
const estilos = readFileSync(join(raiz, 'styles.css'), 'utf8');

test('AC-19 Região live curta sem sinopses (R-1): o resumo curto é só para leitor de tela (CSS); o resto vai em tests/ui/resultado.test.tsx', () => {
  assert.match(estilos, /\.so-leitor\s*\{[^}]*position:\s*absolute/);
});

test('R-2: o CSS dá altura mínima ao crédito da imagem reservado (a reserva renderizada vai em tests/ui/enriquecimento.test.tsx)', () => {
  assert.match(estilos, /\.credito-imagem\.reservado\s*\{[^}]*min-height:\s*[\d.]+rem/);
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

// ---- FILMELIER-3: seção de provedores no DOM (P-14) ----
test('AC-7: as dependências reais criam os provedores com URL_WORKER de src/config.mjs', () => {
  const dependencias = readFileSync(join(raiz, 'src/ui/dependencias.ts'), 'utf8');
  assert.match(dependencias, /import \{ URL_WORKER \} from '\.\.\/config\.mjs'/);
  assert.match(dependencias, /urlWorker: URL_WORKER/);
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

const estilosDoLogo = readFileSync(join(raiz, 'styles.css'), 'utf8');
// FILMELIER-4 (D-15): logo oficial do TMDB, arquivo da própria origem, sem alteração do original.
// Origem: https://www.themoviedb.org/assets/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg
// (versão curta azul, da página https://www.themoviedb.org/about/logos-attribution, baixada em 2026-11-04).
const SHA256_LOGO_TMDB = '8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c';

test('AC-15: logo local do TMDB no Rodape.tsx: link oficial, arquivo da própria origem com o sha256 do original e altura menor que a do h1', () => {
  const rodape = readFileSync(join(raiz, 'src/ui/Rodape.tsx'), 'utf8');
  const ancora = /<a href="https:\/\/www\.themoviedb\.org\/" target="_blank" rel="noopener noreferrer">\s*(<img\s[^>]*\/>)\s*<\/a>/.exec(rodape);
  assert.ok(ancora, 'img dentro do link para themoviedb.org');
  const img = ancora[1];
  const src = /src="([^"]+)"/.exec(img)[1];
  assert.ok(!/^(https?:)?\/\//.test(src) && !src.startsWith('/'), 'src relativo');
  assert.match(img, /alt="TMDB"/);
  assert.equal(createHash('sha256').update(readFileSync(join(raiz, src))).digest('hex'), SHA256_LOGO_TMDB);
  assert.ok(statSync(join(raiz, 'assets/tmdb-logo.svg')).size > 0);
  const altura = Number(/height=\{(\d+)\}/.exec(img)[1]);
  const fonteH1 = Number(/h1\s*\{[^}]*font-size:\s*([\d.]+)rem/.exec(estilosDoLogo)[1]) * 16;
  assert.ok(altura < fonteH1, `${altura} < ${fonteH1}`);
  assert.ok(rodape.includes('Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.'));
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

test('AC-15: scripts/ também não contém JWT, hexadecimal de 32 caracteres nem chave na URL com valor (FILMELIER-4, D-11)', () => {
  assert.ok(arquivos(join(raiz, 'scripts')).length >= 10);
  assert.deepEqual(varrerTokens(join(raiz, 'scripts')), []);
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

test('AC-13: todo import de worker/*.mjs é relativo ao próprio worker/ ', () => {
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
});

// ---- Título pt-BR (ajuste pós-FILMELIER-3) ----
test('título pt-BR: bloco do título reserva 2 linhas e a linha do título original é fixa e aria-hidden', () => {
  assert.match(estilos, /\.card\.titulo-reservado \.bloco-titulo\s*\{[^}]*min-height:\s*(\d+(\.\d+)?)rem/);
  const altura = Number(/\.titulo-reservado \.bloco-titulo\s*\{[^}]*min-height:\s*([\d.]+)rem/.exec(estilos)[1]);
  assert.ok(altura >= 2 * 1.15 * 1.3 + 0.85 * 1.4, `min-height ${altura}rem`);
  assert.match(estilos, /\.card \.titulo-original\s*\{[^}]*min-height:\s*[\d.]+rem[^}]*color:\s*var\(--cor-texto-secundario\)/);
});
