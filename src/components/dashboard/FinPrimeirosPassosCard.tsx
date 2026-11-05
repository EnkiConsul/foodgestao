import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Landmark, Receipt, Calculator, Rocket, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";

/**
 * Primeiros passos do Financeiro: some quando os 3 passos estão concluídos
 * ou quando o gestor dispensa (guardado por empresa no aparelho).
 */
export function FinPrimeirosPassosCard() {
  const { selectedCompanyId } = useCompanyContext();
  const chave = `aveto:fin-primeiros-passos-ocultos:${selectedCompanyId}`;
  const [oculto, setOculto] = useState(() => {
    try { return localStorage.getItem(chave) === "1"; } catch { return false; }
  });

  const { data } = useQuery({
    queryKey: ["fin-primeiros-passos", selectedCompanyId],
    enabled: !!selectedCompanyId && !oculto,
    queryFn: async () => {
      const id = selectedCompanyId!;
      const [banco, lanc, membros, convites] = await Promise.all([
        supabase.from("pluggy_connections" as any).select("id", { count: "exact", head: true }).eq("company_id", id),
        supabase.from("transactions").select("id", { count: "exact", head: true }).eq("company_id", id),
        supabase.from("company_members").select("id", { count: "exact", head: true }).eq("company_id", id).eq("perfil", "contabilidade"),
        supabase.from("company_invites").select("id", { count: "exact", head: true }).eq("company_id", id).eq("perfil", "contabilidade"),
      ]);
      return {
        banco: (banco.count ?? 0) > 0,
        lancamento: (lanc.count ?? 0) > 0,
        contador: (membros.count ?? 0) + (convites.count ?? 0) > 0,
      };
    },
  });

  if (oculto || !data) return null;
  const feitos = [data.banco, data.lancamento, data.contador].filter(Boolean).length;
  if (feitos === 3) return null;

  const dispensar = () => {
    try { localStorage.setItem(chave, "1"); } catch { /* ignora */ }
    setOculto(true);
  };

  return (
    <section aria-label="Primeiros passos" className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold text-foreground">
          <Rocket className="h-5 w-5 text-primary" aria-hidden="true" /> Primeiros passos
        </h2>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">{feitos} de 3</span>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={dispensar} aria-label="Ocultar primeiros passos">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        <Passo feito={data.banco} icon={Landmark} titulo="Conectar o banco" desc="Extrato automático pelo Open Finance" to="/contas-bancarias" acao="Conectar" />
        <Passo feito={data.lancamento} icon={Receipt} titulo="Primeiro lançamento" desc="Categorias de food service já prontas" to="/lancamentos" acao="Lançar" />
        <Passo feito={data.contador} icon={Calculator} titulo="Convidar o contador" desc="Acesso só de leitura, sem custo" to="/gestao-usuarios" state={{ openInvite: true }} acao="Convidar" />
      </div>
    </section>
  );
}

function Passo({ feito, icon: Icon, titulo, desc, to, state, acao }: {
  feito: boolean; icon: typeof Landmark; titulo: string; desc: string; to: string; state?: unknown; acao: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-background p-3">
      {feito
        ? <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        : <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />}
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${feito ? "text-muted-foreground line-through" : "text-foreground"}`}>{titulo}</p>
        {!feito && <p className="text-xs text-muted-foreground">{desc}</p>}
      </div>
      {!feito && (
        <Button asChild size="sm" className="h-10 shrink-0">
          <Link to={to} state={state}>{acao}</Link>
        </Button>
      )}
    </div>
  );
}
