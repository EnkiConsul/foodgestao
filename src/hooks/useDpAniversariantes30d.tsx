import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { differenceInCalendarDays, differenceInYears } from "date-fns";

export type AnivItem = {
  id: string;
  colaboradorId: string;
  nome: string;
  cargo: string | null;
  unidade: string | null;
  tipo: "nascimento" | "contratacao";
  data: Date;
  diaMes: string; // "15/07"
  anosCompletos: number;
  faltamDias: number;
};

function nextOccurrence(month: number, day: number): Date {
  const now = new Date();
  const year = now.getFullYear();
  const candidate = new Date(year, month, day);
  candidate.setHours(0, 0, 0, 0);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (candidate < today) candidate.setFullYear(year + 1);
  return candidate;
}

export function useDpAniversariantes30d() {
  const { selectedCompanyId } = useCompanyContext();
  return useQuery({
    queryKey: ["dp_aniv_30d", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<AnivItem[]> => {
      const { data, error } = await supabase
        .from("dp_colaboradores")
        .select("id, nome, cargo, data_nascimento, data_admissao, dp_unidades(nome)")
        .eq("company_id", selectedCompanyId!)
        .eq("ativo", true);
      if (error) throw error;

      const items: AnivItem[] = [];
      const today = new Date();

      (data ?? []).forEach((c: any) => {
        const push = (raw: string | null, tipo: AnivItem["tipo"]) => {
          if (!raw) return;
          const d = new Date(raw);
          const month = d.getUTCMonth();
          const day = d.getUTCDate();
          const next = nextOccurrence(month, day);
          const faltam = differenceInCalendarDays(next, today);
          if (faltam < 0 || faltam > 30) return;
          items.push({
            id: `${c.id}-${tipo}`,
            colaboradorId: c.id,
            nome: c.nome,
            cargo: c.cargo,
            unidade: c.dp_unidades?.nome ?? null,
            tipo,
            data: next,
            diaMes: `${String(day).padStart(2, "0")}/${String(month + 1).padStart(2, "0")}`,
            anosCompletos: differenceInYears(next, d),
            faltamDias: faltam,
          });
        };
        push(c.data_nascimento, "nascimento");
        push(c.data_admissao, "contratacao");
      });

      return items.sort((a, b) => a.faltamDias - b.faltamDias);
    },
  });
}
