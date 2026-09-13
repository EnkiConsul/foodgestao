import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { toast } from "sonner";
import { notifyError } from "@/lib/notifyError";

export type DpModeloTipo = "aniversario" | "tempo_de_casa" | "outro";

export type DpModeloMensagem = {
  id: string;
  company_id: string;
  titulo: string;
  canal: "whatsapp" | "email" | "sms";
  tipo: DpModeloTipo;
  assunto: string | null;
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
    mutationFn: async (
      input: Partial<DpModeloMensagem> & { titulo: string; corpo: string; canal: DpModeloMensagem["canal"] },
    ) => {
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
    onError: (e: any) => notifyError(e, { surface: "Sistema", action: "concluir a ação", fallback: "Erro" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("dp_modelos_mensagem")
        .update({ ativo: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_modelos_mensagem"] });
      toast.success("Modelo removido");
    },
    onError: (e: any) => notifyError(e, { surface: "Sistema", action: "concluir a ação", fallback: "Erro ao remover" }),
  });

  return { ...query, upsert, remove };
}

export function modeloDisplayName(m: DpModeloMensagem): string {
  return m.titulo;
}

/** Normaliza a chave da variável: sem acento, minúscula, sem espaços extras. */
function normalizeVarKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Sinônimos amigáveis usados nos modelos cadastrados pelas empresas. */
const VAR_SYNONYMS: Record<string, string> = {
  nome: "nome",
  "nome do colaborador": "nome",
  colaborador: "nome",
  empresa: "empresa",
  "nome da empresa": "empresa",
  link: "link",
  "link do portal": "link",
  "link portal": "link",
  "link de acesso": "link",
  "link do portal colaborador": "link",
  "link do portal do colaborador": "link",
  "portal colaborador": "link",
  "portal do colaborador": "link",
  endereco: "link",
  url: "link",
  site: "link",
  portal: "link",
  usuario: "usuario",
  "usuario (cpf)": "usuario",
  login: "usuario",
  cpf: "usuario",
  senha: "senha",
  "senha temporaria do portal": "senha",
  "senha de acesso": "senha",
  "senha temporaria": "senha",
  "senha provisoria": "senha",
  "nova senha": "senha",
  data: "data",
  unidade: "unidade",
  cargo: "cargo",
};

/**
 * Substitui variáveis do modelo. Aceita `{{chave}}` e `{Rótulo Amigável}`,
 * comparando sem acento/caixa. Chave desconhecida permanece literal para o
 * gestor perceber e ajustar o modelo.
 */
export function applyModeloVars(corpo: string, ctx: Record<string, string | number | null | undefined>): string {
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(ctx)) {
    if (v == null || v === "") continue;
    const norm = normalizeVarKey(k);
    map.set(norm, String(v));
    const canon = VAR_SYNONYMS[norm];
    if (canon && !map.has(canon)) map.set(canon, String(v));
  }

  const lookup = (raw: string): string | null => {
    const norm = normalizeVarKey(raw);
    if (map.has(norm)) return map.get(norm)!;
    const canon = VAR_SYNONYMS[norm];
    if (canon && map.has(canon)) return map.get(canon)!;
    return null;
  };

  return corpo
    .replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (full, key: string) => lookup(key) ?? full)
    .replace(/\{\s*([^{}]+?)\s*\}/g, (full, key: string) => lookup(key) ?? full);
}
