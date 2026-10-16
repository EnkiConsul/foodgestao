import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, ListChecks } from "lucide-react";
import { useDpPendencias } from "@/hooks/useDpPendencias";
import { useDpUserPrefs } from "@/hooks/useDpUserPrefs";
import { useDpPendenciasDecisoes } from "@/hooks/useDpPendenciasDecisoes";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { filtrarAbertas, urgenciaDe } from "@/lib/dp/pendencias";
import { useStablePendencias } from "@/components/dp/home/PendenciasCard";

/**
 * Resumo compacto das "Ações do Dia" na tela inicial. Destaque moderado:
 * mostra só o total e a urgência; o clique abre a tela completa.
 */
export function AcoesDoDiaCard() {
  const { selectedCompanyId } = useCompanyContext();
  const { data, isLoading, isFetching, dataUpdatedAt, lastCalculatedAt } = useDpPendencias();
  const stable = useStablePendencias({ companyId: selectedCompanyId, data, dataUpdatedAt, lastCalculatedAt, isLoading, isFetching });
  const { prefs } = useDpUserPrefs();
  const { ignoradas, adiadas } = useDpPendenciasDecisoes();

  const abertas = useMemo(
    () => filtrarAbertas(stable.data.filter((p) => !ignoradas.has(p.id)), { ...prefs.pendencias_adiadas, ...adiadas }),
    [stable.data, prefs.pendencias_adiadas, ignoradas, adiadas],
  );
  const atrasadas = abertas.filter((p) => urgenciaDe(p) === "atrasada").length;
  const hoje = abertas.filter((p) => urgenciaDe(p) === "hoje").length;
  const carregando = !stable.ready;

  const resumo = carregando
    ? "Carregando…"
    : abertas.length === 0
      ? "Tudo em dia"
      : [atrasadas > 0 && `${atrasadas} ${atrasadas === 1 ? "atrasada" : "atrasadas"}`, hoje > 0 && `${hoje} para hoje`]
          .filter(Boolean)
          .join(" · ") || "Nenhuma urgente";

  return (
    <Link
      to="/dp/cadastros/pendencias"
      className="flex items-center gap-3 rounded-2xl border border-[hsl(var(--dp-border))] bg-card px-4 py-3 transition-colors hover:bg-muted/40"
      aria-label="Abrir Ações do Dia"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <ListChecks className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Ações do Dia</p>
        <p className={atrasadas > 0 ? "truncate text-xs text-destructive" : "truncate text-xs text-muted-foreground"}>{resumo}</p>
      </div>
      {!carregando && abertas.length > 0 && (
        <span className="rounded-full bg-primary px-2.5 py-0.5 text-sm font-bold tabular-nums text-primary-foreground">{abertas.length}</span>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}
