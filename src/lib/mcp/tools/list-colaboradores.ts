import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthenticated } from "../supabase";

export default defineTool({
  name: "list_colaboradores",
  title: "Listar colaboradores (Pessoas 360°)",
  description:
    "Lista os colaboradores de uma empresa no módulo Pessoas 360°, com cargo, unidade, vínculo e situação.",
  inputSchema: {
    company_id: z.string().uuid().describe("Empresa (PJ) dos colaboradores."),
    apenas_ativos: z.boolean().default(true).describe("Quando verdadeiro, retorna somente colaboradores ativos."),
    limit: z.number().int().min(1).max(200).default(100).describe("Máximo de registros (1-200)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ company_id, apenas_ativos, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("dp_colaboradores")
      .select(
        "id, nome, matricula, cargo, regime, vinculo_label, unidade_id, ativo, data_admissao, data_desligamento, perfil_acesso",
      )
      .eq("company_id", company_id)
      .is("deleted_at", null)
      .order("nome")
      .limit(limit ?? 100);
    if (apenas_ativos !== false) query = query.eq("ativo", true);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify({ count: data?.length ?? 0, colaboradores: data ?? [] }, null, 2) }],
      structuredContent: { count: data?.length ?? 0, colaboradores: data ?? [] },
    };
  },
});
