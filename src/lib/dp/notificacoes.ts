// Utilitários de apresentação das notificações do Pessoas 360°.
// Linguagem amigável: nunca expor nomes técnicos (tabelas, RPCs, UUIDs).

/** Rótulo amigável da origem da notificação (por ref_table). */
export const NOTIFICACAO_ORIGEM_LABEL: Record<string, string> = {
  dp_solicitacoes: "Solicitações",
  dp_trocas: "Trocas de escala",
  dp_registros_disciplinares: "Disciplinar",
  dp_atestados: "Atestados",
  dp_documentos: "Documentos",
  dp_avisos: "Avisos",
  dp_ocorrencias: "Ocorrências",
  dp_indisponibilidades: "Disponibilidade",
  dp_ferias_periodos: "Férias",
  dp_ferias_gozos: "Férias",
  dp_convocacoes: "Convocações",
  dp_folgas: "Folgas",
  companies: "Disponibilidade",
};

export function notificacaoOrigemLabel(refTable: string | null | undefined): string {
  if (!refTable) return "Aviso";
  return NOTIFICACAO_ORIGEM_LABEL[refTable] ?? "Aviso";
}

/** Destino ao abrir a notificação na visão do GESTOR. */
export const NOTIFICACAO_PATH_GESTOR: Record<string, string> = {
  dp_solicitacoes: "/dp/folgas?aba=solicitacoes",
  dp_trocas: "/dp/folgas?aba=trocas",
  dp_registros_disciplinares: "/dp/disciplinar",
  dp_atestados: "/dp/atestados",
  dp_documentos: "/dp/documentos",
  dp_avisos: "/dp/avisos",
  dp_ocorrencias: "/dp/ocorrencias",
  dp_indisponibilidades: "/dp/rotina",
  dp_ferias_periodos: "/dp/ferias",
  dp_ferias_gozos: "/dp/ferias",
  dp_folgas: "/dp/folgas",
};

export function notificacaoPathGestor(refTable: string | null | undefined): string {
  if (!refTable) return "/dp/notificacoes";
  return NOTIFICACAO_PATH_GESTOR[refTable] ?? "/dp/notificacoes";
}

/** Destino ao abrir a notificação no PORTAL do colaborador. */
export const NOTIFICACAO_PATH_PORTAL: Record<string, string> = {
  dp_solicitacoes: "/dp/meu",
  dp_trocas: "/dp/meu/calendario",
  dp_registros_disciplinares: "/dp/meu/documentos?tipo=disciplinar",
  dp_atestados: "/dp/meu/documentos?tipo=atestado",
  dp_documentos: "/dp/meu/documentos",
  dp_avisos: "/dp/meu",
  dp_ocorrencias: "/dp/meu",
  dp_indisponibilidades: "/dp/meu/calendario",
  dp_ferias_periodos: "/dp/meu",
  dp_ferias_gozos: "/dp/meu",
  dp_folgas: "/dp/meu/calendario",
  dp_convocacoes: "/dp/meu/convocacoes",
  companies: "/dp/meu/calendario",
};

export function notificacaoPathPortal(refTable: string | null | undefined): string {
  if (!refTable) return "/dp/meu";
  return NOTIFICACAO_PATH_PORTAL[refTable] ?? "/dp/meu";
}

type NotificacaoLidaInput = {
  lida_em: string | null;
  user_id: string | null;
};

/**
 * Uma notificação está lida PARA O USUÁRIO ATUAL quando:
 * - é pessoal (user_id preenchido) e tem lida_em; ou
 * - é compartilhada e existe leitura individual dele.
 */
export function notificacaoLida(
  n: NotificacaoLidaInput,
  leiturasIds: ReadonlySet<string>,
  notificacaoId: string,
): boolean {
  if (n.lida_em) return true;
  if (n.user_id) return false; // pessoal sem lida_em => não lida
  return leiturasIds.has(notificacaoId);
}
