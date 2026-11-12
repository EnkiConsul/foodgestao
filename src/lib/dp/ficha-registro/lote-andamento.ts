/**
 * Envios de fichas de registro: qual abrir primeiro e como descrever cada um.
 *
 * A tela deve acolher o trabalho que ficou pela metade antes de pedir um
 * arquivo novo — por isso o lote aberto é o primeiro com fichas a conferir (ou
 * em leitura), não simplesmente o envio mais recente.
 */

export const STATUS_FICHA_PENDENTE = ["pendente", "revisar", "duplicado"] as const;

export interface ResumoEnvioFichas {
  total: number;
  pendentes: number;
  ignoradas: number;
  noCadastro: number;
}

export interface EnvioFichas {
  id: string;
  status: string;
  fichas_identificadas?: number | null;
}

/** Conta as fichas de cada envio a partir de (importacao_id, status). */
export function resumirEnvios(
  linhas: ReadonlyArray<{ importacao_id: string; status: string }>,
): Record<string, ResumoEnvioFichas> {
  const out: Record<string, ResumoEnvioFichas> = {};
  for (const l of linhas) {
    const r = (out[l.importacao_id] ??= { total: 0, pendentes: 0, ignoradas: 0, noCadastro: 0 });
    r.total += 1;
    if ((STATUS_FICHA_PENDENTE as readonly string[]).includes(l.status)) r.pendentes += 1;
    else if (l.status === "ignorado") r.ignoradas += 1;
    else if (l.status === "criado" || l.status === "atualizado") r.noCadastro += 1;
  }
  return out;
}

/** Envio ainda em trabalho: lendo/na fila ou lido com fichas a conferir. */
export function envioEmAndamento(env: EnvioFichas, resumo?: ResumoEnvioFichas): boolean {
  if (env.status === "processing" || env.status === "pending") return true;
  return env.status === "ready" && (resumo?.pendentes ?? 0) > 0;
}

/**
 * Envio que a tela abre quando a pessoa não escolheu nenhum: o mais recente
 * entre os que ainda têm trabalho; sem nenhum, o mais recente da lista.
 * `envios` vem do mais novo para o mais antigo.
 */
export function envioParaAbrir<T extends EnvioFichas>(
  envios: readonly T[],
  resumo: Record<string, ResumoEnvioFichas>,
): T | null {
  return envios.find((e) => envioEmAndamento(e, resumo[e.id])) ?? envios[0] ?? null;
}

/** Situação do envio em português de tela (lista "Fichas enviadas"). */
export function situacaoEnvio(env: EnvioFichas, resumo?: ResumoEnvioFichas): string {
  if (env.status === "processing") return "lendo páginas";
  if (env.status === "pending") return "na fila de leitura";
  if (env.status === "failed") return "não foi possível ler";
  const r = resumo;
  if (!r || r.total === 0) {
    const n = env.fichas_identificadas ?? 0;
    return n === 0 ? "nenhuma ficha reconhecida" : `${n} ${n === 1 ? "ficha lida" : "fichas lidas"}`;
  }
  if (r.pendentes > 0) {
    return `${r.pendentes} ${r.pendentes === 1 ? "ficha aguardando" : "fichas aguardando"} conferência`;
  }
  const partes = [`${r.noCadastro} já no cadastro`];
  if (r.ignoradas > 0) partes.push(`${r.ignoradas} ${r.ignoradas === 1 ? "ignorada" : "ignoradas"}`);
  return partes.join(" · ");
}
