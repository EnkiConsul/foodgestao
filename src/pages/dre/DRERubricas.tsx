import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { useDRERubricas } from "@/hooks/useDRE";
import { nivelIndent, isSubtotal, isCabecalho } from "@/lib/dre";
import { Helmet } from "react-helmet-async";
import { DRESubNav } from "./DRESubNav";

export default function DRERubricas() {
  const { data: rubricas = [] } = useDRERubricas();

  return (
    <div className="p-6 space-y-6">
      <Helmet><title>Rubricas DRE | Gestor Plin</title></Helmet>

      <PageHeader
        title="Rubricas Contábeis Padrão"
        description="Estrutura normativa da DRE conforme ITG 1000 / Lei 6.404/76."
      />

      <DRESubNav />

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Catálogo</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-2 w-24">Código</th>
                <th className="text-left px-4 py-2">Rubrica</th>
                <th className="text-left px-4 py-2 w-32">Natureza</th>
                <th className="text-left px-4 py-2 w-32">Tipo</th>
              </tr>
            </thead>
            <tbody>
              {rubricas.map((r) => {
                const level = nivelIndent(r.codigo);
                const sub = isSubtotal(r.codigo);
                const cab = isCabecalho(r.codigo);
                return (
                  <tr key={r.id} className={`border-b last:border-0 ${sub ? "bg-primary/5 font-semibold" : cab ? "bg-muted/30 font-medium" : ""}`}>
                    <td className="px-4 py-2 text-xs text-muted-foreground font-mono">{r.codigo}</td>
                    <td className="px-4 py-2" style={{ paddingLeft: `${16 + level * 20}px` }}>{r.nome}</td>
                    <td className="px-4 py-2">
                      <Badge variant={r.natureza === "credora" ? "default" : "secondary"} className="text-[10px]">{r.natureza}</Badge>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{r.tipo ?? (r.is_calculada ? "calculada" : "—")}</td>
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
