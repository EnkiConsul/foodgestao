import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthenticated } from "../supabase";

export default defineTool({
  name: "list_accounts",
  title: "Listar contas e saldos",
  description:
    "Lista as contas bancárias/caixa com o saldo atual. Opcionalmente filtra por empresa (company_id) ou contexto PF/PJ.",
  inputSchema: {
    company_id: z.string().uuid().optional().describe("Filtra pelas contas de uma empresa (PJ)."),
    context: z.enum(["pf", "pj"]).optional().describe("Contexto: pessoal (pf) ou empresarial (pj)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ company_id, context }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("accounts")
      .select("id, name, account_type, context, company_id, current_balance, is_active, bank_slug")
      .is("soft_deleted_at", null)
      .order("name");
    if (company_id) query = query.eq("company_id", company_id);
    if (context) query = query.eq("context", context);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = data ?? [];
    const total = rows.reduce((sum, r) => sum + Number(r.current_balance ?? 0), 0);
    return {
      content: [{ type: "text", text: JSON.stringify({ total_balance: total, accounts: rows }, null, 2) }],
      structuredContent: { total_balance: total, accounts: rows },
    };
  },
});
