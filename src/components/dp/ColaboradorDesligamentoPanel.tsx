import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, LogOut, RotateCcw, UserMinus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useDesligarDpColaborador, useEditarDesligamento, useReintegrarDpColaborador, type DpColaborador,
} from "@/hooks/useDpColaboradores";
import { useDpPendenciasConfig } from "@/hooks/useDpPendenciasConfig";
import {
  MOTIVO_DESLIGAMENTO_OPTIONS,
  ELEGIBILIDADE_OPTIONS,
  DIAS_CARENCIA_PORTAL_DEFAULT,
  calcAcessoPortalAte,
  toDateOnly,
} from "@/lib/dp/desligamento";

const NONE = "__none__";
const fmt = (d?: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : "—");

/**
 * Desligamento dentro do cadastro do colaborador: a data da demissão é
 * obrigatória e o registro fica na própria ficha, não em um botão solto na
 * lista.
 */
export function ColaboradorDesligamentoPanel({ colaborador }: { colaborador: DpColaborador | null }) {
  const desligar = useDesligarDpColaborador();
  const editar = useEditarDesligamento();
  const reintegrar = useReintegrarDpColaborador();
  const pending = desligar.isPending || editar.isPending || reintegrar.isPending;
  const { config } = useDpPendenciasConfig();
  const dias = (config as any).dias_carencia_portal ?? DIAS_CARENCIA_PORTAL_DEFAULT;

  const isDesligado = !!colaborador?.data_desligamento || colaborador?.ativo === false;

  const [data, setData] = useState(() => toDateOnly(new Date()));
  const [motivo, setMotivo] = useState<string>(NONE);
  const [elegibilidade, setElegibilidade] = useState<string>(NONE);
  const [observacao, setObservacao] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [confirmarReintegrar, setConfirmarReintegrar] = useState(false);

  useEffect(() => {
    if (!colaborador) return;
    setData(colaborador.data_desligamento ?? toDateOnly(new Date()));
    setMotivo(colaborador.motivo_desligamento ?? NONE);
    setElegibilidade((colaborador as any).elegivel_recontratacao ?? NONE);
    setObservacao((colaborador as any).observacao_desligamento ?? "");
  }, [colaborador?.id, colaborador?.data_desligamento]);

  const impacto = useQuery({
    queryKey: ["dp_desligamento_impacto", colaborador?.id, data],
    enabled: !!colaborador?.id && !!data && !isDesligado,
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

  if (!colaborador?.id) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Salve o cadastro para registrar um desligamento.
      </p>
    );
  }

  const payload = {
    id: colaborador.id,
    data_desligamento: data,
    motivo: motivo === NONE ? null : motivo,
    elegibilidade: elegibilidade === NONE ? null : elegibilidade,
    observacao: observacao.trim() || null,
  };

  const validar = () => {
    if (!data) { toast.error("Informe a data da demissão"); return false; }
    if (observacao.length > 2000) { toast.error("Observação muito longa (máx. 2000 caracteres)"); return false; }
    return true;
  };

  const handleEditar = async () => {
    if (!validar()) return;
    try {
      await editar.mutateAsync(payload);
      toast.success("Dados do desligamento atualizados");
    } catch (e) {
      toast.error("Erro ao atualizar desligamento", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const handleDesligar = async () => {
    setConfirmar(false);
    try {
      const res = await desligar.mutateAsync(payload);
      toast.success(`${colaborador.nome} foi desligado(a)`, {
        description: `Folgas canceladas: ${res.folgas_canceladas ?? 0} • Solicitações: ${res.solicitacoes_canceladas ?? 0} • Acesso ao portal até ${fmt(res.acesso_portal_ate)}`,
      });
    } catch (e) {
      toast.error("Erro ao desligar colaborador", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const handleReintegrar = async () => {
    setConfirmarReintegrar(false);
    try {
      await reintegrar.mutateAsync(colaborador.id);
      toast.success(`${colaborador.nome} foi reintegrado(a)`);
    } catch (e) {
      toast.error("Erro ao reintegrar", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 p-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <LogOut className="h-4 w-4 text-primary" aria-hidden="true" />
          Situação do vínculo
        </div>
        {isDesligado ? (
          <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
            Desligado em {fmt(colaborador.data_desligamento)}
          </Badge>
        ) : (
          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
            Ativo
          </Badge>
        )}
      </div>

      <div className="space-y-4 rounded-xl border border-border p-4">
        <div className="space-y-1.5">
          <Label htmlFor="data-desligamento">Data da demissão *</Label>
          <Input
            id="data-desligamento"
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            Pode ser uma data futura (aviso prévio). O acesso ao portal encerra em {dias} dias após ela
            {acessoAte ? ` — até ${fmt(acessoAte)}` : ""}.
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

        {!isDesligado && (
          <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
            <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" /> O que acontece ao confirmar
            </div>
            <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
              <li>{impacto.data?.folgas ?? 0} folga(s) futura(s) agendada(s) serão canceladas.</li>
              <li>{impacto.data?.solicitacoes ?? 0} solicitação(ões) pendente(s) serão canceladas.</li>
              <li>Trocas pendentes envolvendo o colaborador serão canceladas.</li>
              <li>Portal apenas para consulta e download de documentos até <strong>{fmt(acessoAte)}</strong>.</li>
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {isDesligado ? (
            <>
              <Button onClick={() => void handleEditar()} disabled={pending}>
                {editar.isPending ? "Salvando..." : "Salvar alterações do desligamento"}
              </Button>
              <Button variant="outline" onClick={() => setConfirmarReintegrar(true)} disabled={pending}>
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" /> Reintegrar colaborador
              </Button>
            </>
          ) : (
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (validar()) setConfirmar(true); }}
              disabled={pending}
            >
              <UserMinus className="mr-2 h-4 w-4" aria-hidden="true" />
              {desligar.isPending ? "Desligando..." : "Registrar desligamento"}
            </Button>
          )}
        </div>
      </div>

      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar desligamento?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{colaborador.nome}</strong> será desligado(a) em {fmt(data)}. O histórico permanece
              no sistema para futuras avaliações de recontratação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDesligar()}
            >
              Confirmar desligamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmarReintegrar} onOpenChange={setConfirmarReintegrar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reintegrar colaborador?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{colaborador.nome}</strong> voltará a ficar ativo, com acesso completo ao portal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleReintegrar()}>Reintegrar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
