import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { DpContentCard } from "@/components/dp/DpPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ADIANTAMENTO_13_LABEL, useDpFeriasConfig, type FeriasAdiantamento13,
} from "@/hooks/useDpFeriasConfig";
import { useDpFeriasConfigUnidades } from "@/hooks/useDpFeriasConfigUnidades";
import { useDpUnidades } from "@/hooks/useDpCadastros";

/** Antecedência do aviso de férias e política de adiantamento do 13º. */
export function FeriasConfigCard() {
  const { config, isLoading, save } = useDpFeriasConfig();
  const { overrides, save: saveUnidade } = useDpFeriasConfigUnidades();
  const { data: unidades = [] } = useDpUnidades();
  const [dias, setDias] = useState(String(config.avisoAntecedenciaDias));
  const [politica, setPolitica] = useState<FeriasAdiantamento13>(config.adiantamento13);

  useEffect(() => {
    setDias(String(config.avisoAntecedenciaDias));
    setPolitica(config.adiantamento13);
  }, [config.avisoAntecedenciaDias, config.adiantamento13]);

  const alterado =
    Number(dias) !== config.avisoAntecedenciaDias || politica !== config.adiantamento13;

  return (
    <DpContentCard contentClassName="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <BellRing className="size-4 text-muted-foreground" aria-hidden="true" />
        <h3 className="font-semibold">Aviso de férias</h3>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase text-muted-foreground">
            Antecedência mínima (dias)
          </Label>
          <Input
            type="number"
            min={0}
            max={365}
            value={dias}
            onChange={(e) => setDias(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Marcações com menos antecedência do que isso pedem uma justificativa.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase text-muted-foreground">
            Adiantamento do 13º junto às férias
          </Label>
          <Select value={politica} onValueChange={(v) => setPolitica(v as FeriasAdiantamento13)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(ADIANTAMENTO_13_LABEL) as FeriasAdiantamento13[]).map((k) => (
                <SelectItem key={k} value={k}>{ADIANTAMENTO_13_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2 rounded-xl border p-3">
        <p className="text-sm font-medium">Exceção por unidade (13º)</p>
        <p className="text-xs text-muted-foreground">
          Deixe em “Seguir a empresa” para a unidade usar a regra acima.
        </p>
        {(unidades as any[]).length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma unidade cadastrada.</p>
        ) : (
          <div className="space-y-2">
            {(unidades as any[]).map((u) => {
              const atual =
                overrides.find((o) => o.unidadeId === u.id)?.adiantamento13 ?? "empresa";
              return (
                <div key={u.id} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-32 flex-1 truncate text-sm">{u.nome}</span>
                  <Select
                    value={atual}
                    onValueChange={(v) =>
                      saveUnidade.mutate({
                        unidadeId: u.id,
                        adiantamento13: v === "empresa" ? null : (v as FeriasAdiantamento13),
                      })
                    }
                  >
                    <SelectTrigger className="h-9 w-full sm:w-80"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="empresa">Seguir a empresa</SelectItem>
                      {(Object.keys(ADIANTAMENTO_13_LABEL) as FeriasAdiantamento13[]).map((k) => (
                        <SelectItem key={k} value={k}>{ADIANTAMENTO_13_LABEL[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button
          className="rounded-full px-6"
          disabled={isLoading || save.isPending || !alterado}
          onClick={() =>
            save.mutate({
              avisoAntecedenciaDias: Math.max(0, Math.min(365, Number(dias) || 0)),
              adiantamento13: politica,
            })
          }
        >
          {save.isPending ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </DpContentCard>
  );
}

