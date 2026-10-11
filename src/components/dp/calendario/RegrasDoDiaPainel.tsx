import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { definirLimiteDoDia, excluirDataBloqueada, salvarDataBloqueada } from "@/lib/dp/regras-oficial";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Lock, LockOpen } from "lucide-react";
import { useDpFolgaLimites } from "@/hooks/useDpFolgaLimites";
import { cotasPorCargoNoDia, origemLimiteLabel, resolverLimiteFolga, limiteComFolgaFixaDiaUtil } from "@/lib/dp/folga-limites";
import { useBloqueiosEfetivos } from "@/hooks/useBloqueiosEfetivos";
import { useFixosPorDiaSemana } from "@/hooks/useFixosPorDiaSemana";
import { VagasCargoSetorDia } from "@/components/dp/bloqueios/RestricoesDoDia";
import { cn } from "@/lib/utils";
import { LiberarEscopoDialog } from "@/components/dp/bloqueios/LiberarEscopoDialog";

interface Props {
  companyId: string;
  unidadeId: string | null;
  data: string;
  /** Folgas no dia (para mostrar vagas usadas). */
  folgasNoDia: number;
  nomes: Map<string, string>;
  /** Bloqueio já exibido no cabeçalho do dia. */
  ocultarBloqueio?: boolean;
  /** Quem está de folga no dia (para as cotas por cargo/setor). */
  ocupantes?: { nome: string; cargoId?: string | null; setorId?: string | null }[];
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
export function RegrasDoDiaPainel({ companyId, unidadeId, data, folgasNoDia, nomes, ocultarBloqueio, ocupantes }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [motivo, setMotivo] = useState("");
  const [limite, setLimite] = useState("");
  const [ajustar, setAjustar] = useState(false);
  const cargosQ = useQuery({
    queryKey: ["dp_cargos_nomes", companyId],
    queryFn: async () => {
      const { data: l } = await supabase.from("dp_cargos").select("id, nome").eq("company_id", companyId);
      return (l ?? []).map((c) => [c.id, c.nome] as [string, string]);
    },
  });
  const { regras: regrasLimite } = useDpFolgaLimites(unidadeId);
  const efetivos = useBloqueiosEfetivos(companyId, unidadeId, data, data);
  const fixosPorDow = useFixosPorDiaSemana(companyId, unidadeId);

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
          .select("data, limite_folgas, unidade_id")
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
        diaConfig: cfg.data ?? [],
        trocas: trocas.error ? [] : trocas.data ?? [],
      };
    },
  });

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["dp_regras_do_dia"] });
    qc.invalidateQueries({ queryKey: ["dp_bloqueios_efetivos"] });
    qc.invalidateQueries({ queryKey: ["dp_bloqueio_cabecalho"] });
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
  const { diaConfig, trocas } = q.data;
  const bloqueio = efetivos.data?.get(data) ?? null;
  const resolvido = limiteComFolgaFixaDiaUtil(data, resolverLimiteFolga({ data, unidadeId, regras: regrasLimite ?? [], diaConfig }), fixosPorDow.data);
  const lim = resolvido.limite;
  const cotas = cotasPorCargoNoDia({ data, unidadeId, regras: regrasLimite ?? [], diaConfig, ocupantes: ocupantes ?? [], cargoNomeById: new Map(cargosQ.data ?? []) });
  const trocasDaUnidade = trocas.filter((t) => nomes.has(t.solicitante_id) || nomes.has(t.destino_id));
  // Teto do dia bloqueado = folgas fixas cadastradas nesse dia da semana
  // (elas continuam valendo); vagas extras ficam zeradas.
  const fixosBloqueio = fixosPorDow.data?.get(new Date(`${data}T12:00:00`).getDay()) ?? 0;

  return (
    <div className="space-y-3">
      {!ocultarBloqueio && <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Bloqueio de folgas</p>
        {bloqueio ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-destructive/50 text-destructive">Bloqueado · {bloqueio.motivo}</Badge>
            {!bloqueio.regra_id && (
              <Button size="sm" variant="outline" disabled={liberar.isPending} onClick={() => bloqueio.id && liberar.mutate(bloqueio.id)}>
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
      </div>}

      <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">Vagas de Folga no Dia</p>
        {bloqueio ? (() => {
          // Teto do dia bloqueado = folgas fixas cadastradas nesse dia da semana
          // (elas continuam valendo); vagas extras ficam zeradas.
          const fixos = fixosPorDow.data?.get(new Date(`${data}T12:00:00`).getDay()) ?? 0;
          return (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-2xl font-extrabold tabular-nums text-destructive">{folgasNoDia}/{fixos}</span>
              <span className="text-sm font-semibold">Dia bloqueado · sem vagas extras</span>
              <span className="text-xs text-muted-foreground">
                {fixos > 0 ? "Folgas fixas cadastradas continuam valendo." : "Nenhuma folga fixa neste dia da semana."}
              </span>
            </div>
          );
        })()}
        ) : lim == null ? (
          <p className="text-sm text-muted-foreground">Nenhum limite cadastrado para este dia. Cadastre uma regra em Folgas &gt; Regras ou ajuste abaixo.</p>
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className={cn("text-2xl font-extrabold tabular-nums", folgasNoDia >= lim ? "text-destructive" : "text-primary")}>
              {folgasNoDia}/{lim}
            </span>
            <span className="text-sm font-semibold">
              {folgasNoDia >= lim ? "Lotado" : `${lim - folgasNoDia} ${lim - folgasNoDia === 1 ? "vaga livre" : "vagas livres"}`}
            </span>
            <span className="text-xs text-muted-foreground">
              {resolvido.origem === "regra_recorrente" ? "Regras da unidade" : origemLimiteLabel(resolvido.origem)}
            </span>
          </div>
        )}
        {!bloqueio && cotas.length > 0 && (
          <ul className="space-y-1">
            {cotas.map((c) => {
              const livres = Math.max(0, c.maximo - c.ocupados);
              return (
                <li key={c.regraId} className="flex flex-wrap items-center justify-between gap-1 rounded-lg border bg-card px-2.5 py-1.5 text-xs">
                  <span className="font-semibold">{c.rotulo}</span>
                  <span className={livres > 0 ? "text-primary" : "text-destructive"}>
                    {livres > 0 ? `${livres} vaga(s) livre(s)` : "Lotado"} ({c.ocupados}/{c.maximo})
                    {c.nomes.length > 0 ? ` · ${c.nomes.map((n) => n.split(" ")[0]).join(", ")}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <Button variant="outline" size="sm" className="w-full" onClick={() => setAjustar((v) => !v)}>
          {ajustar ? "Fechar Ajuste de Vagas" : "Ajustar Vagas Deste Dia"}
        </Button>
        {ajustar && (
          <div className="space-y-3">
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground">Exceção só para esta data</p>
                <Input type="number" min={0} className="h-9" placeholder="Quantidade" value={limite} onChange={(e) => setLimite(e.target.value)} />
              </div>
              <Button size="sm" className="h-9" disabled={!limite || salvarLimite.isPending} onClick={() => salvarLimite.mutate()}>Salvar</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">0 = ninguém pode folgar neste dia.</p>
            {unidadeId && <VagasCargoSetorDia companyId={companyId} data={data} unidadeId={unidadeId} />}
          </div>
        )}
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

/** Bloqueio da data em destaque no cabeçalho do dia, com o botão de liberar. */
export function BloqueioDoDiaCabecalho({
  companyId, unidadeId, data, podeEditar,
}: { companyId: string; unidadeId: string | null; data: string; podeEditar: boolean }) {
  const qc = useQueryClient();
  const efetivos = useBloqueiosEfetivos(companyId, unidadeId, data, data);
  const q = { isLoading: efetivos.isLoading, data: efetivos.data?.get(data) ?? null };
  const liberar = useMutation({
    mutationFn: (id: string) => excluirDataBloqueada(id),
    onSuccess: () => {
      toast.success("Data liberada para folgas.");
      for (const k of ["dp_bloqueios_efetivos", "dp_bloqueio_cabecalho", "dp_regras_do_dia", "dp_datas_bloqueadas_geral", "dp_panorama_base"])
        qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e: unknown) =>
      toast.error("Não foi possível liberar a data", {
        description: `${e instanceof Error ? e.message : String(e)} Tente de novo em instantes.`,
      }),
  });
  // Liberação de bloqueio geral: só nesta unidade ou em todas (igual ao Calendário de Folgas).
  const [escopoOpen, setEscopoOpen] = useState(false);
  const unidadeNomeQ = useQuery({
    queryKey: ["dp_unidade_nome", unidadeId],
    enabled: !!unidadeId,
    queryFn: async () => {
      const { data: u } = await supabase.from("dp_unidades").select("nome").eq("id", unidadeId!).maybeSingle();
      return u?.nome ?? null;
    },
  });
  const liberarEscopo = useMutation({
    mutationFn: (uid: string | null) =>
      salvarDataBloqueada({ companyId, data, unidadeId: uid, liberada: true, motivo: "Liberado manualmente pelo administrador" }),
    onSuccess: () => {
      toast.success("Data liberada para folgas.");
      setEscopoOpen(false);
      for (const k of ["dp_bloqueios_efetivos", "dp_bloqueio_cabecalho", "dp_regras_do_dia", "dp_datas_bloqueadas_geral", "dp_datas_bloqueadas", "dp_panorama_base"])
        qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e: unknown) =>
      toast.error("Não foi possível liberar a data", {
        description: `${e instanceof Error ? e.message : String(e)} Tente de novo em instantes.`,
      }),
  });
  const [motivo, setMotivo] = useState("");
  const [abrindo, setAbrindo] = useState(false);
  const bloquear = useMutation({
    mutationFn: () => salvarDataBloqueada({ companyId, data, motivo: motivo.trim() || "Bloqueado pelo gestor", unidadeId }),
    onSuccess: () => {
      toast.success("Data bloqueada para folgas.");
      setMotivo(""); setAbrindo(false);
      for (const k of ["dp_bloqueios_efetivos", "dp_bloqueio_cabecalho", "dp_regras_do_dia", "dp_datas_bloqueadas_geral", "dp_panorama_base"])
        qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e: unknown) =>
      toast.error("Não foi possível bloquear a data", {
        description: `${e instanceof Error ? e.message : String(e)} Tente de novo em instantes.`,
      }),
  });
  const b = q.data;
  if (q.isLoading) return null;
  if (!b) {
    if (!podeEditar) return null;
    return (
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary"><LockOpen className="h-3.5 w-3.5" /> Liberado para folgas</span>
        {abrindo ? (
          <>
            <Input className="h-8 w-48" placeholder="Motivo do bloqueio" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
            <Button size="sm" variant="destructive" className="h-8" disabled={bloquear.isPending} onClick={() => bloquear.mutate()}>Bloquear</Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setAbrindo(false)}>Voltar</Button>
          </>
        ) : (
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setAbrindo(true)}>
            <Lock className="mr-1 h-3.5 w-3.5" /> Bloquear dia
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2">
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-destructive">
        <Lock className="h-4 w-4" /> Bloqueado{b.motivo ? ` · ${b.motivo}` : ""}
      </span>
      {podeEditar && (
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={liberar.isPending || liberarEscopo.isPending}
          onClick={() => {
            if (b.global || b.regra_id) setEscopoOpen(true);
            else if (b.id) liberar.mutate(b.id);
          }}
        >
          <LockOpen className="mr-1 h-3.5 w-3.5" /> Liberar Data
        </Button>
      )}
      <LiberarEscopoDialog
        open={escopoOpen}
        onOpenChange={setEscopoOpen}
        dataLabel={data.split("-").reverse().join("/")}
        unidadeNome={unidadeId ? unidadeNomeQ.data ?? "esta unidade" : null}
        motivo={b.motivo}
        loading={liberarEscopo.isPending}
        onLiberarUnidade={() => unidadeId && liberarEscopo.mutate(unidadeId)}
        onLiberarGlobal={() => liberarEscopo.mutate(null)}
      />
    </div>
  );
}
