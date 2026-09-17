import type { HelpKey } from "@/content/help/helpContent";

/**
 * Registro explícito de rota → ajuda da funcionalidade.
 *
 * Usado apenas como padrão dos cabeçalhos compartilhados (título principal da
 * tela) quando a própria tela não informa uma chave. Não há heurística por
 * texto: toda rota listada aqui foi mapeada manualmente.
 */
export const HELP_BY_ROUTE: Record<string, HelpKey> = {
  // Financeiro
  "/hub": "hub.modulos",
  "/dashboard": "dashboard.visao",
  "/lancamentos": "financeiro.lancamentos",
  "/contas-bancarias": "financeiro.contas",
  "/contas-bancarias/conciliacao": "financeiro.conciliacao",
  "/contas-bancarias/conciliacao/extrato": "financeiro.conciliacao",
  "/contas-bancarias/conexoes": "financeiro.conexoes",
  "/cartoes-credito": "financeiro.cartoes",
  "/categorias": "financeiro.categorias",
  "/centros-custo": "financeiro.centrosCusto",
  "/contas-contabeis": "financeiro.contasContabeis",
  "/formas-pagamento": "financeiro.formasPagamento",
  "/contatos": "financeiro.contatos",
  "/relatorios/fluxo-caixa": "financeiro.relatorioFluxoCaixa",
  "/relatorios/contabeis": "financeiro.relatoriosContabeis",
  "/empresas": "empresas.cadastro",
  "/gestao-usuarios": "empresas.usuarios",
  "/configuracoes": "conta.configuracoes",
  "/faturas": "conta.faturas",
  "/planos": "conta.planos",

  // Pessoas 360°
  "/dp": "dp.inicio",
  "/dp/colaboradores": "dp.colaboradores",
  "/dp/colaboradores/importar-ficha": "dp.importarFicha",
  "/dp/colaboradores/lixeira": "dp.lixeira",
  "/dp/colaboradores/pre-admissoes": "dp.preadmissoes",
  "/dp/folgas": "dp.folgas",
  "/dp/ferias": "dp.ferias",
  "/dp/escalas": "dp.escalas",
  "/dp/escalas/mes": "dp.operacaoPanorama",
  "/dp/convocacoes": "dp.convocacoes",
  "/dp/ocorrencias": "dp.ocorrencias",
  "/dp/atestados": "dp.atestados",
  "/dp/disciplinar": "dp.disciplinar",
  "/dp/documentos": "dp.documentos",
  "/dp/documentos/inicio": "dp.documentos",
  "/dp/documentos/historico": "dp.documentosHistorico",
  "/dp/avisos": "dp.avisos",
  "/dp/mensagens": "dp.mensagens",
  "/dp/modelos-mensagem": "dp.modelosMensagem",
  "/dp/comunicacao": "dp.mensagens",
  "/dp/notificacoes": "dp.notificacoes",
  "/dp/rotina": "dp.rotina",
  "/dp/analytics": "dp.analytics",
  "/dp/erros": "dp.erros",
  "/dp/calendario": "dp.calendario",
  "/dp/geral": "dp.inicio",
  "/dp/cadastros": "dp.cadastros",
  "/dp/cadastros/unidades": "dp.unidades",
  "/dp/cadastros/cargos": "dp.cargos",
  "/dp/cadastros/beneficios": "dp.beneficios",
  "/dp/cadastros/pendencias": "dp.pendencias",
  "/dp/configuracoes": "dp.configuracoes",
  "/dp/configuracoes/prazos-pendencias": "dp.pendencias",

  // Portal do Colaborador
  "/dp/meu": "portal.inicio",
  "/dp/meu/mural": "portal.mural",
  "/dp/meu/perfil": "portal.perfil",
  "/dp/meu/documentos": "portal.documentos",
  "/dp/meu/solicitacoes": "portal.solicitacoes",
  "/dp/meu/trocas": "portal.trocas",
  "/dp/meu/ferias": "portal.ferias",
  "/dp/meu/calendario": "dp.calendario",
  "/dp/meu/escala": "portal.escala",
  "/dp/meu/rotina": "dp.rotina",
  "/dp/meu/convocacoes": "portal.convocacoes",
  "/dp/meu/sindicato": "portal.sindicato",
  "/dp/meu/historico": "portal.historico",

  // Administração
  "/admin/estatisticas": "admin.estatisticas",
  "/admin/clientes": "admin.clientes",
  "/admin/cadastros": "admin.cadastrosPadrao",
  "/admin/categorias-padrao": "admin.cadastrosPadrao",
  "/admin/contas-contabeis-padrao": "admin.cadastrosPadrao",
  "/admin/formas-pagamento-padrao": "admin.cadastrosPadrao",
  "/admin/planos": "admin.planos",
  "/admin/assinaturas": "admin.assinaturas",
  "/admin/faturamento": "admin.faturamento",
  "/admin/cupons": "admin.cupons",
  "/admin/faturas": "admin.faturamento",
  "/admin/webhooks-asaas": "admin.webhooks",
  "/admin/pluggy-webhook": "admin.webhooks",
  "/admin/pluggy-status": "admin.pluggyStatus",
  "/admin/perfis-acesso": "admin.perfisAcesso",
  "/admin/donos": "admin.donos",
  "/admin/auditoria": "admin.auditoria",
  "/admin/erros": "admin.erros",
  "/admin/conectados": "admin.conectados",
  "/admin/acessos": "admin.acessos",
  "/admin/resetar-dados": "admin.resetarDados",
  "/admin/documentos-legais": "admin.documentosLegais",
  "/admin/bancos": "admin.bancos",
  "/admin/auditoria-saldos": "admin.driftSaldos",
  "/admin/saude-sistema": "admin.saudeSistema",
  "/admin/seo-indexacao": "admin.seo",
  "/admin/modulos": "admin.modulos",
  "/admin/telas": "admin.telasDesenvolvimento",
  "/admin/categorizacao-ia": "admin.categorizacaoIa",
};

/** Resolve a ajuda da rota atual (correspondência exata, depois prefixo mais longo). */
export function resolveHelpForPath(pathname: string | undefined): HelpKey | undefined {
  if (!pathname) return undefined;
  const limpo = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const direto = HELP_BY_ROUTE[limpo];
  if (direto) return direto;
  let melhor: { rota: string; chave: HelpKey } | undefined;
  for (const [rota, chave] of Object.entries(HELP_BY_ROUTE)) {
    if (limpo.startsWith(`${rota}/`) && (!melhor || rota.length > melhor.rota.length)) {
      melhor = { rota, chave };
    }
  }
  return melhor?.chave;
}
