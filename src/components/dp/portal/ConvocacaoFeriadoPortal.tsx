import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

export interface ConvocacaoFeriado { id: string; data: string; titulo: string; descricao: string | null; lida: boolean }

/** Extrai a data da chave `feriado_conv:<colaborador>:<AAAA-MM-DD>`. */
export function dataDaChaveConvocacao(chave: string | null | undefined): string | null {
  const m = /^feriado_conv:[^:]+:(\d{4}-\d{2}-\d{2})$/.exec(chave ?? "");
  return m ? m[1] : null;
}

/** Convocações de feriado do próprio colaborador (lidas pelas notificações dele). */
export function useMinhasConvocacoesFeriado(colaboradorId: string | null | undefined) {
  return useQuery({
    queryKey: ["dp_minhas_convocacoes_feriado", colaboradorId],
    enabled: !!colaboradorId,
    queryFn: async (): Promise<ConvocacaoFeriado[]> => {
      const { data, error } = await supabase.from("dp_notificacoes")
        .select("id, chave, titulo, descricao, lida_em")
        .eq("tipo", "feriado_convocacao").eq("colaborador_id", colaboradorId!)
        .order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []).flatMap((n) => {
        const d = dataDaChaveConvocacao(n.chave);
        return d ? [{ id: n.id, data: d, titulo: n.titulo, descricao: n.descricao, lida: !!n.lida_em }] : [];
      });
    },
  });
}

export function SeloConvocado() {
  return <Badge className="gap-1 bg-warning/15 text-warning hover:bg-warning/15"><BellRing className="h-3 w-3" />Convocado</Badge>;
}

/** Aviso de convocação não lida: gaveta inferior no celular, janela no computador. */
export function AvisoConvocacaoFeriado({ colaboradorId, onSolicitarDispensa }: { colaboradorId: string | null | undefined; onSolicitarDispensa: (iso: string) => void }) {
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const q = useMinhasConvocacoesFeriado(colaboradorId);
  const hoje = new Date().toISOString().slice(0, 10);
  const pendente = (q.data ?? []).filter((c) => !c.lida && c.data >= hoje).sort((a, b) => a.data.localeCompare(b.data))[0];
  const ler = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("dp_notificacoes").update({ lida_em: new Date().toISOString() }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dp_minhas_convocacoes_feriado"] }),
  });
  if (!pendente) return null;
  const fechar = () => ler.mutate(pendente.id);
  const dispensa = () => { ler.mutate(pendente.id); onSolicitarDispensa(pendente.data); };
  const corpo = <p className="text-sm text-muted-foreground">{pendente.descricao}</p>;
  const acoes = (
    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
      <Button variant="outline" className="min-h-11" onClick={dispensa}>Solicitar Dispensa</Button>
      <Button className="min-h-11" onClick={fechar}>Entendido</Button>
    </div>
  );
  if (isMobile) {
    return (
      <Sheet open onOpenChange={(o) => !o && fechar()}>
        <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle className="flex items-center gap-2"><BellRing className="h-5 w-5 text-warning" />{pendente.titulo}</SheetTitle>
            <SheetDescription className="sr-only">Aviso de convocação para feriado</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 pt-3">{corpo}{acoes}</div>
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><BellRing className="h-5 w-5 text-warning" />{pendente.titulo}</DialogTitle>
          <DialogDescription className="sr-only">Aviso de convocação para feriado</DialogDescription>
        </DialogHeader>
        {corpo}
        <DialogFooter>{acoes}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
