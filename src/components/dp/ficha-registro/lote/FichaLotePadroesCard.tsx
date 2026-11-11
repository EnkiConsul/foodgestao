import { useEffect, useState } from "react";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import type { EscolhasLote } from "@/lib/dp/ficha-registro/organizacao-lote";
import { EscolhasLoteCampos, motivoPontoPendente, resumoEscolhas, type TurnoLote } from "./EscolhasLoteCampos";

/**
 * Como o diálogo abre: padrão da maioria (lote todo) ou um grupo já escolhido
 * na lista (setor inteiro ou fichas marcadas). A escolha de pessoas acontece
 * sempre na lista — aqui só ficam os campos, para caber no celular.
 */
export type AberturaPadroes =
  | { escopo: "lote" }
  | { escopo: "grupo"; ids: string[]; titulo: string };

interface Props {
  /** Padrões em vigor (já com o que vem da unidade). */
  padroes: EscolhasLote;
  turnos: TurnoLote[];
  unidadeSemAdiantamento: boolean;
  unidadeTemPonto: boolean;
  abertura: AberturaPadroes | null;
  onAbertura: (a: AberturaPadroes | null) => void;
  salvando: boolean;
  onSalvar: (p: EscolhasLote) => Promise<void>;
  onAplicarGrupo: (itemIds: string[], escolhas: EscolhasLote) => Promise<void>;
}

const pessoas = (n: number) => `${n} ${n === 1 ? "pessoa" : "pessoas"}`;

/** Card único com os padrões da maioria; o mesmo diálogo aplica escolhas a um grupo vindo da lista. */
export function FichaLotePadroesCard({
  padroes, turnos, unidadeSemAdiantamento, unidadeTemPonto, abertura, onAbertura, salvando, onSalvar, onAplicarGrupo,
}: Props) {
  const [rascunho, setRascunho] = useState<EscolhasLote>(padroes);
  const [escolhasGrupo, setEscolhasGrupo] = useState<EscolhasLote>({});

  const pilulas = resumoEscolhas(padroes, turnos);
  pilulas.push(unidadeTemPonto ? "Registram ponto (salvo quem for marcado)" : "Sem folha de ponto (unidade)");

  const aberto = !!abertura;
  useEffect(() => {
    if (!abertura) return;
    setRascunho({
      regime: padroes.regime ?? null,
      forma_pagamento: padroes.forma_pagamento ?? null,
      adiantamento: padroes.adiantamento ?? false,
      turno_id: padroes.turno_id ?? null,
    });
    setEscolhasGrupo({});
    // Só reinicia quando o diálogo abre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const grupo = abertura?.escopo === "grupo" ? abertura : null;
  const nadaEscolhido = Object.keys(escolhasGrupo).length === 0;
  const faltaMotivoPonto = !!grupo && motivoPontoPendente(escolhasGrupo);
  const fechar = () => onAbertura(null);

  const confirmar = async () => {
    try {
      if (grupo) await onAplicarGrupo(grupo.ids, escolhasGrupo);
      else await onSalvar(rascunho);
      fechar();
    } catch {
      /* a mensagem já foi mostrada */
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => onAbertura({ escopo: "lote" })}
        className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left hover:bg-muted/40"
      >
        <SlidersHorizontal className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Padrões do lote</span>
          <span className="mt-1 flex flex-wrap gap-1">
            {pilulas.map((p) => (
              <span key={p} className="rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">{p}</span>
            ))}
          </span>
        </span>
        <span className="shrink-0 text-xs font-medium text-primary">Alterar</span>
      </button>

      <ResponsiveDialog
        open={aberto}
        onOpenChange={(o) => !o && fechar()}
        title={grupo ? grupo.titulo : "Padrões do lote"}
        description={
          grupo
            ? `${pessoas(grupo.ids.length)}. Preencha só o que muda; o resto segue o padrão do lote.`
            : "Vale para todas as fichas, exceto o que for escolhido em cada uma."
        }
        className="sm:max-w-md"
        footer={
          <div className="flex w-full gap-2 sm:justify-end">
            <Button variant="outline" className="h-11 flex-1 sm:flex-none" onClick={fechar}>Cancelar</Button>
            <Button className="h-11 flex-1 sm:flex-none" disabled={salvando || (!!grupo && nadaEscolhido) || faltaMotivoPonto} onClick={confirmar}>
              {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {grupo ? `Aplicar a ${pessoas(grupo.ids.length)}` : "Salvar padrões"}
            </Button>
          </div>
        }
      >
        {grupo ? (
          <EscolhasLoteCampos
            valor={escolhasGrupo}
            onChange={setEscolhasGrupo}
            modo="grupo"
            turnos={turnos}
            unidadeTemPonto={unidadeTemPonto}
          />
        ) : (
          <EscolhasLoteCampos
            valor={rascunho}
            onChange={setRascunho}
            modo="padrao"
            turnos={turnos}
            unidadeSemAdiantamento={unidadeSemAdiantamento}
            unidadeTemPonto={unidadeTemPonto}
          />
        )}
      </ResponsiveDialog>
    </>
  );
}
