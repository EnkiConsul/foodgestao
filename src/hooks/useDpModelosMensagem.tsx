import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { toast } from "sonner";

export type DpModeloMensagem = {
  id: string;
  company_id: string;
  titulo: string;
  canal: "whatsapp" | "email" | "sms";
  corpo: string;
  variaveis: string[] | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
};

export function useDpModelosMensagem(canal?: DpModeloMensagem["canal"]) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dp_modelos_mensagem", selectedCompanyId, canal ?? "all"],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("dp_modelos_mensagem")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .eq("ativo", true)
        .order("titulo", { ascending: true });
      if (canal) q = q.eq("canal", canal);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as unknown) as DpModeloMensagem[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (input: Partial<DpModeloMensagem> & { titulo: string; corpo: string; canal: DpModeloMensagem["canal"] }) => {
      const payload: any = { ...input, company_id: selectedCompanyId! };
      if (input.id) {
        const { error } = await supabase.from("dp_modelos_mensagem").update(payload).eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("dp_modelos_mensagem").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_modelos_mensagem"] });
      toast.success("Modelo salvo");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  return { ...query, upsert };
}

/** Convenience alias: exposes `.nome` reading `titulo` for UIs that use "nome". */
export function modeloDisplayName(m: DpModeloMensagem): string {
  return m.titulo;
}

export function applyModeloVars(corpo: string, ctx: Record<string, string | number | null | undefined>): string {
  return corpo.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    const v = ctx[key];
    return v == null ? "" : String(v);
  });
}
