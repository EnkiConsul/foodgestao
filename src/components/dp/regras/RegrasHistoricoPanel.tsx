import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, History, Info, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDpConfigDp } from "@/hooks/useDpConfigDp";
import { diffRegras } from "@/lib/dp/regras-labels";
import { DpContentCard } from "@/components/dp/DpPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

/** Histórico recolhível das alterações de regras, com diff campo a campo. */
export function RegrasHistoricoPanel() {
  const { historico } = useDpConfigDp();
  const [aberto, setAberto] = useState(false);
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});

  const registros = useMemo(() => historico.slice(0, 30), [historico]);

  const userIds = useMemo(
    () => Array.from(new Set(registros.map((h) => h.usuario_id).filter((v): v is string => !!v))),
    [registros],
  );

  const perfis = useQuery({
    queryKey: ["dp_regras_historico_perfis", userIds],
    enabled: userIds.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const p of data ?? []) {
        if (p.full_name) map[p.id as string] = p.full_name as string;
      }
      return map;
    },
  });

  const nomeUsuario = (id: string | null) =>
    (id && perfis.data?.[id]) || "Usuário do sistema";

  const ultima = registros[0]?.created_at;

  return (
    <DpContentCard contentClassName="p-0">
      <Collapsible open={aberto} onOpenChange={setAberto}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-3 p-4 text-left md:p-5"
            aria-label="Histórico de alterações das regras"
          >
            <History className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold">Histórico de Alterações</h2>
              <p className="text-xs text-muted-foreground">
                {registros.length === 0
                  ? "Nenhuma alteração registrada ainda."
                  : `${registros.length} alteração(ões) registrada(s) • última em ${dataHora(ultima!)}`}
              </p>
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                aberto && "rotate-180",
              )}
              aria-hidden="true"
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t px-4 py-3 md:px-5">
            {registros.length === 0 ? (
              <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                <Info className="h-4 w-4" aria-hidden="true" /> Nenhuma alteração registrada ainda.
              </p>
            ) : (
              <ul className="divide-y">
                {registros.map((h) => {
                  const itens = diffRegras(h.valor_antigo, h.valor_novo);
                  const aberto2 = !!expandido[h.id];
                  const visiveis = aberto2 ? itens : itens.slice(0, 3);
                  return (
                    <li key={h.id} className="space-y-2 py-3">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-muted-foreground">{dataHora(h.created_at)}</span>
                        <span className="font-medium">{h.tabela}</span>
                        <Badge variant="outline">{nomeUsuario(h.usuario_id)}</Badge>
                        {h.ciencia_confirmada && (
                          <Badge variant="destructive">Ciência confirmada</Badge>
                        )}
                      </div>

                      {itens.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Regra gravada sem mudança de valores.
                        </p>
                      ) : (
                        <ul className="space-y-1">
                          {visiveis.map((d) => (
                            <li
                              key={d.campo}
                              className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
                            >
                              <span className="font-medium">{d.label}:</span>
                              <span className="text-muted-foreground line-through">{d.de}</span>
                              <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                              <span className="font-semibold text-foreground">{d.para}</span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {itens.length > 3 && (
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          className="h-auto p-0 text-xs"
                          onClick={() =>
                            setExpandido((prev) => ({ ...prev, [h.id]: !prev[h.id] }))
                          }
                        >
                          {aberto2
                            ? "Ver menos"
                            : `Ver mais ${itens.length - 3} campo(s) alterado(s)`}
                        </Button>
                      )}

                      {h.justificativa && (
                        <p className="text-xs italic text-muted-foreground">“{h.justificativa}”</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </DpContentCard>
  );
}
