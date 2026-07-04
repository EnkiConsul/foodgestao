import { useMemo, useState } from "react";
import { Navigate, Link, useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { AlertCircle, ArrowRight, FileText, Save, Search, Settings2, Sparkles, TrendingDown, TrendingUp, X } from "lucide-react";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDREGeneration, useDREConsistency, useDRESnapshots, useDRERealtime } from "@/hooks/useDRE";
import { useCompanyPermissions } from "@/hooks/useCompanyPermissions";
import { formatValor, formatPct, nivelIndent, isSubtotal, isCabecalho, computeSubtotal, periodoFromTipo, type DRERegime, type DRETipoPeriodo } from "@/lib/dre";
import { toast } from "sonner";
import { Helmet } from "react-helmet-async";

export default function DREPage() {
  const { contextType, selectedCompanyId } = useCompanyContext();
  const { role } = useCompanyPermissions();
  const canPublish = role === "owner" || role === "admin";

  const [tipoPeriodo, setTipoPeriodo] = useState<DRETipoPeriodo>("mensal");
  const initial = periodoFromTipo("mensal");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [regime, setRegime] = useState<DRERegime>("caixa");
  const [rubricaQuery, setRubricaQuery] = useState("");
  const normalizedRubricaQuery = rubricaQuery.trim().toLowerCase();

  const changeTipo = (t: DRETipoPeriodo) => {
    setTipoPeriodo(t);
    if (t !== "personalizado") {
      const p = periodoFromTipo(t);
      setFrom(p.from); setTo(p.to);
    }
  };

  const { data: dre, isLoading } = useDREGeneration({ from, to, regime });
  const { data: inconsistencias } = useDREConsistency({ from, to });
  const { publish } = useDRESnapshots();
  useDRERealtime();

  const totais = dre?.totais;

  const linhas = useMemo(() => {
    if (!dre?.rubricas) return [];
    return dre.rubricas.map((r) => ({
      ...r,
      valorFinal: r.is_calculada ? computeSubtotal(r.codigo, dre.totais) : r.valor,
    }));
  }, [dre]);

  if (contextType !== "pj" || !selectedCompanyId) {
    return (
      <div className="p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Selecione um perfil empresarial</AlertTitle>
          <AlertDescription>
            O módulo DRE está disponível apenas no contexto <strong>Empresarial (PJ)</strong>. Selecione uma empresa no topo da tela.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const handlePublish = async (publicar: boolean) => {
    try {
      const titulo = `DRE ${from} a ${to}`;
      await publish.mutateAsync({ titulo, from, to, tipo_periodo: tipoPeriodo, regime, publicar });
      toast.success(publicar ? "DRE publicada" : "Rascunho salvo");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar snapshot");
    }
  };

  const lucroNegativo = (totais?.lucro_liquido ?? 0) < 0;

  return (
    <div className="p-6 space-y-6">
      <Helmet>
        <title>DRE Contábil | Gestor Plin</title>
        <meta name="description" content="Demonstração do Resultado do Exercício em tempo real, seguindo Lei 6.404/76 e ITG 1000." />
      </Helmet>

      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" aria-hidden="true" />
            Demonstração do Resultado do Exercício
          </span>
        }
        description="Estrutura normativa ITG 1000 / Lei 6.404/76 / CPC 26 (R1)"
        actions={
          canPublish ? (
            <>
              <Button variant="outline" size="sm" onClick={() => handlePublish(false)} disabled={publish.isPending}>
                <Save className="h-4 w-4 mr-1.5" aria-hidden="true" />Rascunho
              </Button>
              <Button size="sm" onClick={() => handlePublish(true)} disabled={publish.isPending}>
                <ArrowRight className="h-4 w-4 mr-1.5" aria-hidden="true" />Publicar DRE
              </Button>
            </>
          ) : null
        }
      />

      {/* Sub-navegação */}
      <DRESubNav />

      {/* Filtros — parâmetros do relatório */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">Parâmetros</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dre-tipo">Período</Label>
              <Select value={tipoPeriodo} onValueChange={(v) => changeTipo(v as DRETipoPeriodo)}>
                <SelectTrigger id="dre-tipo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensal">Mensal</SelectItem>
                  <SelectItem value="trimestral">Trimestral</SelectItem>
                  <SelectItem value="semestral">Semestral</SelectItem>
                  <SelectItem value="anual">Anual</SelectItem>
                  <SelectItem value="personalizado">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dre-regime">Regime</Label>
              <Select value={regime} onValueChange={(v) => setRegime(v as DRERegime)}>
                <SelectTrigger id="dre-regime"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="caixa">Caixa (data de pagamento)</SelectItem>
                  <SelectItem value="competencia">Competência (vencimento)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dre-from">De</Label>
              <Input id="dre-from" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setTipoPeriodo("personalizado"); }} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dre-to">Até</Label>
              <Input id="dre-to" type="date" value={to} onChange={(e) => { setTo(e.target.value); setTipoPeriodo("personalizado"); }} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Aviso de mapeamento */}
      {inconsistencias && inconsistencias.length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{inconsistencias.length} categoria(s) sem rubrica DRE</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-2 flex-wrap">
            <span>Lançamentos dessas categorias no período não aparecem na DRE.</span>
            <Button asChild variant="link" size="sm">
              <Link to="/relatorios/dre/configuracao">Configurar agora</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Indicadores */}
      {totais && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <IndicadorCard label="Margem Bruta" value={formatPct(totais.margem_bruta_pct)} tone="neutral" />
          <IndicadorCard label="Margem Operacional (EBIT)" value={formatPct(totais.margem_operacional_pct)} tone={totais.ebit >= 0 ? "positive" : "negative"} />
          <IndicadorCard label="Margem Líquida" value={formatPct(totais.margem_liquida_pct)} tone={totais.lucro_liquido >= 0 ? "positive" : "negative"} />
          <IndicadorCard label="Lucro Líquido" value={formatValor(totais.lucro_liquido, { showNegativeParens: true })} tone={lucroNegativo ? "negative" : "positive"} sub={lucroNegativo ? "PREJUÍZO DO EXERCÍCIO" : undefined} />
        </div>
      )}

      {/* Relatório */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            Relatório
          </CardTitle>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" aria-hidden="true" />
            <Input
              value={rubricaQuery}
              onChange={(e) => setRubricaQuery(e.target.value)}
              placeholder="Buscar rubrica ou código..."
              className="h-9 pl-8 pr-8"
              aria-label="Buscar rubrica"
            />
            {rubricaQuery && (
              <button
                type="button"
                onClick={() => setRubricaQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Limpar busca"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-6" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Descrição</th>
                    <th className="text-right px-4 py-2 font-medium w-40">Valor</th>
                    <th className="text-right px-4 py-2 font-medium w-32">% Rec. Líquida</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas
                    .filter((l) => {
                      if (!normalizedRubricaQuery) return true;
                      // Mantém cabeçalhos e subtotais sempre visíveis para preservar leitura
                      if (isSubtotal(l.codigo) || isCabecalho(l.codigo)) return true;
                      return (
                        l.nome.toLowerCase().includes(normalizedRubricaQuery) ||
                        l.codigo.toLowerCase().includes(normalizedRubricaQuery)
                      );
                    })
                    .map((l) => {
                    const level = nivelIndent(l.codigo);
                    const sub = isSubtotal(l.codigo);
                    const cab = isCabecalho(l.codigo);
                    const valor = l.valorFinal;
                    const isDeducao = l.natureza === "devedora" && !sub;
                    const displayValor = isDeducao ? -Math.abs(valor) : valor;
                    const pctBase = totais?.receita_liquida ?? 0;
                    const pct = pctBase > 0 ? (displayValor / pctBase) * 100 : 0;
                    return (
                      <tr
                        key={l.rubrica_id}
                        className={`border-b last:border-0 ${sub ? "bg-primary/5 font-semibold" : cab ? "bg-muted/30 font-medium" : ""}`}
                      >
                        <td className="px-4 py-2" style={{ paddingLeft: `${16 + level * 20}px` }}>
                          <span className="flex items-center gap-2">
                            {!sub && !cab && <span className="text-xs text-muted-foreground w-12">{l.codigo}</span>}
                            <span>{l.nome}</span>
                            {l.qt_ajustes > 0 && <Badge variant="outline" className="text-[10px]">ajustes {l.qt_ajustes}</Badge>}
                          </span>
                        </td>
                        <td className={`px-4 py-2 text-right tabular-nums ${displayValor < 0 ? "text-destructive" : displayValor > 0 ? "text-success" : "text-muted-foreground"}`}>
                          {formatValor(displayValor, { showNegativeParens: true })}
                        </td>
                        <td className="px-4 py-2 text-right text-xs text-muted-foreground tabular-nums">
                          {pctBase > 0 && !cab ? formatPct(pct) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function IndicadorCard({ label, value, tone, sub }: { label: string; value: string; tone: "positive" | "negative" | "neutral"; sub?: string }) {
  const color = tone === "positive" ? "text-emerald-600 dark:text-emerald-400" : tone === "negative" ? "text-destructive" : "text-foreground";
  const Icon = tone === "negative" ? TrendingDown : TrendingUp;
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <div className="flex items-center gap-2 mt-1">
          <Icon className={`h-4 w-4 ${color}`} />
          <p className={`text-2xl font-semibold ${color}`}>{value}</p>
        </div>
        {sub && <p className="text-[10px] font-semibold text-destructive mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}
