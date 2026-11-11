import { useState } from "react";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import type { EscolhasLote } from "@/lib/dp/ficha-registro/organizacao-lote";
import { EscolhasLoteCampos, resumoEscolhas, type TurnoLote } from "./EscolhasLoteCampos";

interface Props {
  /** Padrões em vigor (já com o que vem da unidade). */
  padroes: EscolhasLote;
  turnos: TurnoLote[];
  unidadeSemAdiantamento: boolean;
  unidadeTemPonto: boolean;
  salvando: boolean;
  onSalvar: (p: EscolhasLote) => Promise<void>;
}

/**
 * Card único com as escolhas da maioria do lote. Fica salvo no lote: quem
 * continuar a conferência (ex.: o responsável da empresa) encontra igual.
 */
export function FichaLotePadroesCard({ padroes, turnos, unidadeSemAdiantamento, unidadeTemPonto, salvando, onSalvar }: Props) {
  const [aberto, setAberto] = useState(false);
  const [rascunho, setRascunho] = useState<EscolhasLote>(padroes);
  const pilulas = resumoEscolhas(padroes, turnos);
  pilulas.push(unidadeTemPonto ? "Folha de ponto: decidir na ficha" : "Sem folha de ponto (unidade)");

  const abrir = () => {
    setRascunho({
      regime: padroes.regime ?? null,
      forma_pagamento: padroes.forma_pagamento ?? null,
      adiantamento: padroes.adiantamento ?? null,
      turno_id: padroes.turno_id ?? null,
    });
    setAberto(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left hover:bg-muted/40"
      >
        <SlidersHorizontal className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Padrões do lote</span>
          <span className="mt-1 flex flex-wrap gap-1">
            {pilulas.map((p) => (
              <span key={p} className="rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">{p}</span>
            ))}
            {pilulas.length === 1 && (
              <span className="text-[11px] text-muted-foreground">Vínculo, pagamento e turno conforme cada ficha</span>
            )}
          </span>
        </span>
        <span className="shrink-0 text-xs font-medium text-primary">Alterar</span>
      </button>

      <ResponsiveDialog
        open={aberto}
        onOpenChange={setAberto}
        title="Padrões do lote"
        description="Vale para as fichas em que nada diferente foi escolhido. Fica salvo para quem continuar a conferência."
        className="sm:max-w-lg"
        footer={
          <div className="flex w-full gap-2 sm:justify-end">
            <Button variant="outline" className="h-11 flex-1 sm:flex-none" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button
              className="h-11 flex-1 sm:flex-none"
              disabled={salvando}
              onClick={async () => {
                try {
                  await onSalvar(rascunho);
                  setAberto(false);
                } catch {
                  /* a mensagem já foi mostrada */
                }
              }}
            >
              {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Salvar padrões
            </Button>
          </div>
        }
      >
        <EscolhasLoteCampos
          valor={rascunho}
          onChange={setRascunho}
          modo="padrao"
          turnos={turnos}
          unidadeSemAdiantamento={unidadeSemAdiantamento}
        />
      </ResponsiveDialog>
    </>
  );
}
