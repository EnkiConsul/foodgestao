import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface Props {
  companyId: string;
  data: string;
  /** Nomes de quem pertence à unidade do dia (filtra a lista). */
  nomes: Map<string, string>;
  /** Só as ações desta pessoa, embutidas na linha de "Fora da Operação". */
  colaboradorId?: string;
}

interface FolgaDia {
  key: string;
  folgaId: string | null;
  solicitacaoId: string | null;
  colaboradorId: string;
  origem: string | null;
}

/**
 * Folgas marcadas no dia, com cancelar e remarcar pelas mesmas rotinas do
 * Calendário de Folgas (dp_folga_admin_cancelar / dp_folga_admin_remarcar).
 * A folga fixa da jornada não é registro e muda só por troca.
 */
export function FolgasDoDiaPainel({ companyId, data, nomes, colaboradorId }: Props) {
  const qc = useQueryClient();
  const [acao, setAcao] = useState<{ item: FolgaDia; tipo: "cancelar" | "remarcar" } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [novaData, setNovaData] = useState("");

  const q = useQuery({
    queryKey: ["dp_folgas_do_dia", companyId, data],
    queryFn: async (): Promise<FolgaDia[]> => {
      const [f, s] = await Promise.all([
        supabase
          .from("dp_folgas")
          .select("id, colaborador_id, origem, tipo")
          .eq("company_id", companyId)
          .eq("data", data)
          .neq("status", "cancelada"),
        supabase
          .from("dp_solicitacoes")
          .select("id, colaborador_id")
          .eq("company_id", companyId)
          .eq("tipo", "folga")
          .eq("status", "aprovada")
          .eq("data_alvo", data)
          .is("removido_em", null),
      ]);
      if (f.error) throw f.error;
      if (s.error) throw s.error;
      const lista: FolgaDia[] = (f.data ?? [])
        .filter((x) => x.tipo !== "ferias" && x.tipo !== "licenca")
        .map((x) => ({
          key: `f:${x.id}`,
          folgaId: x.id,
          solicitacaoId: null,
          colaboradorId: x.colaborador_id,
          origem: (x as { origem?: string | null }).origem ?? null,
        }));
      const tem = new Set(lista.map((l) => l.colaboradorId));
      for (const x of s.data ?? []) {
        if (tem.has(x.colaborador_id)) continue;
        lista.push({ key: `s:${x.id}`, folgaId: null, solicitacaoId: x.id, colaboradorId: x.colaborador_id, origem: "solicitacao" });
      }
      return lista;
    },
  });

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["dp_folgas_do_dia"] });
    qc.invalidateQueries({ queryKey: ["dp_panorama_base"] });
    qc.invalidateQueries({ queryKey: ["dp_folgas"] });
    qc.invalidateQueries({ queryKey: ["dp_folgas_efetivadas"] });
  };

  const executar = useMutation({
    mutationFn: async () => {
      if (!acao) return;
      const { item, tipo } = acao;
      if (tipo === "cancelar") {
        const { error } = await supabase.rpc("dp_folga_admin_cancelar", {
          p_folga_id: item.folgaId,
          p_solicitacao_id: item.solicitacaoId,
          p_colaborador: item.colaboradorId,
          p_data: data,
          p_motivo: motivo.trim() || null,
        });
        if (error) throw error;
      } else {
        if (!novaData) throw new Error("Escolha a nova data.");
        const { error } = await supabase.rpc("dp_folga_admin_remarcar", {
          p_folga_id: item.folgaId,
          p_solicitacao_id: item.solicitacaoId,
          p_colaborador: item.colaboradorId,
          p_data_atual: data,
          p_data_nova: novaData,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(acao?.tipo === "cancelar" ? "Folga cancelada." : "Folga remarcada.");
      setAcao(null);
      setMotivo("");
      setNovaData("");
      invalidar();
    },
    onError: (e) =>
      toast.error("Não foi possível concluir", {
        description: `${e instanceof Error ? e.message : String(e)} Confira a data e tente de novo.`,
      }),
  });

  const itens = (q.data ?? []).filter((i) => nomes.has(i.colaboradorId));
  if (q.isLoading) return null;

  if (colaboradorId) {
    const i = itens.find((x) => x.colaboradorId === colaboradorId);
    if (!i) return null;
    return (
      <div className="flex w-full flex-wrap items-center justify-end gap-1">
        {acao?.item.key === i.key ? (
          <>
            {acao.tipo === "remarcar" ? (
              <Input type="date" className="h-8 w-40" value={novaData} onChange={(e) => setNovaData(e.target.value)} />
            ) : (
              <Input className="h-8 w-48" placeholder="Motivo (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            )}
            <Button size="sm" className="h-8" disabled={executar.isPending} onClick={() => executar.mutate()}>Confirmar</Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setAcao(null)}>Voltar</Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => { setAcao({ item: i, tipo: "remarcar" }); setNovaData(""); }}>Remarcar</Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" onClick={() => { setAcao({ item: i, tipo: "cancelar" }); setMotivo(""); }}>Cancelar</Button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Folgas marcadas neste dia</p>
      {!itens.length && (
        <p className="text-xs text-muted-foreground">
          Nenhuma folga marcada (a folga fixa da jornada muda só por troca).
        </p>
      )}
      <ul className="divide-y rounded-md border">
        {itens.map((i) => (
          <li key={i.key} className="space-y-2 p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">
                {nomes.get(i.colaboradorId)}
                {i.origem === "troca" && <Badge variant="outline" className="ml-2 text-[10px]">Troca</Badge>}
              </span>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => { setAcao({ item: i, tipo: "remarcar" }); setNovaData(""); }}>
                  Remarcar
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setAcao({ item: i, tipo: "cancelar" }); setMotivo(""); }}>
                  Cancelar
                </Button>
              </div>
            </div>
            {acao?.item.key === i.key && (
              <div className="flex flex-wrap items-center gap-2">
                {acao.tipo === "remarcar" ? (
                  <Input type="date" className="h-8 w-44" value={novaData} onChange={(e) => setNovaData(e.target.value)} />
                ) : (
                  <Input className="h-8 w-64" placeholder="Motivo (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                )}
                <Button size="sm" disabled={executar.isPending} onClick={() => executar.mutate()}>
                  Confirmar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAcao(null)}>Voltar</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
