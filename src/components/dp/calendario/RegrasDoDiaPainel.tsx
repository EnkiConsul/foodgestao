import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { definirLimiteDoDia, excluirDataBloqueada, salvarDataBloqueada } from "@/lib/dp/regras-oficial";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface Props {
  companyId: string;
  unidadeId: string | null;
  data: string;
  /** Folgas no dia (para mostrar vagas usadas). */
  folgasNoDia: number;
  nomes: Map<string, string>;
}

const STATUS_TROCA: Record<string, string> = {
  pendente_colega: "Aguardando colega",
  pendente_gestor: "Aguardando gestor",
  aprovada: "Aprovada",
};

/**
 * Bloqueio de data, limite de folgas e trocas do dia, pelas mesmas rotinas
 * do Calendário de Folgas (o servidor valida permissões e regras).
 */
export function RegrasDoDiaPainel({ companyId, unidadeId, data, folgasNoDia, nomes }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [motivo, setMotivo] = useState("");
  const [limite, setLimite] = useState("");

  const q = useQuery({
    queryKey: ["dp_regras_do_dia", companyId, unidadeId, data],
    queryFn: async () => {
      const [bloq, cfg, trocas] = await Promise.all([
        supabase
          .from("dp_datas_bloqueadas")
          .select("id, motivo, liberada, unidade_id, regra_id")
          .eq("company_id", companyId)
          .eq("data", data),
        supabase
          .from("dp_dia_config")
          .select("limite_folgas, unidade_id")
          .eq("company_id", companyId)
          .eq("data", data),
        supabase
          .from("dp_trocas")
          .select("id, solicitante_id, destino_id, data_original, data_proposta, status")
          .eq("company_id", companyId)
          .or(`data_original.eq.${data},data_proposta.eq.${data}`)
          .in("status", ["pendente_colega", "pendente_gestor", "aprovada"]),
      ]);
      if (bloq.error) throw bloq.error;
      if (cfg.error) throw cfg.error;
      const daUnidade = <T extends { unidade_id: string | null }>(l: T[]) =>
        l.find((x) => x.unidade_id === unidadeId) ?? l.find((x) => x.unidade_id === null) ?? null;
      return {
        bloqueio: daUnidade((bloq.data ?? []).filter((b) => !b.liberada)),
        limite: daUnidade(cfg.data ?? [])?.limite_folgas ?? null,
        trocas: trocas.error ? [] : trocas.data ?? [],
      };
    },
  });

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["dp_regras_do_dia"] });
    qc.invalidateQueries({ queryKey: ["dp_datas_bloqueadas_geral"] });
    qc.invalidateQueries({ queryKey: ["dp_dia_config"] });
    qc.invalidateQueries({ queryKey: ["dp_panorama_base"] });
  };
  const falha = (e: unknown) =>
    toast.error("Não foi possível salvar", {
      description: `${e instanceof Error ? e.message : String(e)} Tente de novo em instantes.`,
    });

  const bloquear = useMutation({
    mutationFn: () => salvarDataBloqueada({ companyId, data, motivo: motivo.trim() || "Bloqueado pelo gestor", unidadeId }),
    onSuccess: () => { toast.success("Data bloqueada para folgas."); setMotivo(""); invalidar(); },
    onError: falha,
  });
  const liberar = useMutation({
    mutationFn: (id: string) => excluirDataBloqueada(id),
    onSuccess: () => { toast.success("Data liberada para folgas."); invalidar(); },
    onError: falha,
  });
  const salvarLimite = useMutation({
    mutationFn: () => {
      const n = Number(limite);
      if (!Number.isInteger(n) || n < 0) throw new Error("Informe um número inteiro igual ou maior que zero.");
      return definirLimiteDoDia({ companyId, data, limite: n, unidadeId });
    },
    onSuccess: () => { toast.success("Limite do dia salvo."); setLimite(""); invalidar(); },
    onError: falha,
  });

  if (q.isLoading || !q.data) return null;
  const { bloqueio, limite: lim, trocas } = q.data;
  const trocasDaUnidade = trocas.filter((t) => nomes.has(t.solicitante_id) || nomes.has(t.destino_id));

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Bloqueio de folgas</p>
        {bloqueio ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-destructive/50 text-destructive">Bloqueado · {bloqueio.motivo}</Badge>
            {!bloqueio.regra_id && (
              <Button size="sm" variant="outline" disabled={liberar.isPending} onClick={() => liberar.mutate(bloqueio.id)}>
                Liberar data
              </Button>
            )}
            {bloqueio.regra_id && <span className="text-xs text-muted-foreground">Vem de uma regra; libere em Folgas.</span>}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Input className="h-8 w-56" placeholder="Motivo do bloqueio" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            <Button size="sm" variant="outline" disabled={bloquear.isPending} onClick={() => bloquear.mutate()}>
              Bloquear data
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">
          Limite de folgas: {lim == null ? "padrão da unidade" : `${folgasNoDia}/${lim} usadas`}
          {lim != null && folgasNoDia >= lim && <span className="ml-1 text-destructive">· lotado</span>}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="number" min={0} className="h-8 w-28" placeholder="Novo limite" value={limite} onChange={(e) => setLimite(e.target.value)} />
          <Button size="sm" variant="outline" disabled={!limite || salvarLimite.isPending} onClick={() => salvarLimite.mutate()}>
            Salvar limite
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Trocas que envolvem este dia</p>
        {!trocasDaUnidade.length && <p className="text-xs text-muted-foreground">Nenhuma troca neste dia.</p>}
        <ul className="space-y-1">
          {trocasDaUnidade.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2 text-xs">
              <span>
                {nomes.get(t.solicitante_id) ?? "Colaborador"} ↔ {nomes.get(t.destino_id) ?? "Colaborador"} ·{" "}
                {t.data_original.split("-").reverse().join("/")} → {t.data_proposta.split("-").reverse().join("/")}
              </span>
              <Badge variant="outline" className="text-[10px]">{STATUS_TROCA[t.status] ?? t.status}</Badge>
            </li>
          ))}
        </ul>
        {trocasDaUnidade.some((t) => t.status === "pendente_gestor") && (
          <Button size="sm" variant="outline" onClick={() => navigate("/dp/trocas")}>Aprovar ou recusar trocas</Button>
        )}
      </div>
    </div>
  );
}
