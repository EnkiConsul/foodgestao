import { Link, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDRESnapshots } from "@/hooks/useDRE";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatValor, formatPct, nivelIndent, isSubtotal, isCabecalho, computeSubtotal, type DREGenerated } from "@/lib/dre";
import { Helmet } from "react-helmet-async";

export default function DREHistorico() {
  const { id } = useParams<{ id?: string }>();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const { data: snapshots = [] } = useDRESnapshots();

  const { data: detail } = useQuery({
    queryKey: ["dre-snapshot", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("dre_snapshots").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (contextType !== "pj" || !selectedCompanyId) {
    return (
      <div className="p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Selecione uma empresa</AlertTitle>
          <AlertDescription>Este módulo é exclusivo do contexto empresarial.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (id && detail) {
    const dre = detail.dados_json as unknown as DREGenerated;
    return (
      <div className="p-6 space-y-6">
        <Helmet><title>{detail.titulo} | Gestor Plin</title></Helmet>
        <div>
          <Link to="/relatorios/dre/historico" className="text-sm text-muted-foreground hover:underline flex items-center gap-1 mb-1">
            <ArrowLeft className="h-3 w-3" /> Voltar
          </Link>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            {detail.titulo}
            <Badge variant={detail.status === "publicado" ? "default" : "secondary"}>{detail.status}</Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            {detail.periodo_inicio} a {detail.periodo_fim} · Regime {detail.regime}
          </p>
        </div>

        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-2">Descrição</th>
                  <th className="text-right px-4 py-2 w-40">Valor</th>
                  <th className="text-right px-4 py-2 w-32">% Rec. Líquida</th>
                </tr>
              </thead>
              <tbody>
                {dre.rubricas.map((r) => {
                  const level = nivelIndent(r.codigo);
                  const sub = isSubtotal(r.codigo);
                  const cab = isCabecalho(r.codigo);
                  const valor = r.is_calculada ? computeSubtotal(r.codigo, dre.totais) : r.valor;
                  const isDeducao = r.natureza === "devedora" && !sub;
                  const display = isDeducao ? -Math.abs(valor) : valor;
                  const pctBase = dre.totais.receita_liquida ?? 0;
                  const pct = pctBase > 0 ? (display / pctBase) * 100 : 0;
                  return (
                    <tr key={r.rubrica_id} className={`border-b last:border-0 ${sub ? "bg-primary/5 font-semibold" : cab ? "bg-muted/30 font-medium" : ""}`}>
                      <td className="px-4 py-2" style={{ paddingLeft: `${16 + level * 20}px` }}>{r.nome}</td>
                      <td className={`px-4 py-2 text-right tabular-nums ${display < 0 ? "text-destructive" : display > 0 ? "text-success" : "text-muted-foreground"}`}>
                        {formatValor(display, { showNegativeParens: true })}
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-muted-foreground tabular-nums">
                        {pctBase > 0 && !cab ? formatPct(pct) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <Helmet><title>Histórico DRE | Gestor Plin</title></Helmet>
      <div>
        <Link to="/relatorios/dre" className="text-sm text-muted-foreground hover:underline flex items-center gap-1 mb-1">
          <ArrowLeft className="h-3 w-3" /> Voltar
        </Link>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="text-2xl font-semibold">Histórico de DREs</h1>
          <Link to="/relatorios/dre/comparativo" className="text-sm text-primary hover:underline">Comparar snapshots →</Link>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Snapshots salvos</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-2">Título</th>
                <th className="text-left px-4 py-2">Período</th>
                <th className="text-left px-4 py-2 w-24">Status</th>
                <th className="text-right px-4 py-2 w-40">Lucro Líquido</th>
                <th className="text-left px-4 py-2 w-40">Gerado em</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => (
                <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2">
                    <Link to={`/relatorios/dre/historico/${s.id}`} className="text-primary hover:underline">
                      {s.titulo}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{s.periodo_inicio} → {s.periodo_fim}</td>
                  <td className="px-4 py-2"><Badge variant={s.status === "publicado" ? "default" : "secondary"}>{s.status}</Badge></td>
                  <td className={`px-4 py-2 text-right tabular-nums ${(s.lucro_liquido ?? 0) < 0 ? "text-destructive" : "text-success"}`}>
                    {formatValor(s.lucro_liquido, { showNegativeParens: true })}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{new Date(s.gerado_em).toLocaleString("pt-BR")}</td>
                </tr>
              ))}
              {snapshots.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Nenhum snapshot publicado ainda.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
