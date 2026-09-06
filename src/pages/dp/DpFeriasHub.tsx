import { Suspense, lazy, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { useSearchParams } from "react-router-dom";
import { Palmtree, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs";
import { DpPage, DpPageHeader, DpEmbeddedProvider } from "@/components/dp/DpPage";
import { DpTabsBar } from "@/components/dp/DpTabsBar";
import { FeriasRegrasSection } from "@/components/dp/ferias/FeriasRegrasSection";
import { FeriasDashboard } from "@/components/dp/ferias/FeriasDashboard";
import { FeriasGozosPanel } from "@/components/dp/ferias/FeriasGozosPanel";
import { FeriasSolicitacoesPanel } from "@/components/dp/ferias/FeriasSolicitacoesPanel";
import { FeriasConfigCard } from "@/components/dp/ferias/FeriasConfigCard";
import { FeriasContabilidadePanel } from "@/components/dp/ferias/FeriasContabilidadePanel";
import { FeriasCalendarioPanel } from "@/components/dp/ferias/FeriasCalendarioPanel";
import { useDpFerias } from "@/hooks/useDpFerias";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";

const PlanejamentoPanel = lazy(() => import("./DpFerias"));

const ABAS = [
  "planejamento",
  "solicitacoes",
  "programadas",
  "em-ferias",
  "calendario",
  "contabilidade",
  "historico",
  "regras",
] as const;
type Aba = (typeof ABAS)[number];

function PanelFallback() {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}

export default function DpFeriasHub() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("aba");
  const aba: Aba = (ABAS as readonly string[]).includes(raw ?? "") ? (raw as Aba) : "planejamento";

  const { periodos, gozos } = useDpFerias("todos");
  const { data: colaboradores = [] } = useDpColaboradores();

  const detalhePorColaborador = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of colaboradores as any[]) {
      const partes = [c.cargo_nome, c.setor_nome].filter(Boolean);
      if (partes.length) map.set(c.id, partes.join(" · "));
    }
    return map;
  }, [colaboradores]);

  const setAba = (value: string) => {
    const next = new URLSearchParams(params);
    next.set("aba", value);
    next.delete("periodo");
    setParams(next, { replace: true });
  };

  return (
    <DpPage>
      <Helmet><title>Férias — Pessoas 360°</title></Helmet>

      <DpPageHeader
        icon={Palmtree}
        title="Férias"
        description="Planejamento, aprovação e acompanhamento das férias da equipe."
      />

      <FeriasDashboard
        periodos={periodos}
        gozos={gozos}
        descricaoColaborador={(id) => detalhePorColaborador.get(id) ?? null}
      />

      <Tabs value={aba} onValueChange={setAba} className="space-y-4">
        <DpTabsBar>
          <TabsTrigger value="planejamento">Planejamento</TabsTrigger>
          <TabsTrigger value="solicitacoes">Solicitações</TabsTrigger>
          <TabsTrigger value="programadas">Programadas</TabsTrigger>
          <TabsTrigger value="em-ferias">Em férias</TabsTrigger>
          <TabsTrigger value="calendario">Calendário</TabsTrigger>
          <TabsTrigger value="contabilidade">Contabilidade</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          <TabsTrigger value="regras">Regras</TabsTrigger>
        </DpTabsBar>

        <TabsContent value="planejamento" className="m-0">
          {aba === "planejamento" && (
            <DpEmbeddedProvider>
              <Suspense fallback={<PanelFallback />}>
                <PlanejamentoPanel />
              </Suspense>
            </DpEmbeddedProvider>
          )}
        </TabsContent>

        <TabsContent value="solicitacoes" className="m-0">
          {aba === "solicitacoes" && (
            <DpEmbeddedProvider>
              <FeriasSolicitacoesPanel />
            </DpEmbeddedProvider>
          )}
        </TabsContent>

        <TabsContent value="programadas" className="m-0">
          {aba === "programadas" && (
            <DpEmbeddedProvider>
              <FeriasGozosPanel
                status={["planejado", "aprovado"]}
                vazio="Nenhuma férias programada."
              />
            </DpEmbeddedProvider>
          )}
        </TabsContent>

        <TabsContent value="em-ferias" className="m-0">
          {aba === "em-ferias" && (
            <DpEmbeddedProvider>
              <FeriasGozosPanel status={["em_gozo"]} vazio="Ninguém em férias hoje." />
            </DpEmbeddedProvider>
          )}
        </TabsContent>

        <TabsContent value="calendario" className="m-0">
          {aba === "calendario" && (
            <DpEmbeddedProvider>
              <FeriasCalendarioPanel />
            </DpEmbeddedProvider>
          )}
        </TabsContent>

        <TabsContent value="contabilidade" className="m-0">
          {aba === "contabilidade" && (
            <DpEmbeddedProvider>
              <FeriasContabilidadePanel />
            </DpEmbeddedProvider>
          )}
        </TabsContent>

        <TabsContent value="historico" className="m-0">
          {aba === "historico" && (
            <DpEmbeddedProvider>
              <FeriasGozosPanel
                status={["concluido", "cancelado"]}
                vazio="Nenhum período de férias concluído ou cancelado."
              />
            </DpEmbeddedProvider>
          )}
        </TabsContent>

        <TabsContent value="regras" className="m-0 space-y-6">
          {aba === "regras" && (
            <DpEmbeddedProvider>
              <FeriasConfigCard />
              <FeriasRegrasSection />
            </DpEmbeddedProvider>
          )}
        </TabsContent>
      </Tabs>
    </DpPage>
  );
}
