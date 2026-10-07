import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSignature, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useDpColaboradorConfigTrabalho } from "@/hooks/useDpColaboradorConfigTrabalho";
import { detalharCargaSemanal, DOW_LABEL, type ConfigTrabalho, type TurnoResolvido } from "@/lib/dp/config-trabalho";
import { formatarHoras } from "@/lib/dp/jornada-utils";
import { TermoCompensacaoPreviaDialog } from "@/components/dp/TermoCompensacaoPreviaDialog";
import { cpfFmt } from "@/lib/dp/termos-freelancer";
import { toUpperCadastro } from "@/lib/text/upperCadastro";
import type { LinhaJornada } from "@/lib/dp/termo-compensacao-pdf";
import {
  diasAcimaDe8h, termoCompensacaoExistente, TERMOS_COMPENSACAO, vinculoAdmiteCompensacao, type TermoCompensacaoTipo,
} from "@/lib/dp/termos-compensacao";

interface Props {
  companyId: string;
  colaboradorId: string;
  nome: string;
  cpf?: string | null;
  regime?: string | null;
  cargoId?: string | null;
  vinculoLabel?: string | null;
  unidade?: { nome?: string | null; banco_horas?: boolean | null; compensa_feriados?: boolean | null; compensacao_feriado_antecedencia_dias?: number | null } | null;
}

/** Sugere e emite os acordos de compensação conforme a jornada e as regras da unidade. */
export function CompensacaoJornadaBox({ companyId, colaboradorId, nome, cpf, regime, cargoId, vinculoLabel, unidade }: Props) {
  const qc = useQueryClient();
  const cfg = useDpColaboradorConfigTrabalho(colaboradorId);

  const turnos = useQuery({
    queryKey: ["dp_turnos_resolvidos", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("dp_turnos").select("id, nome, entrada, saida, intervalo_minutos").eq("company_id", companyId);
      return (data ?? []) as unknown as TurnoResolvido[];
    },
  });

  const extras = useQuery({
    queryKey: ["dp_termo_comp_extras", companyId, cargoId ?? null],
    queryFn: async () => {
      const { data: emp } = await supabase.from("companies").select("name, trade_name, cnpj").eq("id", companyId).maybeSingle();
      let cargo: string | null = null;
      if (cargoId) {
        const { data: c } = await supabase.from("dp_cargos").select("nome").eq("id", cargoId).maybeSingle();
        cargo = (c as { nome?: string } | null)?.nome ?? null;
      }
      return { empresa: (emp?.name || emp?.trade_name || "Empresa").toUpperCase(), cnpj: emp?.cnpj ?? null, cargo };
    },
  });

  const detalhes = useMemo(() => {
    const v = cfg.vigente;
    if (!v) return [];
    const config: ConfigTrabalho = {
      turno_padrao_id: v.turno_padrao_id, folga_variavel: v.folga_variavel, folga_fixa_dow: v.folga_fixa_dow,
      dias: v.dias as unknown as ConfigTrabalho["dias"],
    };
    return detalharCargaSemanal(config, turnos.data ?? []);
  }, [cfg.vigente, turnos.data]);
  const acima = useMemo(() => diasAcimaDe8h(detalhes), [detalhes]);

  const jornada = useMemo<LinhaJornada[]>(() => {
    const ordem = [1, 2, 3, 4, 5, 6, 0];
    const fixa = cfg.vigente?.folga_fixa_dow ?? null;
    return ordem.map((dow) => {
      const d = detalhes.find((x) => x.dow === dow);
      const hm = (v?: string | null) => (v ? String(v).slice(0, 5) : null);
      if (!d || !d.trabalha) return { dia: DOW_LABEL[dow], trabalha: false, minutos: 0, descanso: fixa === dow || (fixa == null && dow === 0) ? "DSR" : "Folga" };
      return { dia: DOW_LABEL[dow], trabalha: true, entrada: hm(d.turno?.entrada), saida: hm(d.turno?.saida), intervalo: d.turno?.intervalo_minutos ?? null, minutos: d.minutos };
    });
  }, [detalhes, cfg.vigente]);
  const [previa, setPrevia] = useState<TermoCompensacaoTipo[] | null>(null);

  const excecao = useQuery({
    queryKey: ["dp_colaborador_compensacao", colaboradorId],
    queryFn: async () => {
      const { data } = await supabase.from("dp_colaborador_compensacao")
        .select("usa_banco_horas, usa_compensa_feriados").eq("colaborador_id", colaboradorId).maybeSingle();
      return data;
    },
  });
  const usaBanco = !!unidade?.banco_horas && excecao.data?.usa_banco_horas !== false;
  const usaFeriados = !!unidade?.compensa_feriados && excecao.data?.usa_compensa_feriados !== false;
  const [salvando, setSalvando] = useState(false);
  const definir = async (campo: "usa_banco_horas" | "usa_compensa_feriados", valor: boolean) => {
    setSalvando(true);
    const { error } = await supabase.from("dp_colaborador_compensacao").upsert({
      colaborador_id: colaboradorId, company_id: companyId,
      usa_banco_horas: excecao.data?.usa_banco_horas ?? null,
      usa_compensa_feriados: excecao.data?.usa_compensa_feriados ?? null,
      [campo]: valor ? null : false, updated_at: new Date().toISOString(),
    } as never);
    setSalvando(false);
    if (error) { toast.error("Não foi possível salvar", { description: "Confira se você tem permissão para alterar colaboradores e tente de novo." }); return; }
    toast.success(valor ? "Colaborador volta a seguir a regra da unidade." : "Colaborador fora desta regra da unidade.");
    qc.invalidateQueries({ queryKey: ["dp_colaborador_compensacao", colaboradorId] });
  };

  const admite = vinculoAdmiteCompensacao(regime, vinculoLabel);
  const tipos: TermoCompensacaoTipo[] = !admite ? [] : [
    ...(acima.length ? (["semanal"] as const) : []),
    ...(usaBanco ? (["banco_horas"] as const) : []),
    ...(usaFeriados ? (["feriados"] as const) : []),
  ];

  const status = useQuery({
    queryKey: ["dp_termos_compensacao", colaboradorId, tipos.join(",")],
    enabled: tipos.length > 0,
    queryFn: async () => {
      const r: Partial<Record<TermoCompensacaoTipo, { assinado: boolean } | null>> = {};
      for (const t of tipos) r[t] = await termoCompensacaoExistente(colaboradorId, t);
      return r;
    },
  });

  const temRegraUnidade = admite && (!!unidade?.banco_horas || !!unidade?.compensa_feriados);
  if (!tipos.length && !temRegraUnidade) return null;
  const pendentes = tipos.filter((t) => !status.data?.[t]);

  const motivo: Record<TermoCompensacaoTipo, string> = {
    semanal: `Jornada acima de 8h em ${acima.map((d) => `${DOW_LABEL[d.dow]} (${formatarHoras(d.minutos / 60)})`).join(", ")}. A CLT (art. 59, § 6º) pede acordo de compensação semanal.`,
    banco_horas: `A unidade${unidade?.nome ? ` ${unidade.nome}` : ""} adota banco de horas.`,
    feriados: `A unidade adota compensação de feriados (pedido com ${unidade?.compensacao_feriado_antecedencia_dias ?? 2} dia(s) de antecedência).`,
  };

  return (
    <div className="mb-4 space-y-3 rounded-xl border border-border p-3">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <FileSignature className="h-4 w-4 text-primary" /> Acordos de Compensação
      </p>
      {temRegraUnidade && (
        <div className="space-y-2 rounded-lg border border-dashed border-border p-2.5">
          <p className="text-xs text-muted-foreground">Regras da unidade para este colaborador. Desligue para tirá-lo da regra.</p>
          {unidade?.banco_horas && (
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Usa Banco de Horas</span>
              <Switch checked={usaBanco} disabled={salvando || excecao.isLoading} onCheckedChange={(v) => definir("usa_banco_horas", v)} />
            </label>
          )}
          {unidade?.compensa_feriados && (
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Usa Compensação de Feriados</span>
              <Switch checked={usaFeriados} disabled={salvando || excecao.isLoading} onCheckedChange={(v) => definir("usa_compensa_feriados", v)} />
            </label>
          )}
        </div>
      )}
      {pendentes.length > 1 && (
        <div className="space-y-1.5 rounded-lg bg-primary/5 p-2.5">
          <p className="text-sm font-medium">Termo Único</p>
          <p className="text-xs text-muted-foreground">Junte os {pendentes.length} acordos pendentes em um só documento, com uma única assinatura.</p>
          <Button type="button" size="sm" disabled={status.isLoading || extras.isLoading} onClick={() => setPrevia(pendentes)}>
            Revisar e Gerar Termo Único
          </Button>
        </div>
      )}
      {tipos.map((t) => {
        const s = status.data?.[t];
        return (
          <div key={t} className="space-y-1.5 rounded-lg bg-muted/40 p-2.5">
            <p className="text-sm font-medium">{TERMOS_COMPENSACAO[t].titulo}</p>
            <p className="text-xs text-muted-foreground">{motivo[t]}</p>
            {s ? (
              <p className="flex items-center gap-1.5 text-xs font-medium">
                {s.assinado ? (
                  <><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Assinado — salvo na aba Documentos.</>
                ) : (
                  <><Clock className="h-3.5 w-3.5 text-muted-foreground" /> Aguardando assinatura no portal.</>
                )}
              </p>
            ) : (
              <Button type="button" size="sm" disabled={status.isLoading || extras.isLoading} variant={pendentes.length > 1 ? "outline" : "default"} onClick={() => setPrevia([t])}>
                Revisar e Gerar Termo
              </Button>
            )}
          </div>
        );
      })}
      {previa && (
        <TermoCompensacaoPreviaDialog
          open={!!previa}
          onOpenChange={(v) => { if (!v) setPrevia(null); }}
          disponiveis={previa}
          companyId={companyId}
          colaboradorId={colaboradorId}
          partes={{
            empresa: extras.data?.empresa ?? "EMPRESA", cnpj: extras.data?.cnpj, unidade: unidade?.nome ? toUpperCadastro(unidade.nome) : null,
            nome: toUpperCadastro(nome), cpf: cpfFmt(cpf), cargo: extras.data?.cargo ? toUpperCadastro(extras.data.cargo) : null,
          }}
          jornada={jornada}
          onEmitido={() => qc.invalidateQueries({ queryKey: ["dp_termos_compensacao", colaboradorId] })}
        />
      )}
    </div>
  );
}
