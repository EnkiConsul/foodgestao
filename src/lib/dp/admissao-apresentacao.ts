import { asoLiberaContabilidade, type AsoDados } from "./aso-admissional";
import { regimeEhEmprego } from "./vinculo-documento";

export interface AdmissaoReferencia {
  id: string;
  company_id: string;
  status: string;
  colaborador_id: string | null;
  regime_previsto?: string | null;
  admin_dados?: Record<string, unknown> | null;
}

export function admissaoDoProvisorio<T extends AdmissaoReferencia>(id: string, companyId: string, fichas: T[]): T | null {
  return fichas.find((p) => {
    const rotina = p.admin_dados?.rotina as { colaborador_id?: unknown } | undefined;
    return p.company_id === companyId && !["concluido", "cancelado"].includes(p.status)
      && !p.colaborador_id && rotina?.colaborador_id === id;
  }) ?? null;
}

export function situacaoAdmissao(status: string, emprego: boolean, asoValido: boolean): string {
  if (status === "concluido") return "Admissão efetivada";
  if (status === "cancelado") return "Admissão cancelada";
  if (status === "expirado") return "Link expirado · retomar admissão";
  if (status === "aguardando_preenchimento") return "Aguardando dados do candidato";
  if (status === "em_preenchimento") return "Candidato preenchendo a ficha";
  if (["correcao_solicitada", "aguardando_nova_versao"].includes(status)) return "Aguardando correção do candidato";
  if (status === "aguardando_revisao") return "Ficha ainda não finalizada";
  if (!emprego) return "Aguardando efetivação";
  if (!asoValido) return "Ficha conferida · aguardando ASO";
  if (["enviado_contabilidade", "aguardando_retorno_contabilidade"].includes(status)) return "Aguardando retorno da contabilidade";
  if (status === "registro_recebido") return "Aguardando efetivação";
  return "Ficha e ASO conferidos · enviar à contabilidade";
}

export function etapaDaPreadmissao(p: Pick<AdmissaoReferencia, "status" | "regime_previsto" | "admin_dados">): string {
  const regime = String(p.admin_dados?.regime_trabalho || p.regime_previsto || "clt");
  return situacaoAdmissao(p.status, regimeEhEmprego(regime), asoLiberaContabilidade(p.admin_dados?.aso as AsoDados | undefined));
}

/** O progresso do processo não é a navegação entre abas da ficha. */
export function passoAdmissao(status: string, emprego: boolean, asoValido: boolean): number {
  if (status === "concluido") return emprego ? 4 : 2;
  if (!["pronto_contabilidade", "enviado_contabilidade", "aguardando_retorno_contabilidade", "registro_recebido"].includes(status)) return 0;
  if (!emprego) return 1;
  if (!asoValido) return 1;
  return status === "registro_recebido" ? 3 : 2;
}

export function pontoNaAdmissao(salvo: unknown, justificativa: unknown, emprego: boolean, unidadeTemPonto: boolean): boolean {
  if (typeof salvo === "boolean") return salvo;
  return emprego && unidadeTemPonto && !String(justificativa ?? "").trim();
}