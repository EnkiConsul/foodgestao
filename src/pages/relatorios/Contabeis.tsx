import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useCategoriasSemConta } from "@/hooks/useCategoriasSemConta";

import { format, startOfMonth, endOfMonth } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import {
  ReportFilters,
  type FiltersState,
  type Preset,
} from "@/components/relatorios/contabeis/ReportFilters";
import { DreReport } from "@/components/relatorios/contabeis/DreReport";
import { GeneralLedgerDrawer } from "@/components/relatorios/contabeis/GeneralLedgerDrawer";
import { PendingClassificationPanel } from "@/components/relatorios/contabeis/PendingClassificationPanel";
import { useContabeisReport, type ReportNode } from "@/hooks/useContabeisReport";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useFocusRetention } from "@/hooks/useFocusRetention";

const DEFAULTS: FiltersState = (() => {
  const now = new Date();
  return {
    preset: "month",
    from: format(startOfMonth(now), "yyyy-MM-dd"),
    to: format(endOfMonth(now), "yyyy-MM-dd"),
    regime: "caixa",
    status: "pago",
    include_zero: false,
  };
})();

export default function RelatoriosContabeis() {
  const { contextType, selectedCompanyId, companies } = useCompanyContext();
  const [sp, setSp] = useSearchParams();

  const filters: FiltersState = useMemo(() => {
    return {
      preset: (sp.get("preset") as Preset) || DEFAULTS.preset,
      from: sp.get("from") || DEFAULTS.from,
      to: sp.get("to") || DEFAULTS.to,
      regime: "caixa",
      status: (sp.get("status") as FiltersState["status"]) || DEFAULTS.status,
      include_zero: sp.get("include_zero") === "1",
    };
  }, [sp]);

  const setFilters = (v: FiltersState) => {
    const next = new URLSearchParams(sp);
    next.set("preset", v.preset);
    next.set("from", v.from);
    next.set("to", v.to);
    next.set("regime", v.regime);
    next.set("status", v.status);
    next.set("include_zero", v.include_zero ? "1" : "0");
    setSp(next, { replace: true });
  };

  const [drawerAccount, setDrawerAccount] = useState<ReportNode | null>(null);

  const { data: nodes = [], isLoading, error } = useContabeisReport(filters);
  const focusScopeRef = useFocusRetention<HTMLDivElement>();
  const [tab, setTab] = useState<"dre" | "pendencias">("dre");
  const { data: semConta = 0 } = useCategoriasSemConta();


  const blockedPj = contextType === "pj" && !selectedCompanyId;

  return (
    <div className="space-y-4">
      <Helmet>
        <title>DRE Gerencial | 360°FOOD</title>
        <meta
          name="description"
          content="DRE Gerencial gerada dinamicamente a partir do plano de contas."
        />
      </Helmet>

      <div className="space-y-1">
        <h1 className="text-xl md:text-2xl font-bold">DRE Gerencial</h1>
        <p className="text-xs md:text-sm text-muted-foreground">
          Estrutura derivada 100% do plano de contas cadastrado. Alterações no cadastro refletem em
          tempo real.
        </p>
      </div>

      <ReportFilters value={filters} onChange={setFilters} />

      {blockedPj && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground text-center">
            Selecione uma empresa no seletor superior para ver os relatórios contábeis.
          </CardContent>
        </Card>
      )}

      {!blockedPj && (
        <div ref={focusScopeRef} tabIndex={-1} data-focus-scope="dre" className="outline-none">
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "dre" | "pendencias")}
          className="space-y-4"
        >
          <TabsList className="flex flex-wrap gap-1">
            <TabsTrigger value="dre">DRE Gerencial</TabsTrigger>
            <TabsTrigger value="pendencias">Pendências</TabsTrigger>
          </TabsList>

          {error && (
            <Card className="border-destructive">
              <CardContent className="p-4 text-sm text-destructive">
                Erro ao carregar: {(error as Error).message}
              </CardContent>
            </Card>
          )}

          {isLoading && nodes.length === 0 && (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground text-center">
                Calculando…
              </CardContent>
            </Card>
          )}

          {!isLoading && !error && nodes.length === 0 && (
            <Card className="border-amber-500/40">
              <CardContent className="p-6 space-y-3 text-center">
                {filters.include_zero ? (
                  <>
                    <p className="text-sm font-medium">
                      Nenhuma conta contábil disponível para este contexto.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      O DRE é montado a partir do plano de contas. Crie ou vincule o plano de contas
                      para começar.
                    </p>
                    <Button asChild size="sm">
                      <Link to="/contas-contabeis">Abrir Contas Contábeis</Link>
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium">
                      Nenhum lançamento no período selecionado.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Ajuste o período ou ative “Incluir contas sem movimento” para ver o
                      plano de contas completo.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          )}


          {!isLoading && !error && semConta > 0 && (
            <Card className="border-amber-500/40">
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
                <p className="text-sm">
                  <span className="font-medium">{semConta}</span>{" "}
                  {semConta === 1 ? "categoria ativa está" : "categorias ativas estão"} sem conta
                  contábil e {semConta === 1 ? "fica" : "ficam"} de fora do DRE.
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link to="/categorias">Concluir vínculos</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Os TabsContent ficam sempre montados para que o `aria-controls`
              dos gatilhos nunca aponte para um id inexistente (a11y). */}
          <TabsContent value="dre">
            {!isLoading && !error && (
              <DreReport
                nodes={nodes}
                onSelectAnalytic={setDrawerAccount}
                from={filters.from}
                to={filters.to}
                regime={filters.regime}
                contextLabel={
                  contextType === "pj"
                    ? companies.find((c) => c.id === selectedCompanyId)?.name ?? "Empresa"
                    : "Pessoa Física"
                }
              />
            )}
          </TabsContent>
          <TabsContent value="pendencias">
            {!isLoading && !error && (
              <PendingClassificationPanel from={filters.from} to={filters.to} />
            )}
          </TabsContent>


        </Tabs>
        </div>
      )}

      <GeneralLedgerDrawer
        account={drawerAccount}
        open={!!drawerAccount}
        onOpenChange={(o) => !o && setDrawerAccount(null)}
        from={filters.from}
        to={filters.to}
        regime={filters.regime}
        status={filters.status}
      />
    </div>
  );
}
