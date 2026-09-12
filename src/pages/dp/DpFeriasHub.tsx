import { Suspense, lazy, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { useSearchParams } from "react-router-dom";
import { Palmtree, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DpPage, DpPageHeader, DpEmbeddedProvider } from "@/components/dp/DpPage";
import { DpTabsBar } from "@/components/dp/DpTabsBar";
import { FeriasRegrasSection } from "@/components/dp/ferias/FeriasRegrasSection";
import { FeriasDashboard } from "@/components/dp/ferias/FeriasDashboard";
import { FeriasGozosPanel } from "@/components/dp/ferias/FeriasGozosPanel";
import { FeriasSolicitacoesPanel } from "@/components/dp/ferias/FeriasSolicitacoesPanel";
import { FeriasConfigCard } from "@/components/dp/ferias/FeriasConfigCard";
import { FeriasContabilidadePanel } from "@/components/dp/ferias/FeriasContabilidadePanel";
import { FeriasCalendarioPanel } from "@/components/dp/ferias/FeriasCalendarioPanel";
import { FeriasProgramacaoPanel } from "@/components/dp/ferias/FeriasProgramacaoPanel";
import { useDpFerias } from "@/hooks/useDpFerias";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";

const PlanejamentoPanel = lazy(() => import("./DpFerias"));

const ABAS = ["ferias", "status", "calendario", "contabilidade", "regras"] as const;
type Aba = (typeof ABAS)[number];

const VISOES = ["analitica", "sintetica"] as const;
type Visao = (typeof VISOES)[number];

const STATUS = ["solicitadas", "programadas", "em-ferias", "historico"] as const;
type StatusVisao = (typeof STATUS)[number];

/** Links antigos continuam funcionando: cada aba antiga aponta para a nova estrutura. */
const LEGADO: Record<string, { aba: Aba; visao?: Visao; status?: StatusVisao }> = {
  planejamento: { aba: "ferias", visao: "analitica" },
  programacao: { aba: "ferias", visao: "sintetica" },
  solicitacoes: { aba: "status", status: "solicitadas" },
  programadas: { aba: "status", status: "programadas" },
  "em-ferias": { aba: "status", status: "em-ferias" },
  historico: { aba: "status", status: "historico" },
};

const STATUS_LABEL: Record<StatusVisao, string> = {
  solicitadas: "Solicitadas",
  programadas: "Programadas",
  "em-ferias": "Em férias",
  historico: "Histórico",
};

function PanelFallback() {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}

export default function DpFeriasHub() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("aba") ?? "";
  const legado = LEGADO[raw];
  const aba: Aba = (ABAS as readonly string[]).includes(raw)
    ? (raw as Aba)
    : (legado?.aba ?? "ferias");

  const rawVisao = params.get("visao") ?? "";
  const visao: Visao = (VISOES as readonly string[]).includes(rawVisao)
    ? (rawVisao as Visao)
    : (legado?.visao ?? "analitica");

  const rawStatus = params.get("status") ?? "";
  const statusVisao: StatusVisao = (STATUS as readonly string[]).includes(rawStatus)
    ? (rawStatus as StatusVisao)
    : (legado?.status ?? "solicitadas");

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

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    if (key === "aba") next.delete("periodo");
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

      <Tabs value={aba} onValueChange={(v) => setParam("aba", v)} className="space-y-4">
        <DpTabsBar
          sections={ABAS.map((a) => ({
            value: a,
            label:
              a === "ferias" ? "Férias"
              : a === "status" ? "Status"
              : a === "calendario" ? "Calendário"
              : a === "contabilidade" ? "Contabilidade"
              : "Regras",
          }))}
          value={aba}
          onValueChange={(v) => setParam("aba", v)}
          sectionTitle="Seções de Férias"
        >
          <TabsTrigger value="ferias">Férias</TabsTrigger>
          <TabsTrigger value="status">Status</TabsTrigger>
          <TabsTrigger value="calendario">Calendário</TabsTrigger>
          <TabsTrigger value="contabilidade">Contabilidade</TabsTrigger>
          <TabsTrigger value="regras">Regras</TabsTrigger>
        </DpTabsBar>

        <TabsContent value="ferias" className="m-0 space-y-4">
          {aba === "ferias" && (
            <DpEmbeddedProvider>
              <div className="flex flex-wrap items-center gap-2">
                <ToggleGroup
                  type="single"
                  value={visao}
                  onValueChange={(v) => v && setParam("visao", v)}
                  className="rounded-full border bg-muted/40 p-1"
                >
                  <ToggleGroupItem value="analitica" className="rounded-full px-4 text-xs">
                    Analítica
                  </ToggleGroupItem>
                  <ToggleGroupItem value="sintetica" className="rounded-full px-4 text-xs">
                    Sintética
                  </ToggleGroupItem>
                </ToggleGroup>
                <span className="text-xs text-muted-foreground">
                  {visao === "analitica"
                    ? "Cartões por período aquisitivo, com saldo e programação."
                    : "Relatório no formato da contabilidade, para imprimir ou exportar."}
                </span>
              </div>

              {visao === "analitica" ? (
                <Suspense fallback={<PanelFallback />}>
                  <PlanejamentoPanel />
                </Suspense>
              ) : (
                <FeriasProgramacaoPanel />
              )}
            </DpEmbeddedProvider>
          )}
        </TabsContent>

        <TabsContent value="status" className="m-0 space-y-4">
          {aba === "status" && (
            <DpEmbeddedProvider>
              <ToggleGroup
                type="single"
                value={statusVisao}
                onValueChange={(v) => v && setParam("status", v)}
                className="flex-wrap justify-start rounded-full border bg-muted/40 p-1"
              >
                {STATUS.map((s) => (
                  <ToggleGroupItem key={s} value={s} className="rounded-full px-4 text-xs">
                    {STATUS_LABEL[s]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>

              {statusVisao === "solicitadas" && <FeriasSolicitacoesPanel />}
              {statusVisao === "programadas" && (
                <FeriasGozosPanel
                  status={["planejado", "aprovado"]}
                  vazio="Nenhuma férias programada."
                />
              )}
              {statusVisao === "em-ferias" && (
                <FeriasGozosPanel status={["em_gozo"]} vazio="Ninguém em férias hoje." />
              )}
              {statusVisao === "historico" && (
                <FeriasGozosPanel
                  status={["concluido", "cancelado"]}
                  vazio="Nenhum período de férias concluído ou cancelado."
                />
              )}
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
