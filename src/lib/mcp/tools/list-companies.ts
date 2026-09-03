import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser, notAuthenticated } from "../supabase";

export default defineTool({
  name: "list_companies",
  title: "Listar empresas",
  description: "Lista as empresas (perfis PJ) que o usuário conectado pode acessar no Aveto 360.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("companies")
      .select("id, name, trade_name, cnpj, is_active, profile_type, cidade, uf")
      .order("name");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { companies: data ?? [] },
    };
  },
});
