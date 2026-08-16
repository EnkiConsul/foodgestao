import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Scale } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useUpsertDpSindicato } from "@/hooks/useDpCadastros";
import { supabase } from "@/integrations/supabase/client";
import { maskCnpj } from "@/lib/cnpj";
import { maskPhone } from "@/lib/phone";

const onlyDigits = (v: string) => v.replace(/\D/g, "");

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Cargo que receberá o vínculo laboral. */
  cargoId: string;
  cargoNome?: string | null;
  /** Devolve o sindicato criado para enquadrar o colaborador. */
  onCreated: (sindicato: { id: string; nome: string }) => void;
}

/**
 * Cadastro de sindicato laboral direto do cadastro do colaborador — mesmos
 * campos da tela de Sindicatos, já vinculando o cargo selecionado.
 */
export function SindicatoQuickFormDialog({
  open, onOpenChange, cargoId, cargoNome, onCreated,
}: Props) {
  const upsert = useUpsertDpSindicato();
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [dataBase, setDataBase] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNome("");
    setCnpj("");
    setWhatsapp("");
    setDataBase("");
  }, [open]);

  const salvar = async () => {
    if (!nome.trim()) { toast.error("Nome do sindicato é obrigatório"); return; }
    if (!cargoId) { toast.error("Selecione o cargo antes de cadastrar o sindicato"); return; }
    setSalvando(true);
    try {
      const sindicatoId = await upsert.mutateAsync({
        nome: nome.trim(),
        cnpj: cnpj ? onlyDigits(cnpj) : null,
        contato_telefone: whatsapp ? onlyDigits(whatsapp) : null,
        data_base: dataBase || null,
        tipo: "laboral",
      } as Parameters<typeof upsert.mutateAsync>[0]);

      const { error } = await supabase
        .from("dp_sindicato_cargos")
        .insert({ sindicato_id: sindicatoId, cargo_id: cargoId });
      if (error) throw error;

      qc.invalidateQueries({ queryKey: ["dp_sindicatos"] });
      qc.invalidateQueries({ queryKey: ["dp_sindicato_vinculos"] });
      qc.invalidateQueries({ queryKey: ["dp_sindicato_do_cargo"] });
      qc.invalidateQueries({ queryKey: ["dp_cargos"] });

      toast.success("Sindicato cadastrado e vinculado ao cargo");
      onCreated({ id: sindicatoId, nome: nome.trim() });
      onOpenChange(false);
    } catch (e) {
      toast.error("Não foi possível cadastrar o sindicato", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-primary" />
            Novo Sindicato Laboral
          </DialogTitle>
          <DialogDescription>
            {cargoNome
              ? `O sindicato será vinculado ao cargo ${cargoNome} e ficará disponível na tela de Sindicatos.`
              : "O sindicato ficará disponível também na tela de Sindicatos."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Sindicato dos Trabalhadores em Alimentação"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>CNPJ</Label>
              <Input
                value={cnpj}
                onChange={(e) => setCnpj(maskCnpj(e.target.value))}
                placeholder="00.000.000/0000-00"
                maxLength={18}
              />
            </div>
            <div className="space-y-1.5">
              <Label>WhatsApp</Label>
              <Input
                value={whatsapp}
                onChange={(e) => setWhatsapp(maskPhone(e.target.value))}
                placeholder="(62) 99999-9999"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Data-base</Label>
            <Input type="date" value={dataBase} onChange={(e) => setDataBase(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">
              Mês de referência da convenção coletiva. Pode ser completado depois na tela de Sindicatos.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando..." : "Cadastrar e vincular"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
