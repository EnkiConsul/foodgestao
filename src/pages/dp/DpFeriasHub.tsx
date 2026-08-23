import { Suspense, lazy } from "react";
import { Helmet } from "react-helmet-async";
import { useSearchParams } from "react-router-dom";
import { Palmtree, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs";
import { DpPage, DpPageHeader, DpEmbeddedProvider } from "@/components/dp/DpPage";
import { DpTabsBar } from "@/components/dp/DpTabsBar";
import { FeriasRegrasSection } from "@/components/dp/ferias/FeriasRegrasSection";

const PeriodosPanel = lazy(() => import("./DpFerias"));

const ABAS = ["periodos", "regras"] as const;
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
  const aba: Aba = (ABAS as readonly string[]).includes(raw ?? "") ? (raw as Aba) : "periodos";

  const setAba = (value: string) => {
    const next = new URLSearchParams(params);
    next.set("aba", value);
    setParams(next, { replace: true });
  };

  return (
    <DpPage>
      <Helmet><title>Férias — Pessoas 360°</title></Helmet>

      <DpPageHeader
        icon={Palmtree}
        title="Férias"
        description="Períodos aquisitivos, agendamento de férias e regras de concessão."
      />

      <Tabs value={aba} onValueChange={setAba} className="space-y-4">
        <DpTabsBar>
          <TabsTrigger value="periodos">Períodos</TabsTrigger>
          <TabsTrigger value="regras">Regras</TabsTrigger>
        </DpTabsBar>

        <TabsContent value="periodos" className="m-0">
          {aba === "periodos" && (
            <DpEmbeddedProvider>
              <Suspense fallback={<PanelFallback />}>
                <PeriodosPanel />
              </Suspense>
            </DpEmbeddedProvider>
          )}
        </TabsContent>

        <TabsContent value="regras" className="m-0 space-y-6">
          {aba === "regras" && (
            <DpEmbeddedProvider>
              <FeriasRegrasSection />
            </DpEmbeddedProvider>
          )}
        </TabsContent>
      </Tabs>
    </DpPage>
  );
}
