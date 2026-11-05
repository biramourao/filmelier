import { createRoot } from 'react-dom/client';
import '../styles.css';
import { App } from './ui/App';
import { LimiteDeErro } from './ui/LimiteDeErro';
import { dependenciasReais } from './ui/dependencias';

// Sem modo estrito do React (D-14, D-B): no dev ele monta os efeitos 2 vezes e duplicaria a carga de data/*.json e as marcas filmelier:*.
const dependencias = dependenciasReais();
const raiz = document.getElementById('raiz');
if (raiz) {
  // `onCaughtError` sem log próprio: o erro capturado por LimiteDeErro já gera a única linha [filmelier].
  createRoot(raiz, { onCaughtError: () => {} }).render(
    <LimiteDeErro logger={dependencias.logger}>
      <App dependencias={dependencias} />
    </LimiteDeErro>,
  );
}
