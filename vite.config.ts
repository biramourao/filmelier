import { cpSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin, type ResolvedConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { montarCsp } from './src/csp.mjs';
import { URL_WORKER } from './src/config.mjs';

const BASE = '/filmelier/';
const MARCADOR_REFERRER = '<meta name="referrer"';

// CSP só no build (D-10): o servidor de dev do Vite injeta `style` por JS, que a política sem 'unsafe-inline' bloquearia.
// A meta entra imediatamente antes do referrer (ordem: charset, viewport, CSP, referrer); sem o marcador o build falha.
function cspNoBuild(): Plugin {
  return {
    name: 'filmelier-csp-no-build',
    apply: 'build',
    transformIndexHtml(html) {
      if (!html.includes(MARCADOR_REFERRER)) {
        throw new Error(`index.html sem o marcador ${MARCADOR_REFERRER}: a CSP não tem onde entrar`);
      }
      const meta = `<meta http-equiv="Content-Security-Policy" content="${montarCsp(URL_WORKER)}">`;
      return html.replace(MARCADOR_REFERRER, `${meta}\n  ${MARCADOR_REFERRER}`);
    },
  };
}

// Com `publicDir: false` um link de favicon escrito na casca viraria asset com hash. Este plugin injeta o link depois do
// processamento de assets (`order: 'post'`), com o caminho estável {base}favicon.svg, no dev e no build.
function faviconEstavel(): Plugin {
  let base = BASE;
  return {
    name: 'filmelier-favicon-estavel',
    configResolved(config: ResolvedConfig) {
      base = config.base;
    },
    transformIndexHtml: {
      order: 'post',
      handler() {
        return [{ tag: 'link', attrs: { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon.svg` }, injectTo: 'head' as const }];
      },
    },
  };
}

// data/ continua a fonte (o workflow semanal grava nela): copiada para dist/data, junto com assets/ e o favicon.
function copiarEstaticos(): Plugin {
  let raiz = process.cwd();
  let saida = resolve(raiz, 'dist');
  return {
    name: 'filmelier-copiar-estaticos',
    apply: 'build',
    configResolved(config: ResolvedConfig) {
      raiz = config.root;
      saida = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      cpSync(resolve(raiz, 'data'), resolve(saida, 'data'), { recursive: true });
      cpSync(resolve(raiz, 'assets'), resolve(saida, 'assets'), { recursive: true });
      cpSync(resolve(raiz, 'favicon.svg'), resolve(saida, 'favicon.svg'));
    },
  };
}

export default defineConfig({
  base: BASE,
  publicDir: false,
  plugins: [react(), cspNoBuild(), faviconEstavel(), copiarEstaticos()],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
});
