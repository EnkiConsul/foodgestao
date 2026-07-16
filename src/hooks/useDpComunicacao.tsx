import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { toast } from "sonner";

export type DpAviso = {
  id: string;
  company_id: string;
  titulo: string;
  conteudo: string;
  prioridade: "baixa" | "normal" | "alta" | "urgente";
  escopo: "todos" | "unidade" | "cargo";
  unidade_id: string | null;
  cargo_id: string | null;
  publicado_em: string;
  expira_em: string | null;
  fixado: boolean;
  autor_id: string | null;
  arquivo_path: string | null;
  arquivo_mime: string | null;
  created_at: string;
  updated_at: string;
};

export type DpMensagem = {
  id: string;
  company_id: string;
  remetente_id: string | null;
  destinatario_colaborador_id: string | null;
  destinatario_user_id: string | null;
  assunto: string;
  corpo: string;
  lida_em: string | null;
  created_at: string;
  updated_at: string;
};

export function useDpAvisos() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dp_avisos", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_avisos")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("fixado", { ascending: false })
        .order("publicado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DpAviso[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (input: Partial<DpAviso> & { titulo: string; conteudo: string }) => {
      const { data: userRes } = await supabase.auth.getUser();
      const payload = {
        ...input,
        company_id: selectedCompanyId!,
        autor_id: input.autor_id ?? userRes.user?.id ?? null,
      };
      if (input.id) {
        const { data, error } = await supabase.from("dp_avisos").update(payload).eq("id", input.id).select("id").single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase.from("dp_avisos").insert(payload as any).select("id").single();
        if (error) throw error;
        return data;
      }
    },

    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_avisos"] });
      toast.success("Aviso salvo");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar aviso"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_avisos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_avisos"] });
      toast.success("Aviso removido");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao remover"),
  });

  return { ...query, upsert, remove };
}

export function useDpMensagens() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dp_mensagens", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_mensagens")
        .select("*, dp_colaboradores(nome)")
        .eq("company_id", selectedCompanyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const send = useMutation({
    mutationFn: async (input: {
      destinatario_colaborador_id: string | null;
      assunto: string;
      corpo: string;
    }) => {
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase.from("dp_mensagens").insert({
        company_id: selectedCompanyId!,
        remetente_id: userRes.user?.id ?? null,
        destinatario_colaborador_id: input.destinatario_colaborador_id,
        assunto: input.assunto,
        corpo: input.corpo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_mensagens"] });
      toast.success("Mensagem enviada");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao enviar"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_mensagens").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_mensagens"] });
      toast.success("Mensagem removida");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao remover"),
  });

  return { ...query, send, remove };
}

export function useAniversariantes() {
  const { selectedCompanyId } = useCompanyContext();
  return useQuery({
    queryKey: ["dp_aniversariantes", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_colaboradores")
        .select("id, nome, data_nascimento, cargo")
        .eq("company_id", selectedCompanyId!)
        .eq("ativo", true)
        .not("data_nascimento", "is", null);
      if (error) throw error;
      const now = new Date();
      const currentMonth = now.getMonth();
      const today = now.getDate();
      const list = (data ?? [])
        .map((c: any) => {
          const d = new Date(c.data_nascimento);
          return { ...c, _mes: d.getUTCMonth(), _dia: d.getUTCDate() };
        })
        .filter((c) => c._mes === currentMonth)
        .sort((a, b) => a._dia - b._dia);
      return { list, today, currentMonth };
    },
  });
}
