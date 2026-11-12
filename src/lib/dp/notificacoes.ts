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
  dp_elogios: "Reconhecimento",
  dp_desligamento_processos: "Desligamento",
  dp_ficha_importacoes: "Fichas de registro",
  dp_adiantamento_solicitacoes: "Adiantamento",
  dp_adiantamento_relacao: "Adiantamento",
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
  dp_desligamento_processos: "/dp/colaboradores",
  dp_ficha_importacoes: "/dp/colaboradores/importar-ficha",
  dp_adiantamento_solicitacoes: "/dp/adiantamentos",
  dp_adiantamento_relacao: "/dp/adiantamentos",
};

export function notificacaoPathGestor(refTable: string | null | undefined, refId?: string | null, colaboradorId?: string | null): string {
  if (!refTable) return "/dp/notificacoes";
  const base = NOTIFICACAO_PATH_GESTOR[refTable] ?? "/dp/notificacoes";
  // ref_id identifica o processo, não o colaborador.
  if (refTable === "dp_desligamento_processos" && colaboradorId) {
    return `${base}?editar=${encodeURIComponent(colaboradorId)}&aba=desligamento`;
  }
  // Lote de fichas: abre a conferência daquele envio.
  if (refTable === "dp_ficha_importacoes" && refId) return `${base}?lote=${encodeURIComponent(refId)}`;
  // Troca: abre direto o detalhe da troca envolvida.
  if (refTable === "dp_trocas" && refId) return `${base}&troca_id=${encodeURIComponent(refId)}`;
  // Adiantamento: abre a relação do mês do pedido (ou da unidade avisada).
  if (refTable === "dp_adiantamento_solicitacoes" && refId) return `${base}?solicitacao=${encodeURIComponent(refId)}`;
  if (refTable === "dp_adiantamento_relacao" && refId) return `${base}?unidade=${encodeURIComponent(refId)}`;
  // Ocorrência: abre direto o dia/colaborador e a tratativa da ocorrência.
  if (refTable === "dp_ocorrencias" && refId) return `${base}?id=${encodeURIComponent(refId)}`;
  return base;
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
  dp_elogios: "/dp/meu/documentos?tipo=disciplinar",
};

export function notificacaoPathPortal(refTable: string | null | undefined, refId?: string | null): string {
  if (!refTable) return "/dp/meu";
  // Solicitação: abre o calendário já no pedido (ex.: ajustar pedido devolvido).
  if (refTable === "dp_solicitacoes" && refId) return `/dp/meu/calendario?solicitacao=${encodeURIComponent(refId)}`;
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

type NotificacaoAudienciaInput = { user_id: string | null; para_admins: boolean | null };

/**
 * Quem vê cada notificação. Gestão: avisos administrativos compartilhados e os
 * pessoais do próprio usuário. Portal: somente os pessoais do próprio usuário.
 * Mensagens pessoais de outro colaborador ("Sua troca foi recusada") nunca
 * aparecem para quem não é o destinatário, mesmo que a permissão de leitura alcance a linha.
 */
export function notificacaoNaAudiencia(
  n: NotificacaoAudienciaInput,
  opts: { variant: "admin" | "portal"; userId: string | null | undefined },
): boolean {
  if (!opts.userId) return false;
  if (n.user_id) return n.user_id === opts.userId;
  return opts.variant === "admin" && n.para_admins === true;
}
