import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { registrarPeriodosPolitica } from "@/lib/dp/unidadePoliticas";
import { useUpsertDpUnidade, type DpUnidade } from "@/hooks/useDpCadastros";
import {
  ANTECEDENCIA_MAX_DIAS,
  ANTECEDENCIA_MIN_DIAS,
  ANTECEDENCIA_PADRAO_DIAS,
} from "@/lib/dp/adiantamento-opcao";

interface Props { unidade: DpUnidade | null; open: boolean; onOpenChange: (open: boolean) => void; }

type Aviso = "alteracoes" | "relacao_mensal";

/** Dia do mês anterior ao pagamento, ex.: pagamento 20 e 5 dias → "dia 15". */
function textoPrazo(dia: number, antecedencia: number) {
  const limite = dia - antecedencia;
  return limite >= 1 ? `até o dia ${limite}` : `até ${antecedencia} dias antes (no mês anterior)`;
}

export function UnidadeAdiantamentoDialog({ unidade, open, onOpenChange }: Props) {
  const salvar = useUpsertDpUnidade();
  const [ativo, setAtivo] = useState(false);
  const [dia, setDia] = useState(15);
  const [antecedencia, setAntecedencia] = useState(ANTECEDENCIA_PADRAO_DIAS);
  const [aviso, setAviso] = useState<Aviso>("alteracoes");
  const [dataEfeito, setDataEfeito] = useState("");
  const mudou = !!unidade && ativo !== !!unidade.tem_adiantamento;

  useEffect(() => {
    if (!open || !unidade) return;
    setAtivo(unidade.tem_adiantamento);
    setDia(unidade.dia_adiantamento ?? 15);
    setAntecedencia(unidade.adiantamento_antecedencia_dias ?? ANTECEDENCIA_PADRAO_DIAS);
    setAviso((unidade.adiantamento_aviso as Aviso) ?? "alteracoes");
    setDataEfeito("");
  }, [open, unidade]);

  const concluir = async () => {
    if (!unidade) return;
    if (ativo && (dia < 1 || dia > 28)) { toast.error("Informe um dia entre 1 e 28"); return; }
    if (ativo && (!Number.isInteger(antecedencia) || antecedencia < ANTECEDENCIA_MIN_DIAS || antecedencia > ANTECEDENCIA_MAX_DIAS)) {
      toast.error(`Informe uma antecedência entre ${ANTECEDENCIA_MIN_DIAS} e ${ANTECEDENCIA_MAX_DIAS} dias`); return;
    }
    if (mudou && !dataEfeito) { toast.error(ativo ? "Informe a data de início" : "Informe a data de fim"); return; }
    try {
      await salvar.mutateAsync({
        id: unidade.id, nome: unidade.nome, company_id: unidade.company_id,
        tem_adiantamento: ativo, dia_adiantamento: ativo ? dia : null,
        ...(ativo ? { adiantamento_antecedencia_dias: antecedencia, adiantamento_aviso: aviso } : {}),
      });
      if (mudou) await registrarPeriodosPolitica(unidade.company_id, unidade.id, [{ politica: "adiantamento", ativo, data: dataEfeito }]);
      toast.success("Regra de adiantamento atualizada");
      onOpenChange(false);
    } catch (error) {
      toast.error("Não foi possível atualizar a unidade", { description: error instanceof Error ? error.message : String(error) });
    }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[92dvh] w-[calc(100%-1rem)] flex-col sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Adiantamento da unidade</DialogTitle>
        <DialogDescription>{unidade?.nome}: esta regra vale para os colaboradores da unidade.</DialogDescription>
      </DialogHeader>
      <div className="-mx-1 flex-1 space-y-4 overflow-y-auto px-1 py-2">
        <div className="flex items-center justify-between gap-3 rounded-md border p-3">
          <Label htmlFor="unidade-tem-adiantamento">Oferece adiantamento salarial</Label>
          <Switch id="unidade-tem-adiantamento" checked={ativo} onCheckedChange={setAtivo} />
        </div>
        {mudou && <div className="space-y-2">
          <Label htmlFor="unidade-adiant-data">{ativo ? "Data de Início *" : "Data de Fim *"}</Label>
          <Input id="unidade-adiant-data" type="date" value={dataEfeito} onChange={(e) => setDataEfeito(e.target.value)} />
        </div>}
        {ativo && <>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="unidade-dia-adiantamento">Dia do adiantamento</Label>
              <Input id="unidade-dia-adiantamento" type="number" inputMode="numeric" min={1} max={28} value={dia} onChange={(e) => setDia(Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unidade-antecedencia-adiantamento">Antecedência (dias)</Label>
              <Input id="unidade-antecedencia-adiantamento" type="number" inputMode="numeric" min={ANTECEDENCIA_MIN_DIAS} max={ANTECEDENCIA_MAX_DIAS} value={antecedencia} onChange={(e) => setAntecedencia(Number(e.target.value))} aria-describedby="unidade-antecedencia-ajuda" />
            </div>
          </div>
          <p id="unidade-antecedencia-ajuda" className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
            O colaborador pede ou suspende pelo portal {textoPrazo(dia, antecedencia)} para valer no mês; depois disso, vale a partir do mês seguinte.
            O gestor pode alterar a qualquer momento, sem antecedência.
          </p>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Avisos para a gestão</legend>
            <RadioGroup value={aviso} onValueChange={(v) => setAviso(v as Aviso)} className="gap-2">
              <label htmlFor="adiant-aviso-alteracoes" className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                <RadioGroupItem id="adiant-aviso-alteracoes" value="alteracoes" className="mt-0.5" />
                <span className="text-sm">
                  <span className="font-medium">Só novas adesões e suspensões</span>
                  <span className="block text-xs text-muted-foreground">Aviso a cada pedido feito pelo portal. Bom para quem deixa o adiantamento sempre ligado.</span>
                </span>
              </label>
              <label htmlFor="adiant-aviso-mensal" className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                <RadioGroupItem id="adiant-aviso-mensal" value="relacao_mensal" className="mt-0.5" />
                <span className="text-sm">
                  <span className="font-medium">Relação completa todo mês</span>
                  <span className="block text-xs text-muted-foreground">Além dos pedidos, quando o prazo fecha chega o aviso com todos que recebem no mês, pronto para baixar em PDF.</span>
                </span>
              </label>
            </RadioGroup>
          </fieldset>
          {unidade?.id && unidade.tem_adiantamento && (
            <Button asChild variant="link" className="h-auto px-0">
              <Link to={`/dp/adiantamentos?unidade=${unidade.id}`} onClick={() => onOpenChange(false)}>Ver relação de adiantamento</Link>
            </Button>
          )}
        </>}
      </div>
      <DialogFooter className="gap-2 sm:gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button disabled={salvar.isPending} onClick={() => void concluir()}>{salvar.isPending ? "Salvando..." : "Salvar regra"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
