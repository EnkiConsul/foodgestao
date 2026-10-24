/**
 * Abre qualquer arquivo no visualizador interno do app (montado uma vez na
 * raiz). Substitui links que abriam o documento em outra aba do navegador.
 */
export interface PedidoVisualizacao {
  titulo?: string;
  url?: string;
  mime?: string | null;
  nome?: string | null;
  /** Carregamento tardio (ex.: link assinado gerado na hora). */
  carregar?: () => Promise<{ url: string; mime?: string | null; nome?: string | null }>;
}

type Ouvinte = (p: PedidoVisualizacao) => void;
const ouvintes = new Set<Ouvinte>();

export function ouvirVisualizacao(fn: Ouvinte): () => void {
  ouvintes.add(fn);
  return () => { ouvintes.delete(fn); };
}

/** Retorna false se não há visualizador montado (o chamador decide o plano B). */
export function abrirNoApp(p: PedidoVisualizacao): boolean {
  if (!ouvintes.size) return false;
  ouvintes.forEach((fn) => fn(p));
  return true;
}
