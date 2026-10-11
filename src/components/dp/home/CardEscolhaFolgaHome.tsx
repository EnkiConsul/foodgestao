import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { podeEscolherFolgaFds } from "@/lib/dp/escolha-folga-elegibilidade";

type Janela = {
  ativa?: boolean;
  estado?: string;
  competencia?: string;
  fecha_em?: string;
  folgas_exigidas?: number;
};

const fmt = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  void y;
  return `${d}/${m}`;
};

/**
 * Card de destaque na tela inicial do portal enquanto a escolha mensal de
 * folgas estiver aberta para a pessoa e ainda faltar folga de fim de semana.
 * A janela (inclusive o dia antecipado de quem tem datas restritas) vem do
 * servidor; o texto é neutro, sem citar restrição.
 */
export function CardEscolhaFolgaHome() {
  const q = useQuery({
    queryKey: ["dp_card_escolha_folga"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: colabId } = await supabase.rpc("dp_meu_colaborador");
      if (!colabId) return null;
      const { data: c } = await supabase
        .from("dp_colaboradores")
        .select("id, company_id, unidade_id, regime, forma_pagamento, vinculo_label")
        .eq("id", colabId as string)
        .maybeSingle();
      if (!c || !podeEscolherFolgaFds(c.regime, c.forma_pagamento, c.vinculo_label)) return null;

      const { data: j, error } = await supabase.rpc("dp_folgas_janela_efetiva", {
        _company: c.company_id,
        _unidade: c.unidade_id ?? undefined,
      });
      if (error || !j) return null;
      const janela = j as unknown as Janela;
      if (!janela.ativa || janela.estado !== "aberta" || !janela.competencia) return null;

      const ini = janela.competencia.slice(0, 10);
      const [y, m] = ini.split("-").map(Number);
      const fim = new Date(y, m, 0);
      const fimIso = `${y}-${String(m).padStart(2, "0")}-${String(fim.getDate()).padStart(2, "0")}`;
      const { data: folgas } = await supabase
        .from("dp_folgas")
        .select("data, extra, status")
        .eq("colaborador_id", c.id)
        .gte("data", ini)
        .lte("data", fimIso)
        .neq("status", "cancelada");
      const marcadas = (folgas ?? []).filter((f) => {
        if (f.extra) return false;
        const dow = new Date(`${f.data}T12:00:00`).getDay();
        return dow === 0 || dow === 6;
      }).length;
      const exigidas = Number(janela.folgas_exigidas ?? 1);
      if (marcadas >= exigidas) return null;
      const mesNome = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long" });
      return {
        mes: `${mesNome.charAt(0).toUpperCase()}${mesNome.slice(1)}`,
        ate: janela.fecha_em ? fmt(janela.fecha_em) : null,
        competencia: ini,
      };
    },
  });

  if (!q.data) return null;
  const { mes, ate, competencia } = q.data;

  return (
    <div className="rounded-2xl border-2 border-primary/50 bg-primary/5 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <CalendarCheck className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base sm:text-lg font-semibold">Escolha de folga liberada</h2>
          <p className="text-sm text-muted-foreground">
            A escolha das suas folgas de {mes} está disponível.
            {ate ? ` Escolha até ${ate} para garantir as datas de sua preferência.` : ""}
          </p>
          <Button asChild size="sm" className="mt-3 w-full sm:w-auto">
            <Link to={`/dp/meu/calendario?mes=${competencia.slice(0, 7)}`}>
              Escolher minha folga <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
