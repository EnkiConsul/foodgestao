import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompanyEntitlements, MODULO_ROTULO, type ModuloAcesso } from "@/hooks/useModuleAccess";

/** Modelo v2: uma linha por módulo com teste acabando ou fatura em atraso. */
export function AcessoModulosBanner() {
  const { data } = useCompanyEntitlements();
  if (data?.mode !== "v2") return null;

  const linhas = (["financeiro", "pessoas"] as ModuloAcesso[]).flatMap((m) => {
    const a = data[m];
    if (!a?.allowed) return [];
    if (a.dias_atraso && a.dias_atraso > 0) {
      const r = Math.max(0, 10 - a.dias_atraso);
      return [{ m, texto: `${MODULO_ROTULO[m]}: mensalidade vencida há ${a.dias_atraso} ${a.dias_atraso === 1 ? "dia" : "dias"}. Suspensão em ${r} ${r === 1 ? "dia" : "dias"}.`,
        to: a.fatura_pendente_id ? `/checkout/pagamento/${a.fatura_pendente_id}` : "/assinatura", cta: "Regularizar" }];
    }
    if (a.status === "trialing" && a.dias_restantes != null && a.dias_restantes <= 3) {
      const d = a.dias_restantes;
      const quando = d <= 0 ? "encerra hoje" : d === 1 ? "encerra amanhã" : `encerra em ${d} dias`;
      return [{ m, texto: `${MODULO_ROTULO[m]}: seu período de teste ${quando}.`, to: `/planos?modulo=${m}`, cta: "Assinar Plano" }];
    }
    return [];
  });
  if (!linhas.length) return null;

  return (
    <div className="border-b border-destructive/30 bg-destructive/10">
      {linhas.map((l) => (
        <div key={l.m} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <span>{l.texto}</span>
          <Button asChild size="sm" className="ml-auto"><Link to={l.to}>{l.cta}</Link></Button>
        </div>
      ))}
    </div>
  );
}
