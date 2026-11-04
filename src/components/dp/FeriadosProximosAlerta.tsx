import { useQuery } from "@tanstack/react-query";
import { format, addDays } from "date-fns";
import { CalendarClock } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { etapaFeriado, mensagemFeriado, diasAte, proximoFechamento, etapaFechamento, mensagemFechamento } from "@/lib/dp/feriado-regua";

interface Props { companyId: string | null | undefined; unidadeId?: string | null; comAtalho?: boolean }

export function FeriadosProximosAlerta({ companyId, unidadeId, comAtalho }: Props) {
  const hoje = format(new Date(), "yyyy-MM-dd");
  const fim = format(addDays(new Date(), 10), "yyyy-MM-dd");
  const q = useQuery({
    queryKey: ["dp-feriados-regua", companyId, unidadeId, hoje],
    enabled: !!companyId,
    queryFn: async () => {
      let uq = supabase.from("dp_unidades").select("id, nome, convoca_feriados_automatico").eq("ativo", true).eq("company_id", companyId!);
      if (unidadeId) uq = uq.eq("id", unidadeId);
      const { data: unidades, error } = await uq;
      if (error) throw error;
      const itens: { unidadeId: string; unidade: string; auto: boolean; data: string; nome: string }[] = [];
      for (const u of unidades ?? []) {
        const { data } = await supabase.rpc("dp_feriados_resolver_v2", { _unidade_id: u.id, _inicio: hoje, _fim: fim });
        for (const f of (data ?? []) as { data: string; nome: string }[]) {
          itens.push({ unidadeId: u.id, unidade: u.nome, auto: !!u.convoca_feriados_automatico, data: f.data, nome: f.nome });
        }
      }
      return itens.sort((a, b) => a.data.localeCompare(b.data));
    },
  });

  const f = useQuery({
    queryKey: ["dp-feriados-fechamento", companyId, unidadeId, hoje],
    enabled: !!companyId,
    queryFn: async () => {
      let uq = supabase.from("dp_unidades").select("id, nome, convoca_feriados_automatico").eq("company_id", companyId!);
      if (unidadeId) uq = uq.eq("id", unidadeId);
      const { data: unidades, error } = await uq;
      if (error) throw error;
      const { data: cfgs } = await supabase.from("dp_config_dp").select("unidade_id, folga_janela_fecha_dia").eq("company_id", companyId!);
      const out: { unidade: string; auto: boolean; fechamento: string; etapa: "d10" | "d5" | "d1"; feriados: { data: string; nome: string }[] }[] = [];
      for (const u of unidades ?? []) {
        const cfg = (cfgs ?? []).find((c) => c.unidade_id === u.id) ?? (cfgs ?? []).find((c) => !c.unidade_id);
        const { fechamento, competencia } = proximoFechamento(hoje, Number(cfg?.folga_janela_fecha_dia ?? 20));
        const etapa = etapaFechamento(hoje, fechamento);
        if (!etapa) continue;
        const [y, m] = competencia.split("-").map(Number);
        const ult = new Date(Date.UTC(y, m, 0)).getUTCDate();
        const { data } = await supabase.rpc("dp_feriados_resolver_v2", { _unidade_id: u.id, _inicio: `${competencia}-01`, _fim: `${competencia}-${ult}` });
        const feriados = ((data ?? []) as { data: string; nome: string }[]).sort((a, b) => a.data.localeCompare(b.data));
        if (feriados.length) out.push({ unidade: u.nome, auto: !!u.convoca_feriados_automatico, fechamento, etapa, feriados });
      }
      return out;
    },
  });
  const fechamentos = f.data ?? [];

  const itens = (q.data ?? []).filter((i) => etapaFeriado(hoje, i.data));
  if (!itens.length && !fechamentos.length) return null;
  const br = (d: string) => d.split("-").reverse().join("/");

  return (
    <div className="space-y-2" role="status">
      {fechamentos.map((x) => {
        const d = diasAte(hoje, x.fechamento);
        return (
          <div key={`fech-${x.unidade}`} className={`flex gap-3 rounded-lg border p-3 text-sm ${x.etapa === "d1" ? "border-destructive/40 bg-destructive/10" : "border-warning/40 bg-warning/10"}`}>
            <CalendarClock className={`mt-0.5 h-5 w-5 shrink-0 ${x.etapa === "d1" ? "text-destructive" : "text-warning"}`} />
            <div className="min-w-0">
              <p className="font-medium">
                {x.unidade}: a escala do próximo mês fecha em {d} dia{d > 1 ? "s" : ""} ({br(x.fechamento)})
              </p>
              <p>Feriados: {x.feriados.map((h) => `${h.nome} (${br(h.data)})`).join(", ")}</p>
              <p className="text-muted-foreground">{mensagemFechamento(x.etapa, x.auto)}</p>
            </div>
          </div>
        );
      })}
      {itens.map((i) => {
        const etapa = etapaFeriado(hoje, i.data)!;
        const d = diasAte(hoje, i.data);
        return (
          <div key={`${i.unidade}-${i.data}`} className="flex gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div className="min-w-0">
              <p className="font-medium">
                {i.nome} — {i.data.split("-").reverse().join("/")} · {i.unidade} ({d === 0 ? "hoje" : `em ${d} dia${d > 1 ? "s" : ""}`})
              </p>
              <p className="text-muted-foreground">{mensagemFeriado(etapa, i.auto)}</p>
              {comAtalho && (
                <Button asChild size="sm" variant="outline" className="mt-2 min-h-11 w-full sm:w-auto">
                  <Link to={`/dp/escalas/mes?unidade=${i.unidadeId}&data=${i.data}`}>Revisar Escala</Link>
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
