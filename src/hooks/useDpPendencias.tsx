import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { differenceInCalendarDays } from "date-fns";
import type { LucideIcon } from "lucide-react";
import { ClipboardList, FileText, Wallet, Users } from "lucide-react";

export type Pendencia = {
  id: string;
  icon: LucideIcon;
  titulo: string;
  subtitulo: string;
  tipo: string;
  vencimento?: string | null;
  atrasoDias?: number | null;
  url: string;
};

export function useDpPendencias() {
  const { selectedCompanyId } = useCompanyContext();

  return useQuery({
    queryKey: ["dp_pendencias", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<Pendencia[]> => {
      const today = new Date();
      const results: Pendencia[] = [];

      // Solicitações pendentes
      const { data: sols } = await supabase
        .from("dp_solicitacoes")
        .select("id, tipo, created_at, dp_colaboradores(nome)")
        .eq("company_id", selectedCompanyId!)
        .eq("status", "pendente")
        .order("created_at", { ascending: true })
        .limit(20);
      (sols ?? []).forEach((s: any) => {
        const dias = differenceInCalendarDays(today, new Date(s.created_at));
        results.push({
          id: `sol-${s.id}`,
          icon: ClipboardList,
          titulo: `Solicitação de ${s.tipo}`,
          subtitulo: s.dp_colaboradores?.nome ?? "Colaborador",
          tipo: "Solicitação",
          vencimento: s.created_at,
          atrasoDias: dias > 3 ? dias : null,
          url: "/dp/solicitacoes",
        });
      });

      // Trocas pendentes de gestor
      const { data: trocas } = await supabase
        .from("dp_trocas")
        .select("id, status, created_at, solicitante:solicitante_id(nome)")
        .eq("company_id", selectedCompanyId!)
        .in("status", ["pendente_gestor"])
        .order("created_at", { ascending: true })
        .limit(10);
      (trocas ?? []).forEach((t: any) => {
        const dias = differenceInCalendarDays(today, new Date(t.created_at));
        results.push({
          id: `troca-${t.id}`,
          icon: Users,
          titulo: "Troca aguardando aprovação",
          subtitulo: t.solicitante?.nome ?? "Colaborador",
          tipo: "Troca",
          vencimento: t.created_at,
          atrasoDias: dias > 2 ? dias : null,
          url: "/dp/trocas",
        });
      });

      // Folhas em aberto
      const { data: folhas } = await supabase
        .from("dp_folha_periodos")
        .select("id, competencia, status, created_at")
        .eq("company_id", selectedCompanyId!)
        .in("status", ["aberto", "em_processamento"])
        .order("competencia", { ascending: false })
        .limit(6);
      (folhas ?? []).forEach((f: any) => {
        const dias = differenceInCalendarDays(today, new Date(f.created_at));
        results.push({
          id: `folha-${f.id}`,
          icon: Wallet,
          titulo: `Folha ${f.competencia} em aberto`,
          subtitulo: `Status: ${f.status}`,
          tipo: "Folha",
          vencimento: f.created_at,
          atrasoDias: dias > 5 ? dias : null,
          url: `/dp/folha/periodos/${f.id}`,
        });
      });

      // Negociações sindicais expirando
      const { data: negs } = await supabase
        .from("dp_sindicato_negociacoes")
        .select("id, sindicato_id, data_termino, dp_sindicatos(sigla, nome)")
        .eq("company_id", selectedCompanyId!)
        .not("data_termino", "is", null)
        .lte("data_termino", new Date(today.getTime() + 60 * 86400_000).toISOString().slice(0, 10))
        .order("data_termino", { ascending: true })
        .limit(10);
      (negs ?? []).forEach((n: any) => {
        const dias = differenceInCalendarDays(today, new Date(n.data_termino));
        results.push({
          id: `neg-${n.id}`,
          icon: FileText,
          titulo: `Negociação coletiva - ${n.dp_sindicatos?.sigla ?? "Sindicato"}`,
          subtitulo: `Término: ${n.data_termino}`,
          tipo: "Negociação",
          vencimento: n.data_termino,
          atrasoDias: dias > 0 ? dias : null,
          url: "/dp/sindicatos/negociacoes",
        });
      });

      return results.sort((a, b) => (b.atrasoDias ?? 0) - (a.atrasoDias ?? 0));
    },
  });
}
