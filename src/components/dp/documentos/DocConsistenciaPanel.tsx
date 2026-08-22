import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** YYYY-MM do mês anterior (competência usual de importação). */
function competenciaAnterior(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type Alerta = {
  colaborador_id: string;
  nome: string;
  tipo: "ponto" | "adiantamento";
  problema: "faltando" | "inconsistente";
};

const TIPO_LABEL = { ponto: "Folha de Ponto", adiantamento: "Adiantamento Salarial" } as const;

/**
 * Confere, por competência, se os documentos de Folha de Ponto e Adiantamento
 * batem com o que está marcado no cadastro do colaborador.
 */
export function DocConsistenciaPanel() {
  const { selectedCompanyId } = useCompanyContext();
  const [competencia, setCompetencia] = useState(competenciaAnterior());

  const ref = competencia ? `${competencia}-01` : null;

  const query = useQuery({
    queryKey: ["dp_doc_consistencia", selectedCompanyId, ref],
    enabled: !!selectedCompanyId && !!ref,
    queryFn: async () => {
      const [colabsRes, docsRes] = await Promise.all([
        supabase
          .from("dp_colaboradores")
          .select("id, nome, possui_folha_ponto, optante_adiantamento")
          .eq("company_id", selectedCompanyId!)
          .eq("ativo", true),
        supabase
          .from("dp_documentos")
          .select("colaborador_id, tipo")
          .eq("company_id", selectedCompanyId!)
          .eq("referencia_data", ref!)
          .in("tipo", ["ponto", "adiantamento"]),
      ]);
      if (colabsRes.error) throw colabsRes.error;
      if (docsRes.error) throw docsRes.error;

      const importados = new Set(
        (docsRes.data ?? []).map((d: any) => `${d.colaborador_id}::${d.tipo}`),
      );
      const alertas: Alerta[] = [];
      for (const c of (colabsRes.data ?? []) as any[]) {
        const checks: Array<["ponto" | "adiantamento", boolean]> = [
          ["ponto", c.possui_folha_ponto === true],
          ["adiantamento", c.optante_adiantamento === true],
        ];
        for (const [tipo, ativo] of checks) {
          const temDoc = importados.has(`${c.id}::${tipo}`);
          if (ativo && !temDoc) {
            alertas.push({ colaborador_id: c.id, nome: c.nome, tipo, problema: "faltando" });
          } else if (!ativo && temDoc) {
            alertas.push({ colaborador_id: c.id, nome: c.nome, tipo, problema: "inconsistente" });
          }
        }
      }
      return { alertas, totalColabs: (colabsRes.data ?? []).length };
    },
  });

  const faltando = useMemo(
    () => (query.data?.alertas ?? []).filter((a) => a.problema === "faltando"),
    [query.data],
  );
  const inconsistentes = useMemo(
    () => (query.data?.alertas ?? []).filter((a) => a.problema === "inconsistente"),
    [query.data],
  );

  return (
    <Card className="dp-content-card">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base">Conferência da Competência</CardTitle>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Competência</Label>
            <Input
              type="month"
              className="h-9 w-[160px]"
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isLoading && <p className="text-sm text-muted-foreground">Conferindo…</p>}

        {!query.isLoading && faltando.length === 0 && inconsistentes.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Folhas de ponto e adiantamentos batem com o cadastro dos colaboradores ativos.
          </div>
        )}

        {faltando.length > 0 && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" /> Falta Importar ({faltando.length})
            </div>
            <p className="text-xs text-muted-foreground">
              Cadastro marcado como ativo para o documento, mas nada foi importado nesta competência.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {faltando.map((a) => (
                <Badge key={`${a.colaborador_id}-${a.tipo}`} variant="outline" className="text-[11px]">
                  {a.nome} · {TIPO_LABEL[a.tipo]}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {inconsistentes.length > 0 && (
          <div className="rounded-md border border-rose-500/40 bg-rose-500/5 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-rose-700 dark:text-rose-300">
              <ShieldAlert className="h-4 w-4" /> Inconsistência de Cadastro ({inconsistentes.length})
            </div>
            <p className="text-xs text-muted-foreground">
              Documento importado, mas o cadastro do colaborador está com esse item desativado.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {inconsistentes.map((a) => (
                <Badge key={`${a.colaborador_id}-${a.tipo}`} variant="outline" className="text-[11px]">
                  {a.nome} · {TIPO_LABEL[a.tipo]}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
