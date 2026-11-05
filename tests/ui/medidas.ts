// Apoio dos testes de "Ler mais" com a aba oculta (FILMELIER-6, D-8).

// "Ler mais" com a aba oculta (D-8): 0/0 dentro de ancestral `hidden`, 200/80 fora.
export function simularMedidas() {
  const dentroDeOculto = (no: Element) => no.closest('[hidden]') !== null;
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get(this: HTMLElement) { return dentroDeOculto(this) ? 0 : 200; } });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get(this: HTMLElement) { return dentroDeOculto(this) ? 0 : 80; } });
}
export function adiado<T>() {
  let resolver!: (v: T) => void;
  const promessa = new Promise<T>((r) => { resolver = r; });
  return { promessa, resolver };
}
export const ENRIQ = (qid: string) => ({ idioma: 'pt', sinopse: `Sinopse longa ${qid}.`, capaUrl: `https://upload.wikimedia.org/${qid}.jpg`, artigoUrl: `https://pt.wikipedia.org/wiki/${qid}` });

