import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpUserPrefs } from "@/hooks/useDpUserPrefs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Megaphone } from "lucide-react";

export function AvisosPopout() {
  const { user } = useAuth();
  const { selectedCompanyId } = useCompanyContext();
  const { prefs, save } = useDpUserPrefs();
  const [idx, setIdx] = useState(0);

  const { data: avisos = [] } = useQuery({
    queryKey: ["dp_avisos_ativos", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const { data } = await supabase
        .from("dp_avisos")
        .select("id, titulo, conteudo, prioridade, publicado_em, expira_em, fixado")
        .eq("company_id", selectedCompanyId!)
        .lte("publicado_em", nowIso)
        .or(`expira_em.is.null,expira_em.gte.${nowIso}`)
        .order("fixado", { ascending: false })
        .order("publicado_em", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  const pending = useMemo(
    () => avisos.filter((a) => !prefs.avisos_confirmados.includes(a.id)),
    [avisos, prefs.avisos_confirmados],
  );

  useEffect(() => { setIdx(0); }, [pending.length]);

  const current = pending[idx];
  if (!current) return null;

  const confirm = async () => {
    // marca leitura na tabela + prefs local
    if (user) {
      await supabase.from("dp_avisos_leituras").upsert({
        aviso_id: current.id,
        user_id: user.id,
      } as any, { onConflict: "aviso_id,user_id" });
    }
    const nextConfirmed = [...prefs.avisos_confirmados, current.id];
    save({ avisos_confirmados: nextConfirmed });
    if (idx + 1 >= pending.length) return; // fecha ao esgotar
    setIdx(idx + 1);
  };

  return (
    <Dialog open onOpenChange={() => { /* modal: só fecha ao confirmar */ }}>
      <DialogContent className="max-w-xl" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            {current.titulo}
            <Badge variant="outline" className="ml-2 text-[10px] capitalize">{current.prioridade}</Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="text-sm whitespace-pre-wrap max-h-[50vh] overflow-y-auto">
          {current.conteudo}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Aviso {idx + 1} de {pending.length}
        </p>
        <DialogFooter>
          <Button onClick={confirm}>
            {idx + 1 < pending.length ? "Li e continuar" : "Li e fechar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
