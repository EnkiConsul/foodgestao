export type VagaStatus = "rascunho" | "ativa" | "pausada" | "encerrada";
export type VagaEstado = VagaStatus | "expirada";

export const LIMITE_VAGAS_ATIVAS = 3;

export const TIPOS_CONTRATACAO: Record<string, string> = {
  clt: "CLT",
  intermitente: "Intermitente",
  freelancer: "Freelancer",
  temporario: "Temporário",
  estagio: "Estágio",
  pj: "PJ",
};

export const ESTADO_ROTULO: Record<VagaEstado, string> = {
  rascunho: "Rascunho",
  ativa: "Ativa",
  pausada: "Pausada",
  encerrada: "Encerrada",
  expirada: "Expirada",
};

/** Mesma regra do banco: ativa com prazo vencido é "expirada" e não conta no limite. */
export function estadoEfetivo(status: VagaStatus, expiraEm: string | null, agora = new Date()): VagaEstado {
  if (status === "ativa") {
    if (!expiraEm || new Date(expiraEm) <= agora) return "expirada";
    return "ativa";
  }
  return status;
}

export function urlPublicaVaga(codigo: string, origin = window.location.origin) {
  return `${origin}/vagas/${codigo}`;
}
