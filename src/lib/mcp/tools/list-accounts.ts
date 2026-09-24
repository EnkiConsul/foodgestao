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
    // Saldos só pela consulta segura (respeita "Ver saldos" e contas liberadas).
    if (!company_id) {
      return {
        content: [{ type: "text", text: "Informe a empresa (company_id) para listar as contas." }],
        isError: true,
      };
    }
    const { data, error } = await (supabase as any).rpc("get_accessible_accounts", {
      _context: context ?? "pj",
      _company_id: company_id,
      _include_inactive: false,
    });
    if (error) {
      console.error("[mcp] query error:", error.message);
      return {
        content: [{ type: "text", text: "Não foi possível consultar os dados agora." }],
        isError: true,
      };
    }
    const rows = ((data ?? []) as any[])
      .filter((r) => !r.soft_deleted_at)
      .map((r) => ({
        id: r.id, name: r.name, account_type: r.account_type, context: r.context,
        company_id: r.company_id, current_balance: r.current_balance, is_active: r.is_active, bank_slug: r.bank_slug,
      }));
    const total = rows.reduce((sum, r) => sum + Number(r.current_balance ?? 0), 0);
    return {
      content: [{ type: "text", text: JSON.stringify({ total_balance: total, accounts: rows }, null, 2) }],
      structuredContent: { total_balance: total, accounts: rows },
    };
  },
});
