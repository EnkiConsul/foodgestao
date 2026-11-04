import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { PartyPopper } from "lucide-react";
import { montarMotivoPedidoDispensa, textoTermoDispensaFeriado } from "@/lib/dp/dispensa-feriado";

interface Props {
  colaboradorId: string;
  unidadeId: string | null;
  iso: string;
  /** false quando o dia já é folga/passado: não há convocação para dispensar. */
  diaDeTrabalho: boolean;
}

const legivel = (iso: string) => iso.split("-").reverse().join("/");

export function PedirDispensaFeriado({ colaboradorId, unidadeId, iso, diaDeTrabalho }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [just, setJust] = useState("");
  const [nome, setNome] = useState("");
  const [ciente, setCiente] = useState(false);

  const feriado = useQuery({
    queryKey: ["dp_feriado_dia_unidade", unidadeId, iso],
    enabled: !!unidadeId && diaDeTrabalho,
    queryFn: async () => {
      const { data } = await supabase.rpc("dp_feriados_resolver_v2", { _unidade_id: unidadeId!, _inicio: iso, _fim: iso });
      return ((data ?? []) as { nome: string }[])[0]?.nome ?? null;
    },
  });

  const pedido = useQuery({
    queryKey: ["dp_solicitacoes", "dispensa_feriado", colaboradorId, iso],
    enabled: !!feriado.data,
    queryFn: async () => {
      const { data } = await supabase
        .from("dp_solicitacoes")
        .select("id, status")
        .eq("colaborador_id", colaboradorId)
        .eq("tipo", "outros")
        .eq("data_alvo", iso)
        .is("removido_em", null)
        .ilike("motivo", "Dispensa em Feriado%")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as { id: string; status: string } | null;
    },
  });

  const enviar = useMutation({
    mutationFn: async () => {
      if (!ciente) throw new Error("Confirme que leu o termo.");
      const motivo = montarMotivoPedidoDispensa({
        nomeFeriado: feriado.data!,
        justificativa: just,
        assinatura: nome,
        aceitoEm: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      });
      const { error } = await supabase.rpc("dp_solicitacao_criar", {
        p_tipo: "outros" as any,
        p_data_alvo: iso,
        p_data_fim: null as any,
        p_motivo: motivo,
        p_arquivo_path: null as any,
      });
      if (error) {
        if ((error.message ?? "").includes("DUPLICATE_REQUEST")) throw new Error("Você já tem um pedido para este dia.");
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Pedido enviado ao gestor", { description: "Você continua convocado até a aprovação." });
      qc.invalidateQueries({ queryKey: ["dp_solicitacoes"] });
      setOpen(false);
    },
    onError: (e) => toast.error("Não foi possível enviar", { description: e instanceof Error ? e.message : String(e) }),
  });

  if (!diaDeTrabalho || !feriado.data) return null;
  const st = pedido.data?.status;

  if (st === "pendente")
    return (
      <p className="rounded-xl border border-border bg-muted/50 px-3 py-2 text-xs">
        Pedido de dispensa do feriado em análise. <strong>Você continua convocado</strong> até o gestor aprovar.
      </p>
    );
  if (st === "aprovada")
    return <p className="rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium">Dispensa do feriado aprovada.</p>;

  return (
    <>
      {st === "recusada" && (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
          Seu pedido de dispensa foi recusado. Você continua convocado para o feriado.
        </p>
      )}
      <Button variant="outline" className="min-h-11" onClick={() => setOpen(true)}>
        <PartyPopper className="mr-2 h-4 w-4" /> Pedir dispensa do feriado
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[88dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pedir dispensa do feriado</DialogTitle>
            <DialogDescription>{feriado.data} · {legivel(iso)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="disp-just">Motivo do pedido</Label>
              <Textarea id="disp-just" value={just} onChange={(e) => setJust(e.target.value)} maxLength={250} rows={3} />
            </div>
            <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs leading-relaxed">
              <p className="mb-1 font-semibold">Termo de solicitação de dispensa</p>
              {textoTermoDispensaFeriado(feriado.data, legivel(iso))}
            </div>
            <label className="flex items-start gap-2 text-sm min-h-11">
              <Checkbox checked={ciente} onCheckedChange={(v) => setCiente(!!v)} className="mt-0.5" />
              Li e entendi: sem aprovação do gestor, continuo convocado.
            </label>
            <div>
              <Label htmlFor="disp-nome">Assinatura (seu nome completo)</Label>
              <Input id="disp-nome" value={nome} onChange={(e) => setNome(e.target.value)} className="h-11" />
            </div>
          </div>
          <DialogFooter className="sticky bottom-0 flex-col-reverse gap-2 bg-background pt-2 sm:flex-row">
            <Button variant="ghost" className="min-h-11" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button className="min-h-11" disabled={enviar.isPending || !ciente} onClick={() => enviar.mutate()}>
              {enviar.isPending ? "Enviando..." : "Assinar e enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
