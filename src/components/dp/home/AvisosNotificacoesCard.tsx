import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { notificacaoOrigemLabel, notificacaoPathPortal } from "@/lib/dp/notificacoes";

type Item = {
  key: string;
  id: string;
  fonte: "mural" | "pessoal";
  titulo: string;
  texto: string | null;
  data: string;
  lido: boolean;
  to: string;
  origemLabel: string;
};

/**
 * Quadro único de Avisos e Notificações do portal.
 * Junta o mural da empresa (dp_avisos) com as notificações pessoais
 * (dp_notificacoes), ordenados por data, cada item marcado com a origem.
 */
export function AvisosNotificacoesCard() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["dp_portal_avisos_notificacoes", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<Item[]> => {
      const [avisosRes, notifRes] = await Promise.all([
        supabase
          .from("dp_avisos")
          .select("id, titulo, conteudo, prioridade, publicado_em, fixado")
          .order("fixado", { ascending: false })
          .order("publicado_em", { ascending: false })
          .limit(6),
        supabase
          .from("dp_notificacoes")
          .select("id, titulo, descricao, ref_table, created_at, lida_em")
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(6),
      ]);

      const avisos = avisosRes.data ?? [];
      const ids = avisos.map((a) => a.id);
      let lidos = new Set<string>();
      if (ids.length) {
        const { data: leituras } = await supabase
          .from("dp_avisos_leituras")
          .select("aviso_id")
          .in("aviso_id", ids)
          .eq("user_id", user!.id);
        lidos = new Set((leituras ?? []).map((l) => l.aviso_id));
      }

      const doMural: Item[] = avisos.map((a) => ({
        key: `aviso-${a.id}`,
        id: a.id,
        fonte: "mural",
        titulo: a.titulo,
        texto: a.conteudo,
        data: a.publicado_em ?? new Date().toISOString(),
        lido: lidos.has(a.id),
        to: "/dp/meu/avisos",
        origemLabel: "Mural da empresa",
      }));

      const pessoais: Item[] = (notifRes.data ?? []).map((n) => ({
        key: `notif-${n.id}`,
        id: n.id,
        fonte: "pessoal",
        titulo: n.titulo,
        texto: n.descricao,
        data: n.created_at,
        lido: !!n.lida_em,
        to: notificacaoPathPortal(n.ref_table),
        origemLabel: notificacaoOrigemLabel(n.ref_table),
      }));

      return [...doMural, ...pessoais].sort((a, b) => (a.data < b.data ? 1 : -1)).slice(0, 8);
    },
  });

  const abrir = async (item: Item) => {
    if (item.lido) return;
    if (item.fonte === "pessoal") {
      const { error } = await supabase.rpc("dp_notificacao_marcar_lida", { _ids: [item.id] });
      if (error) {
        toast.error("Não foi possível atualizar a notificação. Tente novamente.");
        return;
      }
    } else {
      await supabase
        .from("dp_avisos_leituras")
        .insert({ aviso_id: item.id, user_id: user!.id });
    }
    qc.invalidateQueries({ queryKey: ["dp_portal_avisos_notificacoes"] });
  };

  const list = q.data ?? [];
  const naoLidos = list.filter((i) => !i.lido).length;

  return (
    <section className="rounded-2xl border border-[hsl(var(--dp-border))] bg-card p-5 flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <Megaphone className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Avisos e Notificações</h2>
        {naoLidos > 0 && (
          <Badge className="ml-auto bg-primary text-primary-foreground rounded-full h-6 min-w-6 px-2">
            {naoLidos}
          </Badge>
        )}
      </div>
      <div className="space-y-2 max-h-[380px] overflow-y-auto flex-1">
        {list.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <Bell className="h-8 w-8 opacity-40" />
            <p className="text-sm">Nenhum aviso ou notificação no momento.</p>
          </div>
        ) : (
          list.map((item) => (
            <Link
              key={item.key}
              to={item.to}
              onClick={() => abrir(item)}
              className={`block rounded-xl border p-3 hover:bg-muted/50 ${
                item.lido
                  ? "border-[hsl(var(--dp-border))] opacity-70"
                  : "border-primary/40 ring-1 ring-primary/20"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-sm font-medium truncate">{item.titulo}</p>
                {!item.lido && (
                  <Badge className="bg-primary text-primary-foreground text-[10px] shrink-0">Novo</Badge>
                )}
              </div>
              {item.texto && <p className="text-xs text-muted-foreground line-clamp-2">{item.texto}</p>}
              <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                <Badge variant="outline" className="text-[10px]">{item.origemLabel}</Badge>
                <span>{new Date(item.data).toLocaleDateString("pt-BR")}</span>
              </div>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
