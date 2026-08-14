import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, CalendarOff } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { normalizarDias, resumoConfigTexto, type DiaConfig, type TurnoResolvido } from "@/lib/dp/config-trabalho";

export interface ConfigCopiada {
  turno_padrao_id: string | null;
  folga_variavel: boolean;
  dias: DiaConfig[];
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Colaborador atual — excluído da lista. */
  colaboradorId?: string | null;
  /** Unidade atual — restringe a lista a colegas da mesma unidade. */
  unidadeId?: string | null;
  turnos: TurnoResolvido[];
  onCopiar: (config: ConfigCopiada) => void;
}

const hoje = () => new Date().toISOString().slice(0, 10);

/**
 * Repete a configuração de trabalho de um colega já cadastrado, para que o admin
 * não precise reconfigurar turno e dias a cada novo colaborador.
 */
export function CopiarConfigColaboradorDialog({
  open, onOpenChange, colaboradorId, unidadeId, turnos, onCopiar,
}: Props) {
  const { selectedCompanyId } = useCompanyContext();

  const { data, isLoading } = useQuery({
    queryKey: ["dp_config_trabalho_modelos", selectedCompanyId, unidadeId ?? null],
    enabled: open && !!selectedCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("dp_colaborador_config_trabalho")
        .select(
          "id, colaborador_id, unidade_id, turno_padrao_id, folga_variavel, folga_fixa_dow, vigencia_fim, vigencia_inicio, dias:dp_colaborador_config_dias(dow, trabalha, turno_id), colaborador:dp_colaboradores(nome, cargo, ativo)",
        )
        .eq("company_id", selectedCompanyId!)
        .order("vigencia_inicio", { ascending: false });
      if (unidadeId) q = q.eq("unidade_id", unidadeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const modelos = useMemo(() => {
    const vistos = new Set<string>();
    return (data ?? [])
      .filter((c) => (!c.vigencia_fim || c.vigencia_fim >= hoje()))
      .filter((c) => c.colaborador?.ativo !== false)
      .filter((c) => c.colaborador_id !== colaboradorId)
      .filter((c) => {
        if (vistos.has(c.colaborador_id)) return false;
        vistos.add(c.colaborador_id);
        return true;
      });
  }, [data, colaboradorId]);

  const copiar = (c: any) => {
    onCopiar({
      turno_padrao_id: c.turno_padrao_id ?? null,
      folga_variavel: !!c.folga_variavel,
      dias: normalizarDias(
        (c.dias ?? []).map((d: any) => ({ dow: d.dow, trabalha: d.trabalha, turno_id: d.turno_id })),
      ),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5 text-primary" aria-hidden="true" />
            Copiar de outro colaborador
          </DialogTitle>
          <DialogDescription>
            Escolha um colega com a mesma rotina. Você ainda pode ajustar tudo antes de salvar.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : modelos.length === 0 ? (
          <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <CalendarOff className="h-4 w-4" aria-hidden="true" />
            Nenhum colaborador desta unidade tem configuração de trabalho ainda.
          </p>
        ) : (
          <ul className="max-h-[50vh] divide-y overflow-y-auto rounded-lg border">
            {modelos.map((c) => (
              <li key={c.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.colaborador?.nome ?? "Colaborador"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.colaborador?.cargo ? `${c.colaborador.cargo} · ` : ""}
                    {resumoConfigTexto(
                      {
                        turno_padrao_id: c.turno_padrao_id,
                        folga_variavel: c.folga_variavel,
                        folga_fixa_dow: c.folga_fixa_dow,
                        dias: (c.dias ?? []).map((d: any) => ({ dow: d.dow, trabalha: d.trabalha, turno_id: d.turno_id })),
                      },
                      turnos,
                    )}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="shrink-0" onClick={() => copiar(c)}>
                  Usar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
