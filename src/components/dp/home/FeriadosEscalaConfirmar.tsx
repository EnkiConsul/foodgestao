import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { CalendarClock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";
import { diasAte } from "@/lib/dp/feriado-regua";
import { agruparPorData, feriadosPendentesConfirmacao, type FeriadoEscala } from "@/lib/dp/feriado-escala-pendente";
import { notifyError } from "@/lib/notifyError";

const KEY = "dp-feriados-escala-pendentes";

/** Feriados próximos com escala ainda não confirmada (compartilhado por Resolva Rápido e Ações do Dia). */
export function useFeriadosEscalaPendentes() {
  const { selectedCompanyId } = useCompanyContext();
  const hoje = format(new Date(), "yyyy-MM-dd");
  return useQuery({
    queryKey: [KEY, selectedCompanyId, hoje],
    enabled: !!selectedCompanyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<FeriadoEscala[]> => {
      const fim = format(addDays(new Date(), 10), "yyyy-MM-dd");
      const { data: unidades, error } = await supabase
        .from("dp_unidades").select("id, nome").eq("ativo", true).eq("company_id", selectedCompanyId!);
      if (error) throw error;
      const feriados: FeriadoEscala[] = [];
      await Promise.all((unidades ?? []).map(async (u) => {
        const { data } = await supabase.rpc("dp_feriados_resolver_v2", { _unidade_id: u.id, _inicio: hoje, _fim: fim });
        for (const r of (data ?? []) as { data: string; nome: string }[]) feriados.push({ unidadeId: u.id, unidade: u.nome, data: r.data, nome: r.nome });
      }));
      if (!feriados.length) return [];
      const { data: ops, error: e2 } = await supabase
        .from("dp_unidade_feriado_operacao")
        .select("unidade_id, data, fechada, escala_confirmada_em")
        .eq("company_id", selectedCompanyId!).gte("data", hoje).lte("data", fim);
      if (e2) throw e2;
      return feriadosPendentesConfirmacao(hoje, feriados, ops ?? []);
    },
  });
}

const br = (d: string) => d.split("-").reverse().join("/");

export function FeriadosEscalaConfirmar({ onNavigate }: { onNavigate?: () => void }) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const q = useFeriadosEscalaPendentes();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const hoje = format(new Date(), "yyyy-MM-dd");
  const grupos = agruparPorData(q.data ?? []);
  if (!grupos.length) return null;

  const confirmar = async (chave: string, lojas: FeriadoEscala[]) => {
    setOcupado(chave);
    try {
      const { data: u } = await supabase.auth.getUser();
      const agora = new Date().toISOString();
      const { error } = await supabase.from("dp_unidade_feriado_operacao").upsert(
        lojas.map((l) => ({
          company_id: selectedCompanyId!, unidade_id: l.unidadeId, data: l.data, fechada: false,
          escala_confirmada_em: agora, escala_confirmada_por: u.user?.id ?? null,
        })),
        { onConflict: "unidade_id,data" },
      );
      if (error) throw error;
      toast.success(lojas.length > 1 ? "Escala confirmada em todas as lojas" : "Escala confirmada");
      qc.invalidateQueries({ queryKey: [KEY] });
    } catch (e) {
      notifyError(e, { surface: "Escala de feriado", action: "confirmar a escala", fallback: "Não foi possível confirmar. Tente novamente." });
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <CalendarClock className="h-4 w-4 text-primary" aria-hidden="true" /> Escala de Feriado
      </h3>
      {grupos.map((g) => {
        const d = diasAte(hoje, g.data);
        return (
          <div key={g.data} className="space-y-2 rounded-xl border p-3">
            <p className="text-sm">
              <span className="font-medium">{g.nome}</span>
              <span className="text-muted-foreground"> · {br(g.data)} · {d === 0 ? "hoje" : `em ${d} dia${d > 1 ? "s" : ""}`}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Confira quem trabalha. {d > 5 ? "Até 5 dias antes a desconvocação é livre." : "Desconvocar agora (exceto a pedido do colaborador) mantém o pagamento do dia."}
            </p>
            <ul className="space-y-2">
              {g.lojas.map((l) => (
                <li key={l.unidadeId} className="flex flex-col gap-2 rounded-lg bg-muted/40 p-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0 break-words text-sm">{l.unidade}</span>
                  <div className="grid grid-cols-2 gap-2 sm:flex">
                    <Button asChild size="sm" variant="outline" className="min-h-11">
                      <Link to={`/dp/escalas/mes?unidade=${l.unidadeId}&data=${l.data}`} onClick={onNavigate}>Revisar Escala</Link>
                    </Button>
                    <Button size="sm" className="min-h-11" disabled={!!ocupado} onClick={() => confirmar(`${l.unidadeId}:${l.data}`, [l])}>
                      <CheckCircle2 className="mr-1 h-4 w-4" aria-hidden="true" />
                      {ocupado === `${l.unidadeId}:${l.data}` ? "Salvando..." : "Confirmar Escala"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            {g.lojas.length > 1 && (
              <Button size="sm" variant="secondary" className="min-h-11 w-full" disabled={!!ocupado} onClick={() => confirmar(g.data, g.lojas)}>
                {ocupado === g.data ? "Salvando..." : "Confirmar Todas as Lojas"}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
