/**
 * Contador local de "resolvidas hoje" nas Ações do Dia (por empresa e dia civil
 * de Brasília). É só um retorno visual para o gestor — não é registro oficial.
 */
const EVENTO = "dp-acoes-resolvidas";

export function diaBrasilia(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

export function chaveResolvidas(companyId: string, dia: string) {
  return `dp-acoes-resolvidas:${companyId}:${dia}`;
}

type Armazem = Pick<Storage, "getItem" | "setItem">;

function lerIds(st: Armazem, chave: string): string[] {
  try {
    const v = JSON.parse(st.getItem(chave) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Registra uma ação como resolvida; a mesma ação conta uma única vez no dia. */
export function registrarResolvida(companyId: string, pendenciaId: string, st: Armazem = localStorage, agora = new Date()): number {
  const chave = chaveResolvidas(companyId, diaBrasilia(agora));
  const ids = lerIds(st, chave);
  if (!ids.includes(pendenciaId)) ids.push(pendenciaId);
  st.setItem(chave, JSON.stringify(ids));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO));
  return ids.length;
}

export function contarResolvidas(companyId: string, st: Armazem = localStorage, agora = new Date()): number {
  return lerIds(st, chaveResolvidas(companyId, diaBrasilia(agora))).length;
}

export const EVENTO_RESOLVIDAS = EVENTO;
