import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useDpColaboradores, type DpColaborador } from "@/hooks/useDpColaboradores";
import {
  useDpBeneficiosPadroes,
  useSincronizarPadraoColaboradores,
} from "@/hooks/useDpBeneficiosPadrao";
import {
  GRUPOS_PADRAO, ROTULOS_GRUPO, divergenciasColaboradorVsPadrao, nivelPadrao,
  padraoTemConteudo, resolverPadrao,
  type BeneficiosPadraoLinha, type DivergenciaColaborador, type GrupoPadrao,
} from "@/lib/dp/beneficiosPadrao";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

interface ItemDivergente {
  colaborador: DpColaborador;
  padrao: BeneficiosPadraoLinha;
  divergencias: DivergenciaColaborador[];
}

const NIVEL_ROTULO: Record<string, string> = {
  cargo: "padrão do cargo",
  unidade: "padrão da unidade",
  empresa: "padrão da empresa",
};

/**
 * Alinha colaboradores ativos ao padrão vigente (cargo → unidade → empresa).
 * O usuário vê exatamente o que muda e pode deixar exceções de fora.
 */
export function SincronizarPadraoDialog({ open, onOpenChange }: Props) {
  const colaboradores = useDpColaboradores();
  const padroes = useDpBeneficiosPadroes();
  const sincronizar = useSincronizarPadraoColaboradores();

  const [grupos, setGrupos] = useState<GrupoPadrao[]>([...GRUPOS_PADRAO]);
  const [ignorados, setIgnorados] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setGrupos([...GRUPOS_PADRAO]);
    setIgnorados(new Set());
  }, [open]);

  const itens = useMemo<ItemDivergente[]>(() => {
    const lista = colaboradores.data ?? [];
    const out: ItemDivergente[] = [];
    for (const c of lista) {
      if (!c.ativo || c.data_desligamento) continue;
      const padrao = resolverPadrao(padroes.data, c.unidade_id, c.cargo_id);
      if (!padrao || !padraoTemConteudo(padrao.payload)) continue;
      const divergencias = divergenciasColaboradorVsPadrao(
        c as unknown as Record<string, unknown>,
        padrao.payload,
        grupos,
      );
      if (!divergencias.length) continue;
      out.push({ colaborador: c, padrao, divergencias });
    }
    return out;
  }, [colaboradores.data, padroes.data, grupos]);

  const selecionados = itens.filter((i) => !ignorados.has(i.colaborador.id));

  const toggleGrupo = (g: GrupoPadrao) =>
    setGrupos((atual) => (atual.includes(g) ? atual.filter((x) => x !== g) : [...atual, g]));

  const aplicar = async () => {
    // Cada colaborador pode estar sob um padrão diferente: agrupa por padrão.
    const porPadrao = new Map<string, { padrao: BeneficiosPadraoLinha; ids: string[] }>();
    for (const item of selecionados) {
      const chave = item.padrao.id ?? `${item.padrao.unidade_id ?? ""}:${item.padrao.cargo_id ?? ""}`;
      const grupo = porPadrao.get(chave) ?? { padrao: item.padrao, ids: [] };
      grupo.ids.push(item.colaborador.id);
      porPadrao.set(chave, grupo);
    }
    try {
      let total = 0;
      for (const { padrao, ids } of porPadrao.values()) {
        total += await sincronizar.mutateAsync({ ids, payload: padrao.payload, grupos });
      }
      toast.success("Colaboradores sincronizados", {
        description: `${total} colaborador(es) alinhado(s) ao padrão vigente.`,
      });
      onOpenChange(false);
    } catch (e) {
      toast.error("Não foi possível sincronizar", { description: e instanceof Error ? e.message : "Erro inesperado." });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sincronizar com o padrão</DialogTitle>
          <DialogDescription>
            Colaboradores ativos cujos benefícios e regras de assiduidade estão diferentes do
            padrão vigente da empresa, unidade ou cargo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 rounded-xl border border-border p-3">
            {GRUPOS_PADRAO.map((g) => (
              <label key={g} className="flex cursor-pointer items-center gap-2 text-xs">
                <Checkbox checked={grupos.includes(g)} onCheckedChange={() => toggleGrupo(g)} />
                {ROTULOS_GRUPO[g]}
              </label>
            ))}
          </div>

          {colaboradores.isLoading || padroes.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : !grupos.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Escolha ao menos um grupo de regras para comparar.
            </p>
          ) : !itens.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Todos os colaboradores ativos já seguem o padrão vigente.
            </p>
          ) : (
            <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
              {itens.map((item) => {
                const marcado = !ignorados.has(item.colaborador.id);
                return (
                  <div
                    key={item.colaborador.id}
                    className="flex items-start gap-3 rounded-xl border border-border p-3"
                  >
                    <Checkbox
                      checked={marcado}
                      className="mt-0.5"
                      onCheckedChange={() =>
                        setIgnorados((atual) => {
                          const proximo = new Set(atual);
                          if (proximo.has(item.colaborador.id)) proximo.delete(item.colaborador.id);
                          else proximo.add(item.colaborador.id);
                          return proximo;
                        })
                      }
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {item.colaborador.nome}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">
                          {NIVEL_ROTULO[nivelPadrao(item.padrao) ?? "empresa"]}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {item.colaborador.cargo_nome ?? "sem cargo"}
                          {item.colaborador.unidade_nome ? ` • ${item.colaborador.unidade_nome}` : ""}
                        </span>
                      </div>
                      <ul className="space-y-0.5 text-xs text-muted-foreground">
                        {item.divergencias.map((d) => (
                          <li key={d.coluna}>
                            <span className="text-foreground">{d.rotulo}:</span> padrão {d.padrao} •
                            hoje {d.atual}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button
            type="button"
            disabled={!selecionados.length || sincronizar.isPending}
            onClick={() => void aplicar()}
          >
            Aplicar a {selecionados.length} colaborador(es)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
