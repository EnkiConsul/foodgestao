import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthenticated } from "../supabase";

const DATE = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD");

export default defineTool({
  name: "list_transactions",
  title: "Listar lançamentos",
  description:
    "Lista lançamentos financeiros (entradas, saídas, contas a pagar/receber) com filtros de período, empresa, tipo e situação.",
  inputSchema: {
    company_id: z.string().uuid().optional().describe("Filtra por empresa (PJ)."),
    context: z.enum(["pf", "pj"]).optional().describe("Contexto: pessoal (pf) ou empresarial (pj)."),
    start_date: DATE.optional().describe("Data inicial (transaction_date)."),
    end_date: DATE.optional().describe("Data final (transaction_date)."),
    transaction_type: z
      .enum(["entrada", "saida", "transferencia", "parcelado"])
      .optional()
      .describe("Tipo do lançamento."),
    status: z.enum(["pendente", "confirmado", "cancelado"]).optional().describe("Situação do lançamento."),
    limit: z.number().int().min(1).max(200).default(50).describe("Máximo de registros (1-200)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ company_id, context, start_date, end_date, transaction_type, status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("transactions")
      .select(
        "id, description, amount, amount_paid, transaction_date, due_date, payment_date, transaction_type, status, bill_status, context, company_id, category_id, account_id, counterparty_name",
      )
      .is("canceled_at", null)
      .order("transaction_date", { ascending: false })
      .limit(limit ?? 50);
    if (company_id) query = query.eq("company_id", company_id);
    if (context) query = query.eq("context", context);
    if (start_date) query = query.gte("transaction_date", start_date);
    if (end_date) query = query.lte("transaction_date", end_date);
    if (transaction_type) query = query.eq("transaction_type", transaction_type);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = data ?? [];
    const entradas = rows
      .filter((r) => r.transaction_type === "entrada")
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const saidas = rows
      .filter((r) => r.transaction_type === "saida")
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const payload = { count: rows.length, total_entradas: entradas, total_saidas: saidas, transactions: rows };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
