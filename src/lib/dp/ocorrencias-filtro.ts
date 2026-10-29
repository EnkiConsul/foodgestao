import type { OcorrenciaTipo } from "./ocorrencias";

/** Apply origin filtering before the query limit, including both days of a swap. */
export function aplicarTipoOcorrencia<T extends {
  or: (filters: string) => T;
  eq: (column: "tipo" | "subtipo", value: string) => T;
}>(query: T, tipo: string): T {
  if (tipo === "folgas_trocas") return query.or("folga_id.not.is.null,troca_id.not.is.null,trabalho_excepcional_id.not.is.null");
  if (tipo === "ferias") return query.eq("subtipo", "ferias");
  if (tipo === "all") return query;
  return query.eq("tipo", tipo as OcorrenciaTipo);
}