import { useEffect, useRef } from 'react';

// Abertura (redesign "Marquise"): a sala de cinema vista da última fileira, com relances de filmes na tela, em loop, atrás do
// título. É decoração: fica fora da árvore de acessibilidade. A imagem não segue o mouse. O vídeo só toca com tela larga e
// sem pedido de menos movimento; nos outros casos fica o pôster (o 1º quadro).
const VIDEO = 'assets/abertura/sala.mp4';
const POSTER = 'assets/abertura/sala.webp';

function podeAnimar(): boolean {
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(min-width: 40rem)').matches
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function Abertura() {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const no = video.current;
    if (!no || !podeAnimar()) return;
    // O vídeo entra por cima do pôster só depois do 1º quadro pronto, para a troca não pular.
    no.addEventListener('loadeddata', () => { void no.play?.()?.catch(() => {}); }, { once: true });
    no.preload = 'auto';
    no.src = VIDEO;
    no.load?.();
  }, []);

  return (
    <div className="abertura" aria-hidden="true">
      <video ref={video} className="abertura-video" poster={POSTER} muted loop playsInline preload="none" />
    </div>
  );
}
