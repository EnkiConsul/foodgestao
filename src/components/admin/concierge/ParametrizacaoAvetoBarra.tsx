import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { Button } from "@/components/ui/button";

/**
 * Faixa da equipe Aveto: aparece quando um super admin está dentro de uma
 * empresa cliente em parametrização (apoio ou convite ainda não concluído) e
 * devolve, com um toque, para a empresa da própria pessoa.
 */
export function ParametrizacaoAvetoBarra() {
  const { user } = useAuth();
  const { isSuperAdmin } = useSuperAdmin();
  const { selectedCompanyId, companies, setContext } = useCompanyContext();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ["parametrizacao-aveto", user?.id],
    enabled: isSuperAdmin && !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const [prov, proprias] = await Promise.all([
        supabase
          .from("concierge_provisionamentos")
          .select("company_id, modo, ativado_em, parametrizacao_concluida_em"),
        supabase.from("companies").select("id").eq("user_id", user!.id).eq("is_active", true),
      ]);
      if (prov.error) throw prov.error;
      const emParametrizacao = (prov.data ?? [])
        .filter((p) => !p.parametrizacao_concluida_em && (p.modo === "apoio" || !p.ativado_em))
        .map((p) => p.company_id as string);
      return { emParametrizacao, proprias: (proprias.data ?? []).map((c) => c.id as string) };
    },
  });

  const cliente = useMemo(() => {
    if (!data || !selectedCompanyId) return null;
    if (!data.emParametrizacao.includes(selectedCompanyId)) return null;
    if (data.proprias.includes(selectedCompanyId) && data.proprias.length === 1) return null;
    return companies.find((c) => c.id === selectedCompanyId) ?? null;
  }, [data, selectedCompanyId, companies]);

  const minha = useMemo(() => {
    if (!data) return null;
    const ids = data.proprias.filter((id) => !data.emParametrizacao.includes(id));
    return companies.find((c) => ids.includes(c.id)) ?? null;
  }, [data, companies]);

  if (!isSuperAdmin || !cliente) return null;

  const voltar = () => {
    if (!minha) return;
    setContext("pj", minha.id);
    qc.invalidateQueries();
    navigate("/");
  };

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-warning/40 bg-warning/15 px-3 py-2 text-sm md:px-6"
    >
      <p className="flex min-w-0 flex-1 items-center gap-1.5">
        <Wrench className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <span className="truncate">
          Parametrizando <strong>{cliente.trade_name || cliente.name}</strong>
        </span>
      </p>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" className="h-9 px-2" asChild>
          <Link to="/admin/clientes">Concluir no Backoffice</Link>
        </Button>
        {minha && (
          <Button size="sm" variant="outline" className="h-9 bg-background" onClick={voltar}>
            <ArrowLeftRight className="mr-1.5 h-4 w-4" />
            <span className="max-w-[10rem] truncate">Voltar para {minha.trade_name || minha.name}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
