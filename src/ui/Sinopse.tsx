import { useId, useLayoutEffect, useRef, useState } from 'react';

interface Props {
  card: any;
  // `true` depois que o enriquecimento da geração terminou: sem sinopse, mostra "Sinopse indisponível.".
  enriquecido: boolean;
  agendarQuadro: (retorno: () => void) => void;
}

const link = (texto: string, href: string, atributos: any) => <a href={href} target={atributos.target} rel={atributos.rel}>{texto}</a>;

// Bloco de sinopse do card (D-5): o `div.sinopse-bloco` é o mesmo nó nos estados reservado, preenchido e indisponível,
// então "Ler mais" aberto e o foco nos links do card não se perdem quando o enriquecimento chega.
export function Sinopse({ card, enriquecido, agendarQuadro }: Props) {
  const id = useId();
  const texto = useRef<HTMLParagraphElement>(null);
  const [aberta, setAberta] = useState(false);
  const [estoura, setEstoura] = useState(false);
  const sinopse: string | null = card.sinopse;

  // O "Ler mais" só aparece se o texto passa das 4 linhas recolhidas (medida depois do quadro; o jsdom não calcula layout).
  useLayoutEffect(() => {
    if (!sinopse) return;
    agendarQuadro(() => {
      const no = texto.current;
      if (no) setEstoura(no.scrollHeight > no.clientHeight);
    });
  }, [sinopse, agendarQuadro]);

  if (!sinopse) {
    return enriquecido
      ? <div className="sinopse-bloco"><p className="sinopse-indisponivel">Sinopse indisponível.</p></div>
      : <div className="sinopse-bloco reservado" aria-hidden="true" />;
  }
  return (
    <div className="sinopse-bloco">
      <p className={aberta ? 'sinopse expandida' : 'sinopse'} id={id} ref={texto}>
        {card.marcaIdioma && <><span className="marca-idioma">{card.marcaIdioma}</span>{' '}</>}
        <span lang={card.lang ?? undefined}>{sinopse}</span>
      </p>
      <button type="button" className="ler-mais" aria-expanded={aberta} aria-controls={id} hidden={!estoura} onClick={() => setAberta((a) => !a)}>
        {aberta ? 'Ler menos' : 'Ler mais'}
      </button>
      <p className="credito">
        Sinopse: {link('Wikipédia', card.creditoUrl, card.atributosLink)} ({link('CC BY-SA', card.licencaUrl, card.atributosLink)})
      </p>
    </div>
  );
}
