/**
 * Folga de fim de semana do mês em dia lotado.
 *
 * O colaborador nunca marca direto em dia lotado (nem sem folga no mês): o
 * pedido vai ao gestor (`dp_folga_solicitar_mes_lotado`), que decide passar do
 * limite. A distribuição automática do fechamento mantém a contingência.
 */

export interface PedidoDiaLotado {
  id: string;
  colaborador_id: string | null;
  data_alvo: string | null;
  excede_limite_dia?: boolean | null;
}

/** Pedido do dia lotado ainda com o gestor, no mesmo mês da data (um por mês). */
export function pedidoDiaLotadoNoMes<T extends PedidoDiaLotado>(
  pendentes: readonly T[],
  meuId: string | null | undefined,
  iso: string,
): T | null {
  if (!meuId || !iso) return null;
  const mes = iso.slice(0, 7);
  return (
    pendentes.find(
      (p) => p.colaborador_id === meuId && p.excede_limite_dia === true && (p.data_alvo ?? "").slice(0, 7) === mes,
    ) ?? null
  );
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * A pessoa ainda tem fim de semana no mês dentro do contrato? Admitido depois
 * do último sábado/domingo do mês não tem folga de fim de semana a cobrar.
 */
export function temFimDeSemanaAposAdmissao(
  dataAdmissao: string | null | undefined,
  inicioMes: string,
  fimMes: string,
): boolean {
  const adm = (dataAdmissao ?? "").slice(0, 10);
  const inicio = adm && adm > inicioMes ? adm : inicioMes;
  if (inicio > fimMes) return false;
  const [a, m, d] = inicio.split("-").map(Number);
  for (let dia = new Date(a, m - 1, d); ymd(dia) <= fimMes; dia.setDate(dia.getDate() + 1)) {
    const wd = dia.getDay();
    if (wd === 0 || wd === 6) return true;
  }
  return false;
}

/** Texto da tela para as recusas do pedido em dia lotado. */
export function mensagemPedidoDiaLotado(raw: string): string | null {
  if (raw.includes("FOLGA_MES_PEDIDO_PENDENTE")) {
    const data = raw.split("FOLGA_MES_PEDIDO_PENDENTE:").pop()?.trim();
    return `Você já pediu ao gestor a folga de ${data || "outro dia"} deste mês. Aguarde a resposta ou cancele aquele pedido para pedir outro dia.`;
  }
  if (raw.includes("FOLGA_COM_VAGA")) return "Este dia voltou a ter vaga. Toque em \"Marcar folga\" para marcar direto.";
  if (raw.includes("FOLGA_MES_SEM_DIREITO"))
    return "Você já tem a folga de fim de semana deste mês. Para mudar o dia, use \"Mudar o dia da minha folga\".";
  if (raw.includes("FOLGA_MES_JA_RESOLVIDA"))
    return "O colaborador já recebeu a folga de fim de semana deste mês por outro caminho. Recuse este pedido.";
  return null;
}
