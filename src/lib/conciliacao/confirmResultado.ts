/**
 * Resultado estruturado da confirmação de lançamentos na conciliação.
 *
 * A tela nunca deve anunciar "concluído" quando parte dos itens falhou ou foi
 * bloqueada: o resumo abaixo é a única fonte da mensagem e da seleção que
 * permanece marcada para nova tentativa.
 */
export type MotivoBloqueio =
  | "cartao_nao_autorizado"
  | "conta_destino_ausente"
  | "contraparte_ausente"
  | "contraparte_igual"
  | "contato_sem_vinculo"
  | "erro_rpc";

export interface FalhaConfirmacao {
  ids: string[];
  motivo: MotivoBloqueio;
  detalhe?: string;
}

export interface ConfirmResultado {
  /** Itens que geraram (ou já possuíam) lançamento confirmado. */
  confirmados: string[];
  /** Itens que não puderam ser confirmados, com o motivo. */
  falhas: FalhaConfirmacao[];
  /** Pernas espelho de transferência marcadas como duplicadas. */
  espelhos: number;
}

export const criarResultado = (): ConfirmResultado => ({
  confirmados: [],
  falhas: [],
  espelhos: 0,
});

export const totalFalhas = (r: ConfirmResultado): number =>
  r.falhas.reduce((soma, f) => soma + f.ids.length, 0);

/** Ids que continuam pendentes: tudo que foi pedido e não foi confirmado. */
export const idsRemanescentes = (
  pedidos: string[],
  r: ConfirmResultado,
): string[] => {
  const confirmados = new Set(r.confirmados);
  return pedidos.filter((id) => !confirmados.has(id));
};

const MENSAGEM_MOTIVO: Record<MotivoBloqueio, string> = {
  cartao_nao_autorizado:
    "Cartão do Open Finance ainda não autorizado em Cartões de Crédito.",
  conta_destino_ausente: "Falta escolher a conta de destino.",
  contraparte_ausente: "Falta escolher a conta da contraparte da transferência.",
  contraparte_igual:
    "A contraparte deve ser diferente da conta do extrato.",
  erro_rpc: "O sistema recusou a gravação.",
};

export interface ResumoConfirmacao {
  tipo: "sucesso" | "parcial" | "erro" | "vazio";
  titulo: string;
  descricao?: string;
  /** Só oferecemos o extrato quando nada ficou para trás. */
  ofereceExtrato: boolean;
}

export const resumoConfirmacao = (
  pedidos: string[],
  r: ConfirmResultado,
): ResumoConfirmacao => {
  const falhas = totalFalhas(r);
  const naoTratados = idsRemanescentes(pedidos, r).length - falhas;
  const pendentes = falhas + Math.max(naoTratados, 0);
  const ok = r.confirmados.length;

  const detalhes = r.falhas
    .map((f) => `${f.ids.length} — ${f.detalhe ?? MENSAGEM_MOTIVO[f.motivo]}`)
    .join(" ");

  if (ok === 0) {
    if (pendentes === 0) {
      return { tipo: "vazio", titulo: "Nada a confirmar", ofereceExtrato: false };
    }
    return {
      tipo: "erro",
      titulo:
        pendentes === 1
          ? "Não foi possível confirmar o lançamento"
          : `Não foi possível confirmar ${pendentes} lançamentos`,
      descricao: detalhes || "Revise os itens que permaneceram selecionados.",
      ofereceExtrato: false,
    };
  }

  if (pendentes > 0) {
    return {
      tipo: "parcial",
      titulo: `${ok} confirmado(s), ${pendentes} pendente(s)`,
      descricao:
        (detalhes ? detalhes + " " : "") +
        "Os itens pendentes continuam selecionados.",
      ofereceExtrato: false,
    };
  }

  return {
    tipo: "sucesso",
    titulo: ok === 1 ? "Lançamento confirmado" : `${ok} lançamentos confirmados`,
    descricao:
      r.espelhos > 0
        ? r.espelhos === 1
          ? "A outra ponta da transferência foi marcada como duplicada."
          : `${r.espelhos} lançamentos espelho marcados como duplicados.`
        : undefined,
    ofereceExtrato: true,
  };
};
