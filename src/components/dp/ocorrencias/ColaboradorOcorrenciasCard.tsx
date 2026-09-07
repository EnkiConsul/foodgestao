import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { ESTADO_LABEL, TIPO_LABEL, type OcorrenciaEstado, type OcorrenciaTipo } from "@/lib/dp/ocorrencias";

interface Linha {
  id: string;
  data_operacional: string;
  tipo: OcorrenciaTipo;
  estado: OcorrenciaEstado;
  minutos: number | null;
  justificativa_inicial: string | null;
}

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function rotuloMes(data: string): string {
  const [ano, mes] = data.split("-");
  return `${MESES[Number(mes) - 1]} de ${ano}`;
}

/** Ocorrências do colaborador agrupadas por mês, para a ficha. */
export function ColaboradorOcorrenciasCard({ colaboradorId }: { colaboradorId: string | null }) {
  const { selectedCompanyId } = useCompanyContext();

  const { data = [], isLoading } = useQuery({
    queryKey: ["dp_ocorrencias_colaborador", selectedCompanyId, colaboradorId],
    enabled: !!selectedCompanyId && !!colaboradorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_ocorrencias")
        .select("id, data_operacional, tipo, estado, minutos, justificativa_inicial")
        .eq("company_id", selectedCompanyId!)
        .eq("colaborador_id", colaboradorId!)
        .order("data_operacional", { ascending: false })
        .limit(120);
      if (error) throw error;
      return (data ?? []) as unknown as Linha[];
    },
  });

  const grupos = useMemo(() => {
    const mapa = new Map<string, Linha[]>();
    for (const l of data) {
      const chave = l.data_operacional.slice(0, 7);
      const atual = mapa.get(chave) ?? [];
      atual.push(l);
      mapa.set(chave, atual);
    }
    return [...mapa.entries()];
  }, [data]);

  if (isLoading) {
    return <p className="col-span-full text-sm text-muted-foreground">Carregando ocorrências…</p>;
  }

  if (grupos.length === 0) {
    return (
      <p className="col-span-full text-sm text-muted-foreground">
        Nenhuma ocorrência registrada para este colaborador.
      </p>
    );
  }

  return (
    <div className="col-span-full space-y-3">
      {grupos.map(([chave, linhas]) => (
        <div key={chave} className="rounded-md border border-border">
          <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-sm font-medium">
            <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
            {rotuloMes(`${chave}-01`)}
            <Badge variant="outline" className="text-[10px]">
              {linhas.length}
            </Badge>
          </div>
          <div className="divide-y divide-border">
            {linhas.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-sm">
                <span>
                  {new Date(`${l.data_operacional}T12:00:00`).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                  })}{" "}
                  · {TIPO_LABEL[l.tipo]}
                  {l.minutos ? ` · ${l.minutos} min` : ""}
                </span>
                <span className="text-muted-foreground">
                  {ESTADO_LABEL[l.estado]}
                  {l.justificativa_inicial ? ` · ${l.justificativa_inicial}` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
