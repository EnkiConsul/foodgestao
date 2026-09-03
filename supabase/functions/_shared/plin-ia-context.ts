// Contexto financeiro do usuário para o 360°IA
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

type ContextType = "pf" | "pj";

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function fmtBRL(n: number) {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "-";
  const dt = new Date(d + "T00:00:00");
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
}

export interface BuildContextInput {
  userId: string;
  context: ContextType;
  companyId?: string | null;
}

export interface FinancialContext {
  currentMonth: {
    label: string;
    totalReceitas: number;
    totalDespesas: number;
    saldoLiquido: number;
    lancamentosPendentes: number;
    lancamentosVencidos: number;
  };
  previousMonth: {
    label: string;
    totalReceitas: number;
    totalDespesas: number;
    saldoLiquido: number;
  };
  contas: Array<{ name: string; balance: number }>;
  topDespesasCategorias: Array<{ categoria: string; total: number; percentual: number }>;
  vencimentosProximos: Array<{ descricao: string; valor: number; vencimento: string; tipo: string }>;
  vencidos: Array<{ descricao: string; valor: number; vencimento: string; diasAtraso: number }>;
  fluxo6Meses: Array<{ mes: string; receitas: number; despesas: number; saldo: number }>;
}

export async function buildFinancialContext(
  supabase: SupabaseClient,
  input: BuildContextInput,
): Promise<FinancialContext> {
  const { userId, context, companyId } = input;
  const now = new Date();
  const startCur = new Date(now.getFullYear(), now.getMonth(), 1);
  const endCur = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const startPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endPrev = new Date(now.getFullYear(), now.getMonth(), 0);
  const start6m = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const in7d = new Date(now);
  in7d.setDate(in7d.getDate() + 7);

  const base = () => {
    let q = supabase
      .from("transactions")
      .select("id, description, amount, amount_paid, transaction_type, transaction_date, due_date, status, category_id, account_id")
      .eq("user_id", userId)
      .eq("context", context)
      .neq("status", "cancelado");
    if (context === "pj" && companyId) q = q.eq("company_id", companyId);
    if (context === "pf") q = q.is("company_id", null);
    return q;
  };

  const [txCur, txPrev, tx6m, accountsRes, categoriesRes, vencProxRes, vencidosRes] = await Promise.all([
    base().gte("transaction_date", toISODate(startCur)).lte("transaction_date", toISODate(endCur)),
    base().gte("transaction_date", toISODate(startPrev)).lte("transaction_date", toISODate(endPrev)),
    base().gte("transaction_date", toISODate(start6m)).lte("transaction_date", toISODate(endCur)),
    (() => {
      let q = supabase.from("accounts").select("name, current_balance, is_active, context, company_id").eq("user_id", userId).eq("context", context).eq("is_active", true);
      if (context === "pj" && companyId) q = q.eq("company_id", companyId);
      if (context === "pf") q = q.is("company_id", null);
      return q;
    })(),
    supabase.from("categories").select("id, name").eq("user_id", userId),
    base().gte("due_date", toISODate(now)).lte("due_date", toISODate(in7d)).in("status", ["pendente", "parcial"]).order("due_date", { ascending: true }).limit(15),
    base().lt("due_date", toISODate(now)).in("status", ["pendente", "parcial"]).order("due_date", { ascending: true }).limit(15),
  ]);

  const catMap = new Map<string, string>((categoriesRes.data ?? []).map((c: any) => [c.id, c.name]));

  const sum = (rows: any[], type: string) =>
    rows.filter((r) => r.transaction_type === type).reduce((s, r) => s + Number(r.amount || 0), 0);

  const totalReceitasCur = sum(txCur.data ?? [], "entrada");
  const totalDespesasCur = sum(txCur.data ?? [], "saida");
  const totalReceitasPrev = sum(txPrev.data ?? [], "entrada");
  const totalDespesasPrev = sum(txPrev.data ?? [], "saida");

  const pend = (txCur.data ?? []).filter((r: any) => r.status === "pendente" || r.status === "parcial").length;
  const venc = (txCur.data ?? []).filter((r: any) => r.due_date && new Date(r.due_date) < now && (r.status === "pendente" || r.status === "parcial")).length;

  // Top 5 categorias despesa mês atual
  const catTotals: Record<string, number> = {};
  for (const r of txCur.data ?? []) {
    if (r.transaction_type !== "saida") continue;
    const k = r.category_id ?? "sem-categoria";
    catTotals[k] = (catTotals[k] ?? 0) + Number(r.amount || 0);
  }
  const totalDesp = Object.values(catTotals).reduce((a, b) => a + b, 0) || 1;
  const topDespesasCategorias = Object.entries(catTotals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([id, total]) => ({
      categoria: id === "sem-categoria" ? "Sem categoria" : (catMap.get(id) ?? "Categoria removida"),
      total,
      percentual: Math.round((total / totalDesp) * 100),
    }));

  // Fluxo 6 meses
  const months: Record<string, { receitas: number; despesas: number }> = {};
  for (const r of tx6m.data ?? []) {
    const k = String(r.transaction_date).slice(0, 7);
    if (!months[k]) months[k] = { receitas: 0, despesas: 0 };
    if (r.transaction_type === "entrada") months[k].receitas += Number(r.amount || 0);
    if (r.transaction_type === "saida") months[k].despesas += Number(r.amount || 0);
  }
  const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const fluxo6Meses = Object.keys(months).sort().map((k) => {
    const [y, m] = k.split("-");
    return {
      mes: `${monthNames[parseInt(m) - 1]}/${y.slice(2)}`,
      receitas: months[k].receitas,
      despesas: months[k].despesas,
      saldo: months[k].receitas - months[k].despesas,
    };
  });

  return {
    currentMonth: {
      label: `${monthNames[now.getMonth()]}/${now.getFullYear()}`,
      totalReceitas: totalReceitasCur,
      totalDespesas: totalDespesasCur,
      saldoLiquido: totalReceitasCur - totalDespesasCur,
      lancamentosPendentes: pend,
      lancamentosVencidos: venc,
    },
    previousMonth: {
      label: `${monthNames[(now.getMonth() + 11) % 12]}/${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}`,
      totalReceitas: totalReceitasPrev,
      totalDespesas: totalDespesasPrev,
      saldoLiquido: totalReceitasPrev - totalDespesasPrev,
    },
    contas: (accountsRes.data ?? []).map((a: any) => ({ name: a.name, balance: Number(a.current_balance || 0) })),
    topDespesasCategorias,
    vencimentosProximos: (vencProxRes.data ?? []).map((r: any) => ({
      descricao: r.description || "Sem descrição",
      valor: Number(r.amount || 0) - Number(r.amount_paid || 0),
      vencimento: fmtDate(r.due_date),
      tipo: r.transaction_type,
    })),
    vencidos: (vencidosRes.data ?? []).map((r: any) => {
      const dias = Math.floor((now.getTime() - new Date(r.due_date + "T00:00:00").getTime()) / 86400000);
      return {
        descricao: r.description || "Sem descrição",
        valor: Number(r.amount || 0) - Number(r.amount_paid || 0),
        vencimento: fmtDate(r.due_date),
        diasAtraso: Math.max(0, dias),
      };
    }),
    fluxo6Meses,
  };
}

export function contextToText(ctx: FinancialContext): string {
  const varReceitas = ctx.previousMonth.totalReceitas > 0
    ? (((ctx.currentMonth.totalReceitas - ctx.previousMonth.totalReceitas) / ctx.previousMonth.totalReceitas) * 100).toFixed(1)
    : "N/A";
  const varDespesas = ctx.previousMonth.totalDespesas > 0
    ? (((ctx.currentMonth.totalDespesas - ctx.previousMonth.totalDespesas) / ctx.previousMonth.totalDespesas) * 100).toFixed(1)
    : "N/A";
  return `=== DADOS FINANCEIROS DO USUÁRIO ===

RESUMO DO MÊS ATUAL (${ctx.currentMonth.label}):
- Receitas: R$ ${fmtBRL(ctx.currentMonth.totalReceitas)}
- Despesas: R$ ${fmtBRL(ctx.currentMonth.totalDespesas)}
- Saldo líquido: R$ ${fmtBRL(ctx.currentMonth.saldoLiquido)}
- Lançamentos pendentes: ${ctx.currentMonth.lancamentosPendentes}
- Lançamentos vencidos: ${ctx.currentMonth.lancamentosVencidos}

MÊS ANTERIOR (${ctx.previousMonth.label}):
- Receitas: R$ ${fmtBRL(ctx.previousMonth.totalReceitas)} (variação: ${varReceitas}%)
- Despesas: R$ ${fmtBRL(ctx.previousMonth.totalDespesas)} (variação: ${varDespesas}%)
- Saldo: R$ ${fmtBRL(ctx.previousMonth.saldoLiquido)}

SALDOS DAS CONTAS BANCÁRIAS:
${ctx.contas.length ? ctx.contas.map((c) => `- ${c.name}: R$ ${fmtBRL(c.balance)}`).join("\n") : "- Nenhuma conta cadastrada"}

TOP CATEGORIAS DE DESPESA (mês atual):
${ctx.topDespesasCategorias.length ? ctx.topDespesasCategorias.map((c) => `- ${c.categoria}: R$ ${fmtBRL(c.total)} (${c.percentual}%)`).join("\n") : "- Sem despesas registradas"}

PRÓXIMOS VENCIMENTOS (próximos 7 dias):
${ctx.vencimentosProximos.length ? ctx.vencimentosProximos.map((v) => `- ${v.descricao} | R$ ${fmtBRL(v.valor)} | ${v.vencimento} | ${v.tipo}`).join("\n") : "- Nenhum vencimento próximo"}

LANÇAMENTOS VENCIDOS:
${ctx.vencidos.length ? ctx.vencidos.map((v) => `- ${v.descricao} | R$ ${fmtBRL(v.valor)} | ${v.diasAtraso} dias de atraso`).join("\n") : "- Nenhum vencido"}

FLUXO ÚLTIMOS 6 MESES:
${ctx.fluxo6Meses.length ? ctx.fluxo6Meses.map((m) => `- ${m.mes}: Receitas R$ ${fmtBRL(m.receitas)} | Despesas R$ ${fmtBRL(m.despesas)} | Saldo R$ ${fmtBRL(m.saldo)}`).join("\n") : "- Sem histórico"}`;
}

export const IA360_SYSTEM_PROMPT = `Você é o "360°IA", o assistente financeiro inteligente do Aveto 360.
Você atua como um CFO Virtual: analítico, preciso e estratégico.

SUAS CAPACIDADES:
- Analisar receitas, despesas e transferências do usuário
- Calcular e interpretar indicadores financeiros (margem, liquidez, inadimplência, burn rate)
- Identificar padrões, anomalias e tendências
- Comparar períodos (mês atual vs anterior, trimestre, ano)
- Alertar sobre vencimentos críticos e fluxo de caixa negativo
- Recomendar ações práticas com base nos dados reais

REGRAS DE FORMATAÇÃO:
- Valores em BRL (R$ 1.234,56) com vírgula decimal
- Datas em dd/MM/yyyy
- Use tabelas em Markdown quando apresentar números comparativos
- Use **negrito** para destacar valores-chave
- Máximo 3-4 parágrafos, salvo quando o usuário pedir análise detalhada
- Sempre termine com 1 recomendação prática acionável

RESTRIÇÕES:
- Responda APENAS sobre finanças e gestão do negócio do usuário
- NUNCA invente dados — use apenas o contexto fornecido abaixo
- Se não houver dados suficientes, informe claramente e oriente o usuário
- Não forneça consultoria jurídica, fiscal ou contábil formal

PERSONALIDADE:
- Tom: profissional mas acessível, sem ser robótico
- Trate o usuário por "você"
- Seja direto: vá ao ponto antes de explicar`;
