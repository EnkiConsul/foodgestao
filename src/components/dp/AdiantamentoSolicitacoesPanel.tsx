import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
import { notifyError } from "@/lib/notifyError";
  competenciaEfeito,
  efeitoHint,
  situacaoAtual,
  validarSolicitacaoPortal,
  type AdiantamentoSolicitacao,
  type AdiantamentoTipoSolicitacao,
} from "@/lib/dp/adiantamento-opcao";

function hojeISO() {
  return format(new Date(), "yyyy-MM-dd");
}

function labelData(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/**
 * Histórico de adiantamento salarial por solicitações datadas (ativar/cancelar).
 * Origem "gestor" aceita data retroativa; "portal" só hoje/futuro e com pelo
 * menos 5 dias de antecedência ao pagamento.
 */
export function AdiantamentoSolicitacoesPanel({
  companyId,
  colaboradorId,
  diaPagamento,
  origem,
  fallbackOptante,
}: {
  companyId: string;
  colaboradorId: string;
  diaPagamento: number | null | undefined;
  origem: "gestor" | "portal";
  fallbackOptante?: boolean | null;
}) {
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<AdiantamentoTipoSolicitacao>("ativar");
  const [data, setData] = useState(hojeISO());

  const query = useQuery({
    queryKey: ["dp_adiantamento_solicitacoes", companyId, colaboradorId],
    enabled: !!companyId && !!colaboradorId,
    queryFn: async (): Promise<AdiantamentoSolicitacao[]> => {
      const { data: rows, error } = await supabase
        .from("dp_adiantamento_solicitacoes" as any)
        .select("id, colaborador_id, tipo, data_solicitacao, competencia_efeito, origem, observacao, created_at")
        .eq("company_id", companyId)
        .eq("colaborador_id", colaboradorId)
        .order("data_solicitacao", { ascending: false });
      if (error) throw error;
      return (rows ?? []) as unknown as AdiantamentoSolicitacao[];
    },
  });

  const solicitacoes = query.data ?? [];
  const ativo = useMemo(
    () => situacaoAtual(solicitacoes, hojeISO(), fallbackOptante),
    [solicitacoes, fallbackOptante],
  );

  const registrar = useMutation({
    mutationFn: async () => {
      if (origem === "portal") {
        const erro = validarSolicitacaoPortal(data, diaPagamento, hojeISO());
        if (erro) throw new Error(erro);
      } else if (!data) {
        throw new Error("Informe a data da solicitação.");
      }
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("dp_adiantamento_solicitacoes" as any).insert({
        company_id: companyId,
        colaborador_id: colaboradorId,
        tipo,
        data_solicitacao: data,
        competencia_efeito: competenciaEfeito(data, diaPagamento, origem),
        origem,
        criado_por: auth.user?.id ?? null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_adiantamento_solicitacoes"] });
      qc.invalidateQueries({ queryKey: ["dp_pendencias"] });
      qc.invalidateQueries({ queryKey: ["dp_doc_consistencia_janela"] });
      toast.success(
        `${tipo === "ativar" ? "Adiantamento ativado" : "Adiantamento cancelado"} — ${efeitoHint(data, diaPagamento, origem)}`,
      );
    },
    onError: (e: any) => notifyError(e, { surface: "Adiantamento", action: "concluir a ação", fallback: "Não foi possível registrar a solicitação." }),
  });

  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-sm">Adiantamento salarial</Label>
        <Badge variant={ativo ? "default" : "secondary"}>{ativo ? "Ativo" : "Sem adiantamento"}</Badge>
        <span className="ml-auto text-xs text-muted-foreground">
          {diaPagamento ? `Pagamento no dia ${diaPagamento}` : "Dia de pagamento não configurado"}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Solicitação</Label>
          <Select value={tipo} onValueChange={(v) => setTipo(v as AdiantamentoTipoSolicitacao)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ativar">Ativar adiantamento</SelectItem>
              <SelectItem value="cancelar">Cancelar adiantamento</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Data da solicitação</Label>
          <Input
            type="date"
            className="h-9"
            value={data}
            min={origem === "portal" ? hojeISO() : undefined}
            onChange={(e) => setData(e.target.value)}
          />
        </div>
        <Button
          type="button"
          className="h-9"
          disabled={registrar.isPending || !data}
          onClick={() => registrar.mutate()}
        >
          {registrar.isPending ? "Salvando…" : "Registrar"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {data ? efeitoHint(data, diaPagamento, origem) : "Escolha a data da solicitação."}{" "}
        {origem === "portal"
          ? "No portal, a data precisa ser hoje ou futura e o pedido passa a valer somente na competência de 30 dias à frente."
          : "O gestor pode registrar datas passadas para completar o histórico, sem carência."}
      </p>

      <div className="space-y-1">
        {query.isLoading && <p className="text-xs text-muted-foreground">Carregando histórico…</p>}
        {!query.isLoading && solicitacoes.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhuma solicitação registrada.</p>
        )}
        {solicitacoes.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline" className="text-[11px]">
              {s.tipo === "ativar" ? "Ativou" : "Cancelou"}
            </Badge>
            <span>{labelData(s.data_solicitacao)}</span>
            <span className="text-muted-foreground">vale desde {s.competencia_efeito}</span>
            <span className="text-muted-foreground">
              · {s.origem === "portal" ? "pedido do colaborador" : "registro do gestor"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
