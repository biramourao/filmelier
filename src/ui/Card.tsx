import { useState } from 'react';
import { Sinopse } from './Sinopse';
import { Provedores } from './Provedores';

interface Props {
  card: any;
  enriquecido: boolean;
  agendarQuadro: (retorno: () => void) => void;
}

// Card do filme ou da série (D-5; FILMELIER-6, D-8). Ordem fixa: capa, título, meta, linha da série, tags, selo do Oscar, sinopse com crédito, crédito da imagem, links e provedores.
// Cada bloco mantém o mesmo tipo de elemento na mesma posição entre o estado reservado e o preenchido; o `key` é o qid
// (posto por quem renderiza a lista), então o enriquecimento e os provedores reconciliam o mesmo `li`.
export function Card({ card, enriquecido, agendarQuadro }: Props) {
  const [capaFalhou, setCapaFalhou] = useState(false);
  const capa = card.capa && !capaFalhou ? card.capa : null;
  const creditoImagem = capa && card.creditoImagemUrl ? card.creditoImagemUrl : null;
  const meta = [`${card.ano} · ${card.generos.join(', ')}`, card.notaTexto].filter(Boolean).join(' · ');
  return (
    <li className={card.provedores ? 'card titulo-reservado' : 'card'}>
      <div className={capa ? 'capa' : 'capa placeholder'} aria-hidden={capa ? undefined : 'true'}>
        {capa && (
          <img
            loading={capa.loading}
            referrerPolicy={capa.referrerPolicy}
            src={capa.src}
            alt={capa.alt}
            width={capa.width}
            height={capa.height}
            onError={() => setCapaFalhou(true)}
          />
        )}
      </div>
      {/* Com o Worker ligado o título pt-BR pode chegar depois: a linha do título original fica sempre presente. */}
      <div className="bloco-titulo">
        <h2>{card.titulo}</h2>
        {(card.provedores || card.tituloOriginalTexto) && (
          <p className="titulo-original" aria-hidden={card.tituloOriginalTexto ? undefined : 'true'}>{card.tituloOriginalTexto ?? ''}</p>
        )}
      </div>
      <p className="meta">{meta}</p>
      {/* Série (FILMELIER-6): situação, temporadas e episódios em texto visível, logo depois dos anos e gêneros. */}
      {card.linhaSerie && <p className="linha-serie">{card.linhaSerie}</p>}
      {card.tags && (
        <ul className="tags-filme" aria-label={card.rotuloTags ?? 'Tags do filme'}>
          {card.tags.map((rotulo: string) => <li key={rotulo}>{rotulo}</li>)}
        </ul>
      )}
      {card.oscar && (
        <p className="oscar">
          {card.oscar.emoji && <span className="emoji" aria-hidden="true">{card.oscar.emoji}</span>}
          <span>{card.oscar.texto}</span>
        </p>
      )}
      <Sinopse card={card} enriquecido={enriquecido} agendarQuadro={agendarQuadro} />
      {creditoImagem
        ? (
          <p className="credito-imagem">
            Imagem: <a href={creditoImagem} target={card.atributosLink.target} rel={card.atributosLink.rel}>Wikipédia</a>
          </p>
        )
        : <p className="credito-imagem reservado" aria-hidden="true" />}
      <p className="links">
        {card.links.map((l: any) => <a key={l.texto} href={l.href} target={l.target} rel={l.rel}>{l.texto}</a>)}
      </p>
      {card.provedores && <Provedores secao={card.provedores} />}
    </li>
  );
}
