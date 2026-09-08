import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { notificacaoOrigemLabel, notificacaoPathPortal } from "@/lib/dp/notificacoes";

/**
 * Notificações pessoais do colaborador (audiência individual).
 * Só lista o que é dirigido ao próprio usuário — nunca comunicações de gestão.
 */
export function MinhasNotificacoesCard() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["dp_minhas_notificacoes", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_notificacoes")
        .select("id, titulo, descricao, ref_table, created_at, lida_em")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data ?? [];
    },
  });

  const abrir = async (id: string, lida: boolean) => {
    if (lida) return;
    const { error } = await supabase.rpc("dp_notificacao_marcar_lida", { _ids: [id] });
    if (error) {
      toast.error("Não foi possível atualizar a notificação. Tente novamente.");
      return;
    }
    qc.invalidateQueries({ queryKey: ["dp_minhas_notificacoes"] });
  };

  const list = q.data ?? [];

  return (
    <section className="rounded-2xl border border-[hsl(var(--dp-border))] bg-card p-5 flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <Bell className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Meus Avisos e Notificações</h2>
        {list.some((n) => !n.lida_em) && (
          <Badge className="ml-auto bg-primary text-primary-foreground rounded-full h-6 min-w-6 px-2">
            {list.filter((n) => !n.lida_em).length}
          </Badge>
        )}
      </div>
      <div className="space-y-2 max-h-[380px] overflow-y-auto flex-1">
        {list.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <Bell className="h-8 w-8 opacity-40" />
            <p className="text-sm">Nenhuma notificação no momento.</p>
          </div>
        ) : (
          list.map((n) => (
            <Link
              key={n.id}
              to={notificacaoPathPortal(n.ref_table)}
              onClick={() => abrir(n.id, !!n.lida_em)}
              className={`block rounded-xl border p-3 hover:bg-muted/50 ${
                n.lida_em ? "border-[hsl(var(--dp-border))] opacity-70" : "border-primary/40 ring-1 ring-primary/20"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-sm font-medium truncate">{n.titulo}</p>
                {!n.lida_em && <Badge className="bg-primary text-primary-foreground text-[10px] shrink-0">Novo</Badge>}
              </div>
              {n.descricao && <p className="text-xs text-muted-foreground line-clamp-2">{n.descricao}</p>}
              <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                <Badge variant="outline" className="text-[10px]">{notificacaoOrigemLabel(n.ref_table)}</Badge>
                <span>{new Date(n.created_at).toLocaleDateString("pt-BR")}</span>
              </div>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
