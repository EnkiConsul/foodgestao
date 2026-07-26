import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserMinus, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useDesligarDpColaborador, type DpColaborador } from "@/hooks/useDpColaboradores";
import { useDpPendenciasConfig } from "@/hooks/useDpPendenciasConfig";
import {
  MOTIVO_DESLIGAMENTO_OPTIONS,
  ELEGIBILIDADE_OPTIONS,
  DIAS_CARENCIA_PORTAL_DEFAULT,
  calcAcessoPortalAte,
  toDateOnly,
} from "@/lib/dp/desligamento";

const NONE = "__none__";

export function DesligamentoDialog({
  colaborador,
  onOpenChange,
}: {
  colaborador: DpColaborador | null;
  onOpenChange: (open: boolean) => void;
}) {
  const desligar = useDesligarDpColaborador();
  const { config } = useDpPendenciasConfig();
  const dias = (config as any).dias_carencia_portal ?? DIAS_CARENCIA_PORTAL_DEFAULT;

  const [data, setData] = useState(() => toDateOnly(new Date()));
  const [motivo, setMotivo] = useState<string>(NONE);
  const [elegibilidade, setElegibilidade] = useState<string>(NONE);
  const [observacao, setObservacao] = useState("");

  useEffect(() => {
    if (colaborador) {
      setData(toDateOnly(new Date()));
      setMotivo(NONE);
      setElegibilidade(NONE);
      setObservacao("");
    }
  }, [colaborador?.id]);

  const impacto = useQuery({
    queryKey: ["dp_desligamento_impacto", colaborador?.id, data],
    enabled: !!colaborador?.id && !!data,
    queryFn: async () => {
      const [folgas, sols] = await Promise.all([
        supabase
          .from("dp_folgas")
          .select("id", { count: "exact", head: true })
          .eq("colaborador_id", colaborador!.id)
          .eq("status", "agendada")
          .gt("data", data),
        supabase
          .from("dp_solicitacoes")
          .select("id", { count: "exact", head: true })
          .eq("colaborador_id", colaborador!.id)
          .eq("status", "pendente"),
      ]);
      return { folgas: folgas.count ?? 0, solicitacoes: sols.count ?? 0 };
    },
  });

  const acessoAte = useMemo(() => (data ? calcAcessoPortalAte(data, dias) : null), [data, dias]);

  const handleSubmit = async () => {
    if (!colaborador) return;
    if (!data) {
      toast.error("Informe a data da demissão");
      return;
    }
    if (observacao.length > 2000) {
      toast.error("Observação muito longa (máx. 2000 caracteres)");
      return;
    }
    try {
      const res = await desligar.mutateAsync({
        id: colaborador.id,
        data_desligamento: data,
        motivo: motivo === NONE ? null : motivo,
        elegibilidade: elegibilidade === NONE ? null : elegibilidade,
        observacao: observacao.trim() || null,
      });
      toast.success(`${colaborador.nome} foi desligado(a)`, {
        description: `Folgas canceladas: ${res.folgas_canceladas ?? 0} • Solicitações: ${res.solicitacoes_canceladas ?? 0} • Acesso ao portal até ${
          res.acesso_portal_ate ? new Date(`${res.acesso_portal_ate}T12:00:00`).toLocaleDateString("pt-BR") : "—"
        }`,
      });
      onOpenChange(false);
    } catch (e) {
      toast.error("Erro ao desligar colaborador", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  return (
    <Dialog open={!!colaborador} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserMinus className="h-5 w-5 text-destructive" /> Desligar colaborador
          </DialogTitle>
          <DialogDescription>
            Registre o desligamento de <strong>{colaborador?.nome}</strong>. O histórico permanece no sistema
            para futuras avaliações de recontratação.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="data-desligamento">Data da demissão *</Label>
            <Input
              id="data-desligamento"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Pode ser uma data futura (aviso prévio). O acesso ao portal encerra em {dias} dias após ela.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Motivo do desligamento</Label>
              <Select value={motivo} onValueChange={setMotivo}>
                <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Não informar</SelectItem>
                  {MOTIVO_DESLIGAMENTO_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Recontrataria?</Label>
              <Select value={elegibilidade} onValueChange={setElegibilidade}>
                <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Não informar</SelectItem>
                  {ELEGIBILIDADE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="obs-desligamento">Observações do desligamento</Label>
            <Textarea
              id="obs-desligamento"
              rows={3}
              maxLength={2000}
              placeholder="Notas internas para futuras avaliações de recontratação..."
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </div>

          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-1">
            <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" /> O que acontece ao confirmar
            </div>
            <ul className="list-disc pl-5 text-muted-foreground space-y-0.5">
              <li>{impacto.data?.folgas ?? 0} folga(s) futura(s) agendada(s) serão canceladas.</li>
              <li>{impacto.data?.solicitacoes ?? 0} solicitação(ões) pendente(s) serão canceladas.</li>
              <li>Trocas pendentes envolvendo o colaborador serão canceladas.</li>
              <li>
                Acesso ao portal apenas para consulta e download de documentos até{" "}
                <strong>
                  {acessoAte ? new Date(`${acessoAte}T12:00:00`).toLocaleDateString("pt-BR") : "—"}
                </strong>
                .
              </li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={desligar.isPending}>
            Cancelar
          </Button>
          <Button
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={handleSubmit}
            disabled={desligar.isPending}
          >
            {desligar.isPending ? "Desligando..." : "Confirmar desligamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
