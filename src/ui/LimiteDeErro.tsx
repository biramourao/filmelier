import { Component, type ReactNode } from 'react';
import type { Logger } from './dependencias';

export const TEXTO_ERRO = 'Não foi possível carregar a lista de filmes. Recarregue a página.';

interface Props {
  logger: Logger;
  children?: ReactNode;
}

// Error boundary (design D-3): exceção na renderização troca a árvore pelo alerta de erro e loga 1 vez com [filmelier].
export class LimiteDeErro extends Component<Props, { falhou: boolean }> {
  state = { falhou: false };

  static getDerivedStateFromError() {
    return { falhou: true };
  }

  componentDidCatch(erro: unknown) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    this.props.logger.error(`[filmelier] falha ao renderizar a página: ${motivo}`);
  }

  render() {
    if (this.state.falhou) return <p id="erro" role="alert">{TEXTO_ERRO}</p>;
    return this.props.children;
  }
}
