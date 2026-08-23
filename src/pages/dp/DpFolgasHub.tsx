import { Suspense, lazy } from "react";
import { Helmet } from "react-helmet-async";
import { useSearchParams } from "react-router-dom";
import { Calendar, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs";
import { DpPage, DpPageHeader, DpEmbeddedProvider } from "@/components/dp/DpPage";
import { DpTabsBar } from "@/components/dp/DpTabsBar";
import { Separator } from "@/components/ui/separator";
import { RegrasHistoricoPanel } from "@/components/dp/regras/RegrasHistoricoPanel";

const CalendarioPanel = lazy(() => import("./DpFolgas"));
const RegrasPanel = lazy(() => import("./cadastros/DpConfiguracoesJornada"));
const BloqueiosPanel = lazy(() => import("./DpBloqueios"));
const SolicitacoesPanel = lazy(() => import("./DpSolicitacoes"));
const TrocasPanel = lazy(() => import("./DpTrocas"));
const ConformidadePanel = lazy(() => import("./DpConformidadeDsr"));

const ABAS = ["calendario", "regras", "solicitacoes", "trocas", "conformidade"] as const;
type Aba = (typeof ABAS)[number];

function PanelFallback() {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}

function Embedded({ children }: { children: React.ReactNode }) {
  return (
    <DpEmbeddedProvider>
      <Suspense fallback={<PanelFallback />}>{children}</Suspense>
    </DpEmbeddedProvider>
  );
}

export default function DpFolgasHub() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("aba");
  const aba: Aba = (ABAS as readonly string[]).includes(raw ?? "") ? (raw as Aba) : "calendario";

  const setAba = (value: string) => {
    const next = new URLSearchParams(params);
    next.set("aba", value);
    setParams(next, { replace: true });
  };

  return (
    <DpPage>
      <Helmet><title>Folgas — Pessoas 360°</title></Helmet>

      <DpPageHeader
        icon={Calendar}
        title="Folgas"
        description="Calendário de folgas, regras e datas bloqueadas, solicitações, trocas e conformidade de DSR."
      />

      <Tabs value={aba} onValueChange={setAba} className="space-y-4">
        <DpTabsBar>
          <TabsTrigger value="calendario">Calendário</TabsTrigger>
          <TabsTrigger value="regras">Regras</TabsTrigger>
          <TabsTrigger value="solicitacoes">Solicitações</TabsTrigger>
          <TabsTrigger value="trocas">Trocas</TabsTrigger>
          <TabsTrigger value="conformidade">Conformidade</TabsTrigger>
        </DpTabsBar>

        <TabsContent value="calendario" className="m-0">
          {aba === "calendario" && (
            <Embedded>
              <CalendarioPanel />
            </Embedded>
          )}
        </TabsContent>

        <TabsContent value="regras" className="m-0 space-y-6">
          {aba === "regras" && (
            <Embedded>
              <RegrasPanel />
              <Separator />
              <BloqueiosPanel />
              <Separator />
              <RegrasHistoricoPanel />
            </Embedded>
          )}
        </TabsContent>

        <TabsContent value="solicitacoes" className="m-0">
          {aba === "solicitacoes" && (
            <Embedded>
              <SolicitacoesPanel />
            </Embedded>
          )}
        </TabsContent>

        <TabsContent value="trocas" className="m-0">
          {aba === "trocas" && (
            <Embedded>
              <TrocasPanel />
            </Embedded>
          )}
        </TabsContent>

        <TabsContent value="conformidade" className="m-0">
          {aba === "conformidade" && (
            <Embedded>
              <ConformidadePanel />
            </Embedded>
          )}
        </TabsContent>
      </Tabs>
    </DpPage>
  );
}
