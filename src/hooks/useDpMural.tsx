import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export type MuralAviso = {
  id: string;
  company_id: string;
  titulo: string;
  conteudo: string;
  prioridade: string;
  publicado_em: string;
  expira_em: string | null;
  fixado: boolean;
  arquivo_path: string | null;
  leitura_obrigatoria: boolean;
  permitir_reacoes: boolean;
  permitir_comentarios: boolean;
};

export type MuralComentario = {
  id: string;
  aviso_id: string;
  user_id: string;
  autor_nome: string | null;
  conteudo: string;
  status: "pendente" | "aprovado" | "oculto";
  created_at: string;
};

export const MURAL_EMOJIS = ["👍", "🎉", "❤️", "👏", "😀"] as const;

/**
 * Feed do mural: avisos vigentes + reações, comentários e leitura do usuário atual.
 * O RLS já restringe os avisos à empresa do usuário.
 */
export function useDpMural() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const avisos = useQuery({
    queryKey: ["dp_mural_avisos", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from("dp_avisos")
        .select(
          "id, company_id, titulo, conteudo, prioridade, publicado_em, expira_em, fixado, arquivo_path, leitura_obrigatoria, permitir_reacoes, permitir_comentarios",
        )
        .lte("publicado_em", nowIso)
        .or(`expira_em.is.null,expira_em.gte.${nowIso}`)
        .order("fixado", { ascending: false })
        .order("publicado_em", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as MuralAviso[];
    },
  });

  const avisoIds = (avisos.data ?? []).map((a) => a.id);
  const idsKey = avisoIds.join(",");

  const reacoes = useQuery({
    queryKey: ["dp_mural_reacoes", idsKey],
    enabled: avisoIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_avisos_reacoes")
        .select("aviso_id, user_id, emoji")
        .in("aviso_id", avisoIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const comentarios = useQuery({
    queryKey: ["dp_mural_comentarios", idsKey],
    enabled: avisoIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_avisos_comentarios")
        .select("id, aviso_id, user_id, autor_nome, conteudo, status, created_at")
        .in("aviso_id", avisoIds)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MuralComentario[];
    },
  });

  const leituras = useQuery({
    queryKey: ["dp_mural_leituras", idsKey, user?.id],
    enabled: avisoIds.length > 0 && !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_avisos_leituras")
        .select("aviso_id, lido_em")
        .eq("user_id", user!.id)
        .in("aviso_id", avisoIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["dp_mural_reacoes"] });
    qc.invalidateQueries({ queryKey: ["dp_mural_comentarios"] });
    qc.invalidateQueries({ queryKey: ["dp_mural_leituras"] });
    qc.invalidateQueries({ queryKey: ["dp_aviso_engajamento"] });
  };

  const marcarLeitura = useMutation({
    mutationFn: async (avisoId: string) => {
      if (!user?.id) return;
      const { error } = await supabase
        .from("dp_avisos_leituras")
        .upsert({ aviso_id: avisoId, user_id: user.id }, { onConflict: "aviso_id,user_id" });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.message ?? "Erro ao confirmar leitura"),
  });

  const toggleReacao = useMutation({
    mutationFn: async ({ avisoId, emoji }: { avisoId: string; emoji: string }) => {
      if (!user?.id) return;
      const atual = (reacoes.data ?? []).find(
        (r: any) => r.aviso_id === avisoId && r.user_id === user.id,
      ) as any;
      if (atual && atual.emoji === emoji) {
        const { error } = await supabase
          .from("dp_avisos_reacoes")
          .delete()
          .eq("aviso_id", avisoId)
          .eq("user_id", user.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("dp_avisos_reacoes")
        .upsert({ aviso_id: avisoId, user_id: user.id, emoji }, { onConflict: "aviso_id,user_id" });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.message ?? "Erro ao reagir"),
  });

  const comentar = useMutation({
    mutationFn: async ({
      aviso,
      conteudo,
      autorNome,
    }: {
      aviso: MuralAviso;
      conteudo: string;
      autorNome?: string | null;
    }) => {
      if (!user?.id) return;
      const { error } = await supabase.from("dp_avisos_comentarios").insert({
        aviso_id: aviso.id,
        company_id: aviso.company_id,
        user_id: user.id,
        autor_nome: autorNome ?? user.email ?? null,
        conteudo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Comentário enviado para moderação");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao comentar"),
  });

  const removerComentario = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_avisos_comentarios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.message ?? "Erro ao remover"),
  });

  return {
    avisos,
    reacoes: reacoes.data ?? [],
    comentarios: comentarios.data ?? [],
    lidos: new Set((leituras.data ?? []).map((l: any) => l.aviso_id as string)),
    marcarLeitura,
    toggleReacao,
    comentar,
    removerComentario,
    userId: user?.id ?? null,
  };
}

/** Painel admin de engajamento de um aviso: confirmações de leitura + moderação. */
export function useDpAvisoEngajamento(avisoId: string | null) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dp_aviso_engajamento", avisoId],
    enabled: !!avisoId,
    queryFn: async () => {
      const [leiturasRes, reacoesRes, comentariosRes] = await Promise.all([
        supabase.from("dp_avisos_leituras").select("user_id, lido_em").eq("aviso_id", avisoId!),
        supabase.from("dp_avisos_reacoes").select("emoji").eq("aviso_id", avisoId!),
        supabase
          .from("dp_avisos_comentarios")
          .select("id, aviso_id, user_id, autor_nome, conteudo, status, created_at")
          .eq("aviso_id", avisoId!)
          .order("created_at", { ascending: false }),
      ]);
      if (leiturasRes.error) throw leiturasRes.error;
      return {
        leituras: leiturasRes.data ?? [],
        reacoes: reacoesRes.data ?? [],
        comentarios: (comentariosRes.data ?? []) as MuralComentario[],
      };
    },
  });

  const moderar = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "aprovado" | "oculto" }) => {
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("dp_avisos_comentarios")
        .update({
          status,
          moderado_por: userRes.user?.id ?? null,
          moderado_em: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_aviso_engajamento"] });
      qc.invalidateQueries({ queryKey: ["dp_mural_comentarios"] });
      toast.success("Comentário moderado");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao moderar"),
  });

  return { ...query, moderar };
}
