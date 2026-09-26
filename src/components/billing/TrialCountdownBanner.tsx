import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMinhasAssinaturas, type Modulo } from "@/hooks/useMinhaAssinatura";

const MODULO_ROTULO: Record<Modulo, string> = {
  financeiro: "Financeiro 360°",
  pessoas: "Pessoas 360°",
};

const DIAS_AVISO = 3;
const CHAVE = "trial-banner-dispensado";

const diasRestantes = (fim: string) =>
  Math.ceil((new Date(fim).getTime() - Date.now()) / 86400000);

function mensagem(rotulo: string, dias: number) {
  if (dias <= 0) return `Seu período de teste do ${rotulo} encerra hoje.`;
  if (dias === 1) return `Seu período de teste do ${rotulo} encerra amanhã.`;
  return `Seu período de teste do ${rotulo} encerra em ${dias} dias.`;
}

/** Aviso no topo do sistema quando o teste grátis está perto do fim. */
export function TrialCountdownBanner() {
  const { data: assinaturas } = useMinhasAssinaturas();
  const [dispensado, setDispensado] = useState(
    () => sessionStorage.getItem(CHAVE) === "1",
  );

  const alvo = useMemo(() => {
    const candidatas = (assinaturas ?? [])
      .filter((a) => a.status === "trialing" && !a.is_exempt && a.trial_ends_at)
      .map((a) => ({ a, dias: diasRestantes(a.trial_ends_at!) }))
      .filter(({ dias }) => dias <= DIAS_AVISO)
      .sort((x, y) => x.dias - y.dias);
    return candidatas[0] ?? null;
  }, [assinaturas]);

  if (dispensado || !alvo) return null;

  const modulo = (alvo.a.module ?? "financeiro") as Modulo;
  const rotulo = MODULO_ROTULO[modulo] ?? "seu plano";

  const dispensar = () => {
    sessionStorage.setItem(CHAVE, "1");
    setDispensado(true);
  };

  return (
    <div className="border-b border-amber-500/40 bg-amber-500/10 px-3 py-2 md:px-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-foreground">
            {mensagem(rotulo, alvo.dias)}{" "}
            <span className="text-muted-foreground">
              Assine agora para manter seus dados e o acesso sem interrupções.
            </span>
          </p>
        </div>
        <div className="flex items-center gap-1 self-end sm:self-auto">
          <Button asChild size="sm">
            <Link to={`/planos?modulo=${modulo}`}>Assinar plano</Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={dispensar}
            aria-label="Dispensar aviso"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
