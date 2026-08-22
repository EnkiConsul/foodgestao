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

const MAX_NOMES = 6;

type Grupo = {
  key: string;
  tipo: "ponto" | "adiantamento";
  problema: "faltando" | "inconsistente";
  nomes: string[];
  total: number;
  completo: boolean;
};

/**
 * Confere, por competência, se os documentos de Folha de Ponto e Adiantamento
 * batem com o que está marcado no cadastro do colaborador.
 */
export function DocConsistenciaPanel() {
  const { selectedCompanyId } = useCompanyContext();
  const [competencia, setCompetencia] = useState(competenciaAnterior());
  const [aberto, setAberto] = useState<Record<string, boolean>>({});

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
      const elegiveis: Record<"ponto" | "adiantamento", number> = { ponto: 0, adiantamento: 0 };
      for (const c of (colabsRes.data ?? []) as any[]) {
        const checks: Array<["ponto" | "adiantamento", boolean]> = [
          ["ponto", c.possui_folha_ponto === true],
          ["adiantamento", c.optante_adiantamento === true],
        ];
        for (const [tipo, ativo] of checks) {
          if (ativo) elegiveis[tipo] += 1;
          const temDoc = importados.has(`${c.id}::${tipo}`);
          if (ativo && !temDoc) {
            alertas.push({ colaborador_id: c.id, nome: c.nome, tipo, problema: "faltando" });
          } else if (!ativo && temDoc) {
            alertas.push({ colaborador_id: c.id, nome: c.nome, tipo, problema: "inconsistente" });
          }
        }
      }
      return { alertas, elegiveis, totalColabs: (colabsRes.data ?? []).length };
    },
  });

  const competenciaLabel = competencia
    ? `${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`
    : "";

  const grupos = useMemo(() => {
    const alertas = query.data?.alertas ?? [];
    const elegiveis = query.data?.elegiveis ?? { ponto: 0, adiantamento: 0 };
    const out: Grupo[] = [];
    for (const problema of ["faltando", "inconsistente"] as const) {
      for (const tipo of ["ponto", "adiantamento"] as const) {
        const nomes = alertas
          .filter((a) => a.problema === problema && a.tipo === tipo)
          .map((a) => a.nome)
          .sort((a, b) => a.localeCompare(b, "pt-BR"));
        if (nomes.length === 0) continue;
        const total = elegiveis[tipo];
        out.push({
          key: `${problema}-${tipo}`,
          tipo,
          problema,
          nomes,
          total,
          completo: problema === "faltando" && total > 0 && nomes.length >= total,
        });
      }
    }
    return out;
  }, [query.data]);

  const faltando = grupos.filter((g) => g.problema === "faltando");
  const inconsistentes = grupos.filter((g) => g.problema === "inconsistente");

  const renderGrupo = (g: Grupo) => {
    const expandido = !!aberto[g.key];
    const visiveis = expandido ? g.nomes : g.nomes.slice(0, MAX_NOMES);
    const restantes = g.nomes.length - visiveis.length;
    return (
      <div key={g.key} className="rounded-md border bg-background/60 p-2.5 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{TIPO_LABEL[g.tipo]}</span>
          <Badge variant="secondary" className="text-[11px]">{competenciaLabel}</Badge>
          <span className="text-xs text-muted-foreground">
            {g.completo
              ? `lote completo pendente (${g.nomes.length} colaborador${g.nomes.length === 1 ? "" : "es"})`
              : `${g.nomes.length}${g.total ? ` de ${g.total}` : ""} ${
                  g.problema === "faltando" ? "pendentes" : "com inconsistência"
                }`}
          </span>
        </div>
        {!g.completo && (
          <div className="flex flex-wrap items-center gap-1.5">
            {visiveis.map((nome) => (
              <Badge key={nome} variant="outline" className="text-[11px]">
                {nome}
              </Badge>
            ))}
            {restantes > 0 && (
              <button
                type="button"
                className="text-[11px] text-primary underline underline-offset-2"
                onClick={() => setAberto((prev) => ({ ...prev, [g.key]: true }))}
              >
                +{restantes}
              </button>
            )}
            {expandido && g.nomes.length > MAX_NOMES && (
              <button
                type="button"
                className="text-[11px] text-muted-foreground underline underline-offset-2"
                onClick={() => setAberto((prev) => ({ ...prev, [g.key]: false }))}
              >
                ver menos
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

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
              Documento esperado pelo cadastro e ainda não importado nesta competência.
            </p>
            <div className="space-y-2">{faltando.map(renderGrupo)}</div>
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
            <div className="space-y-2">{inconsistentes.map(renderGrupo)}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
