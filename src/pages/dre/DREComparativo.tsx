import { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { AlertCircle, ArrowRight, GitCompare, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDRESnapshots } from "@/hooks/useDRE";
import { DRESubNav } from "./DRESubNav";
import {
  formatValor,
  formatPct,
  nivelIndent,
  isSubtotal,
  isCabecalho,
  computeSubtotal,
  type DREGenerated,
  type DRERubricaLinha,
} from "@/lib/dre";

type Snap = {
  id: string;
  titulo: string;
  periodo_inicio: string;
  periodo_fim: string;
  regime: string;
  status: string;
  dados_json: unknown;
};

interface LinhaComp {
  rubrica_id: string;
  codigo: string;
  nome: string;
  natureza: "credora" | "devedora";
  is_calculada: boolean;
  ordem: number;
  valorA: number;
  valorB: number;
  delta: number;
  deltaPct: number | null;
}

function valorRubrica(r: DRERubricaLinha, dre: DREGenerated): number {
  const v = r.is_calculada ? computeSubtotal(r.codigo, dre.totais) : r.valor;
  return r.natureza === "devedora" && !isSubtotal(r.codigo) ? -Math.abs(v) : v;
}

function buildLinhas(a: DREGenerated, b: DREGenerated): LinhaComp[] {
  const map = new Map<string, LinhaComp>();
  const push = (r: DRERubricaLinha, dre: DREGenerated, side: "A" | "B") => {
    const key = r.rubrica_id;
    const val = valorRubrica(r, dre);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        rubrica_id: r.rubrica_id,
        codigo: r.codigo,
        nome: r.nome,
        natureza: r.natureza,
        is_calculada: r.is_calculada,
        ordem: r.ordem,
        valorA: side === "A" ? val : 0,
        valorB: side === "B" ? val : 0,
        delta: 0,
        deltaPct: null,
      });
    } else if (side === "A") existing.valorA = val;
    else existing.valorB = val;
  };
  a.rubricas.forEach((r) => push(r, a, "A"));
  b.rubricas.forEach((r) => push(r, b, "B"));
  const linhas = Array.from(map.values()).sort((x, y) => x.ordem - y.ordem);
  linhas.forEach((l) => {
    l.delta = l.valorB - l.valorA;
    l.deltaPct = l.valorA !== 0 ? (l.delta / Math.abs(l.valorA)) * 100 : l.valorB !== 0 ? null : 0;
  });
  return linhas;
}

export default function DREComparativo() {
  const { contextType, selectedCompanyId } = useCompanyContext();
  const { data: snapshots = [] } = useDRESnapshots();

  const publicados = useMemo(
    () => (snapshots as Snap[]).filter((s) => s.status === "publicado" || s.status === "auditado"),
    [snapshots],
  );

  const [idA, setIdA] = useState<string | undefined>();
  const [idB, setIdB] = useState<string | undefined>();

  useEffect(() => {
    if (publicados.length >= 2 && !idA && !idB) {
      setIdA(publicados[1].id);
      setIdB(publicados[0].id);
    }
  }, [publicados, idA, idB]);

  const snapA = publicados.find((s) => s.id === idA);
  const snapB = publicados.find((s) => s.id === idB);
  const dreA = snapA?.dados_json as DREGenerated | undefined;
  const dreB = snapB?.dados_json as DREGenerated | undefined;

  const linhas = useMemo(() => (dreA && dreB ? buildLinhas(dreA, dreB) : []), [dreA, dreB]);

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

  const KPIs: Array<{ label: string; getA: (t: DREGenerated) => number; getB: (t: DREGenerated) => number; isPct?: boolean }> = [
    { label: "Receita Líquida", getA: (d) => d.totais.receita_liquida, getB: (d) => d.totais.receita_liquida },
    { label: "Lucro Bruto", getA: (d) => d.totais.lucro_bruto, getB: (d) => d.totais.lucro_bruto },
    { label: "EBIT", getA: (d) => d.totais.ebit, getB: (d) => d.totais.ebit },
    { label: "Lucro Líquido", getA: (d) => d.totais.lucro_liquido, getB: (d) => d.totais.lucro_liquido },
    { label: "Margem Bruta", getA: (d) => d.totais.margem_bruta_pct, getB: (d) => d.totais.margem_bruta_pct, isPct: true },
    { label: "Margem Operacional", getA: (d) => d.totais.margem_operacional_pct, getB: (d) => d.totais.margem_operacional_pct, isPct: true },
    { label: "Margem Líquida", getA: (d) => d.totais.margem_liquida_pct, getB: (d) => d.totais.margem_liquida_pct, isPct: true },
  ];

  return (
    <div className="p-6 space-y-6">
      <Helmet><title>Comparativo DRE | Gestor Plin</title></Helmet>

      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <GitCompare className="h-6 w-6 text-primary" aria-hidden="true" />
            Comparativo entre DREs
          </span>
        }
        description="Selecione um período base (A) e um período de comparação (B). Variações são calculadas como B − A."
      />

      <DRESubNav />

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Período Base (A)</Label>
              <Select value={idA} onValueChange={setIdA}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {publicados.map((s) => (
                    <SelectItem key={s.id} value={s.id} disabled={s.id === idB}>
                      {s.titulo} · {s.periodo_inicio} → {s.periodo_fim} ({s.regime})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Período Comparação (B)</Label>
              <Select value={idB} onValueChange={setIdB}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {publicados.map((s) => (
                    <SelectItem key={s.id} value={s.id} disabled={s.id === idA}>
                      {s.titulo} · {s.periodo_inicio} → {s.periodo_fim} ({s.regime})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {publicados.length < 2 && (
            <Alert className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>São necessários ao menos 2 snapshots publicados</AlertTitle>
              <AlertDescription>
                Publique DREs em <Link to="/relatorios/dre" className="text-primary underline">Relatórios → DRE</Link> para habilitar o comparativo.
              </AlertDescription>
            </Alert>
          )}

          {snapA && snapB && snapA.regime !== snapB.regime && (
            <Alert className="mt-4" variant="default">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Regimes diferentes</AlertTitle>
              <AlertDescription>
                A está em <strong>{snapA.regime}</strong> e B em <strong>{snapB.regime}</strong>. Use com cautela — os critérios de reconhecimento diferem.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {dreA && dreB && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {KPIs.map((k) => {
              const a = k.getA(dreA);
              const b = k.getB(dreB);
              const delta = b - a;
              const pct = a !== 0 ? (delta / Math.abs(a)) * 100 : null;
              return (
                <Card key={k.label}>
                  <CardContent className="pt-5 pb-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">{k.label}</p>
                    <div className="mt-1 flex items-baseline gap-2">
                      <p className="text-lg font-semibold tabular-nums">
                        {k.isPct ? formatPct(b) : formatValor(b, { showNegativeParens: true })}
                      </p>
                      <DeltaBadge delta={delta} pct={pct} isPct={k.isPct} />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                      A: {k.isPct ? formatPct(a) : formatValor(a, { showNegativeParens: true })}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-primary" />
                Linha a linha
              </CardTitle>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                <Badge variant="outline">A: {snapA?.titulo}</Badge>
                <Badge variant="outline">B: {snapB?.titulo}</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Descrição</th>
                      <th className="text-right px-4 py-2 font-medium w-36">Valor A</th>
                      <th className="text-right px-4 py-2 font-medium w-36">Valor B</th>
                      <th className="text-right px-4 py-2 font-medium w-36">Δ Absoluto</th>
                      <th className="text-right px-4 py-2 font-medium w-28">Δ %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l) => {
                      const level = nivelIndent(l.codigo);
                      const sub = isSubtotal(l.codigo);
                      const cab = isCabecalho(l.codigo);
                      return (
                        <tr
                          key={l.rubrica_id}
                          className={`border-b last:border-0 ${sub ? "bg-primary/5 font-semibold" : cab ? "bg-muted/30 font-medium" : ""}`}
                        >
                          <td className="px-4 py-2" style={{ paddingLeft: `${16 + level * 20}px` }}>
                            <span className="flex items-center gap-2">
                              {!sub && !cab && <span className="text-xs text-muted-foreground w-12">{l.codigo}</span>}
                              <span>{l.nome}</span>
                            </span>
                          </td>
                          <td className={`px-4 py-2 text-right tabular-nums ${valorTone(l.valorA)}`}>
                            {formatValor(l.valorA, { showNegativeParens: true })}
                          </td>
                          <td className={`px-4 py-2 text-right tabular-nums ${valorTone(l.valorB)}`}>
                            {formatValor(l.valorB, { showNegativeParens: true })}
                          </td>
                          <td className={`px-4 py-2 text-right tabular-nums ${deltaTone(l.delta, l.natureza)}`}>
                            {l.delta === 0 ? "—" : formatValor(l.delta, { showNegativeParens: true })}
                          </td>
                          <td className={`px-4 py-2 text-right text-xs tabular-nums ${deltaTone(l.delta, l.natureza)}`}>
                            {l.deltaPct === null ? "—" : formatPct(l.deltaPct)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function valorTone(v: number): string {
  if (v > 0) return "text-success";
  if (v < 0) return "text-destructive";
  return "text-muted-foreground";
}

// Para contas devedoras (despesas), aumento (delta > 0 no valor negativo significa ficou "menos negativo" = melhor)
// Simplificação: aplicar sinal do delta puro para receitas; para despesas, favorável se |B| < |A|
function deltaTone(delta: number, natureza: "credora" | "devedora"): string {
  if (delta === 0) return "text-muted-foreground";
  const favoravel = natureza === "credora" ? delta > 0 : delta > 0; // delta em valor com sinal já invertido (despesas são negativas), então crescer = bom
  return favoravel ? "text-success" : "text-destructive";
}

function DeltaBadge({ delta, pct, isPct }: { delta: number; pct: number | null; isPct?: boolean }) {
  if (delta === 0) return <Badge variant="outline" className="gap-1"><Minus className="h-3 w-3" />0</Badge>;
  const up = delta > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  const cls = up ? "text-success border-success/30 bg-success/10"
                 : "text-destructive border-destructive/30 bg-destructive/10";
  const label = isPct
    ? `${up ? "+" : ""}${delta.toFixed(1).replace(".", ",")}pp`
    : pct !== null ? `${up ? "+" : ""}${pct.toFixed(1).replace(".", ",")}%` : (up ? "+" : "") + formatValor(delta);
  return (
    <Badge variant="outline" className={`gap-1 ${cls}`}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}
