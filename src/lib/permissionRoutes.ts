import type { ModuleKey } from "@/lib/permissions";

/**
 * Qual item da matriz de permissões protege cada tela.
 * A regra mais específica (prefixo mais longo) vence.
 */
const ROUTES: [string, ModuleKey][] = [
  ["/dashboard", "dashboard"],
  ["/lancamentos", "transactions"],
  ["/contas-bancarias", "accounts"],
  ["/cartoes-credito", "credit_cards"],
  ["/conciliacao", "conciliacao"],
  ["/open-finance", "conciliacao"],
  ["/formas-pagamento", "payment_methods"],
  ["/centros-custo", "categories"],
  ["/categorias", "categories"],
  ["/contas-contabeis", "categories"],
  ["/contatos", "contacts"],
  ["/relatorios/fluxo-caixa", "cash_flow"],
  ["/relatorios", "reports"],
  ["/dp/colaboradores", "dp.colaboradores"],
  ["/dp/preadmiss", "dp.colaboradores"],
  ["/dp/escalas", "dp.escalas"],
  ["/dp/jornadas", "dp.escalas"],
  ["/dp/turnos", "dp.escalas"],
  ["/dp/folgas", "dp.folgas"],
  ["/dp/ferias", "dp.ferias"],
  ["/dp/convocac", "dp.convocacoes"],
  ["/dp/ocorrencias", "dp.ocorrencias"],
  ["/dp/atestados", "dp.ocorrencias"],
  ["/dp/disciplinar", "dp.ocorrencias"],
  ["/dp/documentos", "dp.documentos"],
  ["/dp/avisos", "dp.avisos"],
  ["/dp/comunicacao", "dp.avisos"],
  ["/dp/mensagens", "dp.avisos"],
  ["/dp/beneficios", "dp.beneficios"],
  ["/dp/vales", "dp.beneficios"],
  ["/dp/cargos", "dp.cadastros"],
  ["/dp/setores", "dp.cadastros"],
  ["/dp/unidades", "dp.cadastros"],
  ["/dp/sindicatos", "dp.cadastros"],
  ["/dp/cadastros", "dp.cadastros"],
  ["/dp/relatorios", "dp.relatorios"],
  ["/empresas", "conta.empresa"],
  ["/gestao-usuarios", "conta.usuarios"],
  ["/auditoria", "conta.auditoria"],
].sort((a, b) => b[0].length - a[0].length) as [string, ModuleKey][];

export function itemDaRota(pathname: string): ModuleKey | null {
  // Portal do colaborador tem regras próprias.
  if (pathname.startsWith("/dp/meu")) return null;
  const hit = ROUTES.find(([p]) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p));
  return hit ? hit[1] : null;
}
