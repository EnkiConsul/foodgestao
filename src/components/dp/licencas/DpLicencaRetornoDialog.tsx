import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { labelAfastamento } from "@/lib/dp/licencas";
import { porIds, resolverPendencias } from "@/lib/dp/pendencias-resolver";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { notifyError } from "@/lib/notifyError";

export type LicencaRetornoAlvo = {
  solicitacaoId: string;
  tipo: string;
  dataInicio: string;
  dataFimPrevista: string;
  colaboradorNome?: string | null;
};

type Escolha = "confirmar" | "outra_data" | "prorrogar";

/**
 * Resolve a pendência de retorno de uma licença: confirmar o retorno na data
 * prevista, informar outra data de retorno ou prorrogar a licença.
 */
export function DpLicencaRetornoDialog({
  alvo,
  open,
  onOpenChange,
  onResolved,
}: {
  alvo: LicencaRetornoAlvo | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onResolved?: () => void;
}) {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const [escolha, setEscolha] = useState<Escolha>("confirmar");
  const [data, setData] = useState("");
  const [observacao, setObservacao] = useState("");

  useEffect(() => {
    if (open && alvo) {
      setEscolha("confirmar");
      setData(alvo.dataFimPrevista);
      setObservacao("");
    }
  }, [open, alvo]);

  const salvar = useMutation({
    mutationFn: async () => {
      if (!alvo) return;
      const hoje = format(new Date(), "yyyy-MM-dd");
      if (escolha === "prorrogar") {
        if (!data || data <= alvo.dataFimPrevista) {
          throw new Error("Informe uma nova data final posterior à prevista.");
        }
        const { error } = await supabase
          .from("dp_solicitacoes")
          .update({
            data_fim: data,
            resposta_admin: observacao.trim() || "Licença prorrogada.",
          })
          .eq("id", alvo.solicitacaoId);
        if (error) throw error;
        return;
      }

      const retorno = escolha === "confirmar" ? alvo.dataFimPrevista : data;
      if (!retorno) throw new Error("Informe a data do retorno.");
      if (retorno < alvo.dataInicio) {
        throw new Error("A data do retorno não pode ser anterior ao início da licença.");
      }
      const { data: sessao } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("dp_solicitacoes")
        .update({
          retorno_em: retorno,
          retorno_confirmado_em: new Date().toISOString(),
          retorno_confirmado_por: sessao?.user?.id ?? null,
          // Retorno antecipado encerra a licença na data efetiva.
          data_fim: retorno < alvo.dataFimPrevista ? retorno : alvo.dataFimPrevista,
          resposta_admin: observacao.trim() || `Retorno confirmado em ${retorno}.`,
        })
        .eq("id", alvo.solicitacaoId);
      if (error) throw error;
      void hoje;
    },
    onSuccess: () => {
      toast.success(escolha === "prorrogar" ? "Licença prorrogada" : "Retorno confirmado");
      void resolverPendencias(queryClient, {
        companyId: selectedCompanyId,
        // Prorrogar mantém a licença: só o retorno confirmado dá baixa do item.
        match: escolha === "prorrogar" || !alvo ? undefined : porIds([`licenca-${alvo.solicitacaoId}`]),
      });
      void queryClient.invalidateQueries({ queryKey: ["dp_solicitacoes"] });
      void queryClient.invalidateQueries({ queryKey: ["dp_atestados"] });
      onOpenChange(false);
      onResolved?.();
    },
    onError: (e: any) => notifyError(e, { surface: "Licenças", action: "concluir a ação", fallback: "Não foi possível salvar" }),
  });

  const rotulo = labelAfastamento(alvo?.tipo);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Retorno de {rotulo.toLowerCase()}</DialogTitle>
          <DialogDescription>
            {alvo?.colaboradorNome ? `${alvo.colaboradorNome} — ` : ""}
            retorno previsto em{" "}
            {alvo ? format(new Date(`${alvo.dataFimPrevista}T12:00:00`), "dd/MM/yyyy") : ""}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-2">
            {(
              [
                ["confirmar", "Voltou na data prevista"],
                ["outra_data", "Voltou em outra data"],
                ["prorrogar", "Licença foi prorrogada"],
              ] as Array<[Escolha, string]>
            ).map(([valor, texto]) => (
              <Button
                key={valor}
                type="button"
                variant={escolha === valor ? "default" : "outline"}
                className="justify-start h-10 text-sm"
                onClick={() => setEscolha(valor)}
              >
                {texto}
              </Button>
            ))}
          </div>

          {escolha !== "confirmar" && (
            <div className="grid gap-1.5">
              <Label htmlFor="licenca-retorno-data">
                {escolha === "prorrogar" ? "Nova data final da licença" : "Data do retorno"}
              </Label>
              <Input
                id="licenca-retorno-data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="licenca-retorno-obs">Observação (opcional)</Label>
            <Textarea
              id="licenca-retorno-obs"
              rows={3}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex.: apresentou atestado de aptidão no retorno."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={salvar.isPending} onClick={() => salvar.mutate()}>
            {salvar.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
