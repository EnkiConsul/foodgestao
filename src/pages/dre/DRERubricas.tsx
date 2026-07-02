import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { useDRERubricas } from "@/hooks/useDRE";
import { nivelIndent, isSubtotal, isCabecalho } from "@/lib/dre";
import { Helmet } from "react-helmet-async";

export default function DRERubricas() {
  const { data: rubricas = [] } = useDRERubricas();

  return (
    <div className="p-6 space-y-6">
      <Helmet><title>Rubricas DRE | Gestor Plin</title></Helmet>
      <div>
        <Link to="/relatorios/dre" className="text-sm text-muted-foreground hover:underline flex items-center gap-1 mb-1">
          <ArrowLeft className="h-3 w-3" /> Voltar à DRE
        </Link>
        <h1 className="text-2xl font-semibold">Rubricas Contábeis Padrão</h1>
        <p className="text-sm text-muted-foreground">Estrutura normativa da DRE conforme ITG 1000 / Lei 6.404/76.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Catálogo</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
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
