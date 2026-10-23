import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Ausente = { id: string; nome: string; motivo: string };

/**
 * Raio-X da Operação do Dia: quem já está fora da unidade na data do pedido
 * (folga, férias, atestado/falta) e quantos seguem trabalhando se o gestor aprovar.
 * Apenas informativo — nunca trava a aprovação.
 */
export function RaioXOperacaoDia({ companyId, colaboradorId, data }: { companyId: string; colaboradorId: string; data: string }) {
  const q = useQuery({
    queryKey: ["dp_raio_x_dia", companyId, colaboradorId, data],
    staleTime: 60_000,
    queryFn: async () => {
      const sb = supabase as any;
      const { data: me } = await sb.from("dp_colaboradores").select("unidade_id").eq("id", colaboradorId).maybeSingle();
      const unidade = me?.unidade_id ?? null;
      let colabsQ = sb.from("dp_colaboradores").select("id, nome").eq("company_id", companyId).eq("ativo", true).is("deleted_at", null);
      if (unidade) colabsQ = colabsQ.eq("unidade_id", unidade);
      const [colabs, folgas, ferias, ocorr] = await Promise.all([
        colabsQ,
        sb.from("dp_folgas").select("colaborador_id, tipo").eq("company_id", companyId).eq("data", data).neq("status", "cancelada"),
        sb.from("dp_ferias_gozos").select("colaborador_id, status").eq("company_id", companyId).lte("data_inicio", data).gte("data_fim", data),
        sb.from("dp_ocorrencias").select("colaborador_id, tipo").eq("company_id", companyId).eq("data_operacional", data).in("tipo", ["atestado", "falta"]),
      ]);
      const nomes = new Map<string, string>(((colabs.data ?? []) as any[]).map((c) => [c.id, c.nome]));
      const fora = new Map<string, Ausente>();
      const add = (id: string, motivo: string) => {
        if (id === colaboradorId || !nomes.has(id) || fora.has(id)) return;
        fora.set(id, { id, nome: nomes.get(id)!, motivo });
      };
      ((ferias.data ?? []) as any[]).filter((f) => !["cancelado", "cancelada"].includes(f.status)).forEach((f) => add(f.colaborador_id, "Férias"));
      ((ocorr.data ?? []) as any[]).forEach((o) => add(o.colaborador_id, o.tipo === "atestado" ? "Atestado" : "Falta"));
      ((folgas.data ?? []) as any[]).forEach((f) => add(f.colaborador_id, "Folga"));
      return { total: nomes.size, fora: [...fora.values()], conta: nomes.has(colaboradorId) };
    },
  });

  if (q.isLoading) return <div className="text-xs text-muted-foreground">Carregando operação do dia…</div>;
  if (!q.data) return null;
  const { total, fora, conta } = q.data;
  const trabalhando = Math.max(0, total - fora.length - (conta ? 1 : 0));
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-2 text-xs space-y-1" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1.5 font-medium">
        <Users className="size-3.5" /> Operação do dia se aprovar: {trabalhando} de {total} trabalhando
      </div>
      {fora.length === 0 ? (
        <div className="text-muted-foreground">Ninguém mais da unidade está fora neste dia.</div>
      ) : (
        <div className="text-muted-foreground">
          Já fora: {fora.map((a) => `${a.nome.split(" ")[0]} (${a.motivo})`).join(", ")}
        </div>
      )}
    </div>
  );
}
