import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useUpsertDpCargo, type DpCargo } from "@/hooks/useDpCadastros";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nome sugerido (usado quando o cargo nasce de uma variação). */
  nomeInicial?: string;
  /** Salário de referência sugerido, em reais. */
  salarioInicial?: number | null;
  onCreated: (cargo: DpCargo) => void;
}

/** Criação de cargo sem sair do cadastro do colaborador. */
export function CargoQuickCreateDialog({
  open, onOpenChange, nomeInicial = "", salarioInicial = null, onCreated,
}: Props) {
  const upsert = useUpsertDpCargo();
  const [nome, setNome] = useState(nomeInicial);
  const [cbo, setCbo] = useState("");
  const [insalubre, setInsalubre] = useState(false);
  const [salario, setSalario] = useState(salarioInicial ? String(salarioInicial).replace(".", ",") : "");

  useEffect(() => {
    if (!open) return;
    setNome(nomeInicial);
    setCbo("");
    setInsalubre(false);
    setSalario(salarioInicial ? String(salarioInicial).replace(".", ",") : "");
  }, [open, nomeInicial, salarioInicial]);

  const salvar = async () => {
    if (!nome.trim()) { toast.error("Informe o nome do cargo"); return; }
    const valor = Number(salario.replace(/\./g, "").replace(",", ".")) || 0;
    try {
      const cargo = await upsert.mutateAsync({
        nome: nome.trim(),
        cbo: cbo.trim() || null,
        insalubre_periculoso: insalubre,
        salario_base: valor > 0 ? valor : null,
      } as Parameters<typeof upsert.mutateAsync>[0]);
      toast.success("Cargo criado e selecionado");
      onCreated(cargo);
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Não foi possível criar o cargo", {
        description: msg.includes("23505") ? "Já existe um cargo com este nome." : msg,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" aria-hidden="true" />
            Novo cargo
          </DialogTitle>
          <DialogDescription>
            O cargo criado aqui já fica disponível na tela de Cargos para os próximos cadastros.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cargo-nome">Nome do cargo *</Label>
            <Input
              id="cargo-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Atendente"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="cargo-salario">Salário de referência</Label>
              <Input
                id="cargo-salario"
                inputMode="decimal"
                value={salario}
                onChange={(e) => setSalario(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cargo-cbo">CBO</Label>
              <Input
                id="cargo-cbo"
                value={cbo}
                onChange={(e) => setCbo(e.target.value)}
                placeholder="Opcional"
              />
            </div>
          </div>
          <label className="flex items-center gap-3 rounded-lg border p-3 text-sm">
            <Switch checked={insalubre} onCheckedChange={setInsalubre} aria-label="Insalubre ou periculoso" />
            Atividade insalubre ou perigosa
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => void salvar()} disabled={upsert.isPending}>
            {upsert.isPending ? "Criando..." : "Criar cargo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
