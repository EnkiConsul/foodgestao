import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { numeroBR } from "@/components/dp/RemuneracaoFields";
import {
  JUSTIFICATIVA_MIN, mensagemErroPiso, validarEdicaoPiso, type CargoSalarioLinha,
} from "@/lib/dp/cargoSalarios";
import { useUpdateDpCargoSalarioComLog } from "@/hooks/useDpCadastros";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cargoId: string;
  /** Linha em edição. */
  linha: CargoSalarioLinha | null;
  /** Todas as linhas do cargo (para validar sobreposição e piso mínimo). */
  todas: CargoSalarioLinha[];
  patronais: { id: string; nome: string }[];
  unidades: { id: string; nome: string }[];
  /** Patronal de cada unidade — o ajuste da unidade segue o patronal dela. */
  patronalPorUnidade: Record<string, { id: string; nome: string }> | undefined;
}

const SEM_UNIDADE = "__patronal__";

/** Edição de um piso já cadastrado: exige justificativa e grava log. */
export function CargoSalarioEditDialog({
  open, onOpenChange, cargoId, linha, todas, patronais, unidades, patronalPorUnidade,
}: Props) {
  const update = useUpdateDpCargoSalarioComLog();
  const [valor, setValor] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [unidadeId, setUnidadeId] = useState<string>(SEM_UNIDADE);
  const [patronalId, setPatronalId] = useState<string>("");
  const [observacao, setObservacao] = useState("");
  const [justificativa, setJustificativa] = useState("");

  useEffect(() => {
    if (!open || !linha) return;
    setValor(String(Number(linha.salario_base)).replace(".", ","));
    setInicio(linha.vigencia_inicio);
    setFim(linha.vigencia_fim ?? "");
    setUnidadeId(linha.unidade_id ?? SEM_UNIDADE);
    setPatronalId(linha.sindicato_patronal_id ?? "");
    setObservacao(linha.observacao ?? "");
    setJustificativa("");
  }, [open, linha]);

  // Ao escolher uma unidade, o patronal acompanha o vínculo dela.
  useEffect(() => {
    if (unidadeId === SEM_UNIDADE) return;
    const p = patronalPorUnidade?.[unidadeId]?.id ?? "";
    if (p) setPatronalId(p);
  }, [unidadeId, patronalPorUnidade]);

  const salvar = async () => {
    if (!linha?.id) return;
    const edicao = {
      id: linha.id,
      salario_base: numeroBR(valor),
      vigencia_inicio: inicio,
      vigencia_fim: fim || null,
      unidade_id: unidadeId === SEM_UNIDADE ? null : unidadeId,
      sindicato_patronal_id: patronalId || null,
      observacao: observacao.trim() || null,
      justificativa,
    };
    const check = validarEdicaoPiso(edicao, todas);
    if (check.ok === false) {
      toast.error(check.mensagem);
      return;
    }
    try {
      await update.mutateAsync({
        ...edicao,
        cargo_id: cargoId,
        anterior: {
          cargo_id: cargoId,
          salario_base: Number(linha.salario_base),
          vigencia_inicio: linha.vigencia_inicio,
          vigencia_fim: linha.vigencia_fim ?? null,
          unidade_id: linha.unidade_id ?? null,
          sindicato_patronal_id: linha.sindicato_patronal_id ?? null,
          observacao: linha.observacao ?? null,
        },
      });
      toast.success("Piso alterado e registrado no histórico.");
      onOpenChange(false);
    } catch (e) {
      toast.error("Não foi possível alterar", { description: mensagemErroPiso(e) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-amber-600" aria-hidden="true" />
            Editar salário cadastrado
          </DialogTitle>
          <DialogDescription>
            Alterar valor, data base ou escopo muda a folha e as conferências. A mudança fica
            registrada com autor, data e justificativa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="piso-valor">Valor</Label>
              <Input
                id="piso-valor" inputMode="decimal" placeholder="0,00"
                value={valor} onChange={(e) => setValor(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="piso-inicio">Data base (início da vigência)</Label>
              <Input id="piso-inicio" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="piso-fim">Fim da vigência</Label>
              <Input id="piso-fim" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">Em branco = valor em aberto.</p>
            </div>
            <div className="space-y-2">
              <Label>Unidade</Label>
              <Select value={unidadeId} onValueChange={setUnidadeId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_UNIDADE}>Piso do sindicato patronal (todas)</SelectItem>
                  {unidades.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Sindicato patronal</Label>
              <Select value={patronalId} onValueChange={setPatronalId} disabled={unidadeId !== SEM_UNIDADE}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {patronais.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {unidadeId !== SEM_UNIDADE && (
                <p className="text-[11px] text-muted-foreground">
                  No ajuste de unidade o patronal vem do vínculo da própria unidade.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="piso-obs">Observação</Label>
            <Input
              id="piso-obs" value={observacao} onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex: CCT 2026/2027, cláusula 5ª"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="piso-justificativa">Justificativa da alteração *</Label>
            <Textarea
              id="piso-justificativa" rows={3} value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              placeholder="Ex: correção da data base conforme convenção assinada em 01/05."
            />
            <p className="text-[11px] text-muted-foreground">
              Mínimo de {JUSTIFICATIVA_MIN} caracteres. Fica no histórico de alterações.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => void salvar()} disabled={update.isPending}>
            {update.isPending ? "Salvando..." : "Salvar alteração"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
