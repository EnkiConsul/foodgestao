import { faltaVerso, type ParteEnviada } from "./documentoPartes";

export function pendenciaDocumento(codigo: string, partes: ParteEnviada[]): string | null {
  const validas = partes.filter((p) => p.status !== "recusado");
  if (!validas.length) return partes.length ? "Reenviar documento recusado" : "Documento não enviado";
  if (partes.some((p) => p.status === "recusado")) return "Substituir a parte recusada";
  if (faltaVerso(codigo, validas)) return "Falta enviar o verso";
  if (!validas.some((p) => Number(p.parte ?? 1) === 1)) return "Falta enviar a frente";
  return null;
}