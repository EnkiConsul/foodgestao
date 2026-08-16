import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, Scale, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useUpsertDpSindicato } from "@/hooks/useDpCadastros";
import { supabase } from "@/integrations/supabase/client";
import { maskCnpj } from "@/lib/cnpj";
import { maskPhone } from "@/lib/phone";

const onlyDigits = (v: string) => v.replace(/\D/g, "");
const emailOk = (v: string) => !v.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

interface CamposSindicato {
  nome: string;
  cnpj: string;
  whatsapp: string;
  dataBase: string;
  contatoNome: string;
  contatoEmail: string;
}

const vazio: CamposSindicato = {
  nome: "", cnpj: "", whatsapp: "", dataBase: "", contatoNome: "", contatoEmail: "",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Cargo que receberá o vínculo laboral. */
  cargoId: string;
  cargoNome?: string | null;
  /** Unidade que receberá o vínculo patronal. */
  unidadeId?: string;
  unidadeNome?: string | null;
  /** O cargo ainda não tem sindicato laboral. */
  faltaLaboral: boolean;
  /** A unidade ainda não tem sindicato patronal. */
  faltaPatronal: boolean;
  /** Devolve o sindicato laboral criado para enquadrar o colaborador. */
  onCreated: (sindicato: { id: string; nome: string }) => void;
}

/**
 * Cadastro completo de sindicato (laboral e/ou patronal) direto do cadastro do
 * colaborador — mesmos dados da tela de Sindicatos, já criando os vínculos.
 */
export function SindicatoQuickFormDialog({
  open, onOpenChange, cargoId, cargoNome, unidadeId, unidadeNome,
  faltaLaboral, faltaPatronal, onCreated,
}: Props) {
  const upsert = useUpsertDpSindicato();
  const qc = useQueryClient();
  const [usarLaboral, setUsarLaboral] = useState(faltaLaboral);
  const [usarPatronal, setUsarPatronal] = useState(faltaPatronal);
  const [laboral, setLaboral] = useState<CamposSindicato>(vazio);
  const [patronal, setPatronal] = useState<CamposSindicato>(vazio);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLaboral(vazio);
    setPatronal(vazio);
    setUsarLaboral(faltaLaboral);
    setUsarPatronal(faltaPatronal && !!unidadeId);
  }, [open, faltaLaboral, faltaPatronal, unidadeId]);

  const criar = async (c: CamposSindicato, tipo: "laboral" | "patronal") =>
    upsert.mutateAsync({
      nome: c.nome.trim(),
      cnpj: c.cnpj ? onlyDigits(c.cnpj) : null,
      contato_telefone: c.whatsapp ? onlyDigits(c.whatsapp) : null,
      contato_nome: c.contatoNome.trim() || null,
      contato_email: c.contatoEmail.trim() || null,
      data_base: c.dataBase || null,
      tipo,
    } as Parameters<typeof upsert.mutateAsync>[0]);

  const salvar = async () => {
    if (!usarLaboral && !usarPatronal) {
      toast.error("Ative pelo menos um sindicato para cadastrar");
      return;
    }
    if (usarLaboral) {
      if (!laboral.nome.trim()) { toast.error("Nome do sindicato laboral é obrigatório"); return; }
      if (!cargoId) { toast.error("Selecione o cargo antes de cadastrar o sindicato laboral"); return; }
      if (!emailOk(laboral.contatoEmail)) { toast.error("E-mail do contato laboral inválido"); return; }
    }
    if (usarPatronal) {
      if (!patronal.nome.trim()) { toast.error("Nome do sindicato patronal é obrigatório"); return; }
      if (!unidadeId) { toast.error("Selecione a unidade antes de cadastrar o sindicato patronal"); return; }
      if (!emailOk(patronal.contatoEmail)) { toast.error("E-mail do contato patronal inválido"); return; }
    }

    setSalvando(true);
    try {
      let laboralId: string | null = null;

      if (usarLaboral) {
        laboralId = await criar(laboral, "laboral");
        const { error } = await supabase
          .from("dp_sindicato_cargos")
          .insert({ sindicato_id: laboralId, cargo_id: cargoId });
        if (error) throw error;
      }

      if (usarPatronal) {
        const patronalId = await criar(patronal, "patronal");
        const { error } = await supabase
          .from("dp_sindicato_unidades")
          .insert({ sindicato_id: patronalId, unidade_id: unidadeId! });
        if (error) throw error;
      }

      for (const key of [
        "dp_sindicatos", "dp_sindicato_vinculos", "dp_sindicato_do_cargo",
        "dp_sindicato_contexto_unidade", "dp_cargos", "dp_colaboradores",
      ]) {
        qc.invalidateQueries({ queryKey: [key] });
      }

      toast.success(
        usarLaboral && usarPatronal
          ? "Sindicatos laboral e patronal cadastrados e vinculados"
          : usarLaboral
            ? "Sindicato laboral cadastrado e vinculado ao cargo"
            : "Sindicato patronal cadastrado e vinculado à unidade",
      );
      if (laboralId) onCreated({ id: laboralId, nome: laboral.nome.trim() });
      onOpenChange(false);
    } catch (e) {
      toast.error("Não foi possível cadastrar o sindicato", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSalvando(false);
    }
  };

  const Campos = ({
    valor, set, prefixo,
  }: { valor: CamposSindicato; set: (c: CamposSindicato) => void; prefixo: string }) => (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Nome *</Label>
        <Input
          value={valor.nome}
          onChange={(e) => set({ ...valor, nome: e.target.value })}
          placeholder={prefixo}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>CNPJ</Label>
          <Input
            value={valor.cnpj}
            onChange={(e) => set({ ...valor, cnpj: maskCnpj(e.target.value) })}
            placeholder="00.000.000/0000-00"
            maxLength={18}
          />
        </div>
        <div className="space-y-1.5">
          <Label>WhatsApp</Label>
          <Input
            value={valor.whatsapp}
            onChange={(e) => set({ ...valor, whatsapp: maskPhone(e.target.value) })}
            placeholder="(62) 99999-9999"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Data-base</Label>
          <Input
            type="date"
            value={valor.dataBase}
            onChange={(e) => set({ ...valor, dataBase: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Nome do contato</Label>
          <Input
            value={valor.contatoNome}
            onChange={(e) => set({ ...valor, contatoNome: e.target.value })}
            placeholder="Responsável no sindicato"
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label>E-mail do contato</Label>
          <Input
            type="email"
            value={valor.contatoEmail}
            onChange={(e) => set({ ...valor, contatoEmail: e.target.value })}
            placeholder="contato@sindicato.org.br"
          />
        </div>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-primary" />
            Cadastrar Sindicatos
          </DialogTitle>
          <DialogDescription>
            Preencha aqui tudo o que o sindicato precisa: os registros nascem completos e já
            aparecem na tela de Sindicatos, sem precisar complementar depois.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <section className="space-y-3 rounded-xl border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4 text-primary" />
                Sindicato Laboral
                <span className="text-xs font-normal text-muted-foreground">
                  {cargoNome ? `vínculo com o cargo ${cargoNome}` : "vínculo com o cargo"}
                </span>
              </div>
              <Switch checked={usarLaboral} onCheckedChange={setUsarLaboral} disabled={!cargoId} />
            </div>
            {usarLaboral && (
              <Campos
                valor={laboral}
                set={setLaboral}
                prefixo="Ex: Sindicato dos Trabalhadores em Alimentação"
              />
            )}
          </section>

          <section className="space-y-3 rounded-xl border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Building2 className="h-4 w-4 text-primary" />
                Sindicato Patronal
                <span className="text-xs font-normal text-muted-foreground">
                  {unidadeNome ? `vínculo com a unidade ${unidadeNome}` : "vínculo com a unidade"}
                </span>
              </div>
              <Switch
                checked={usarPatronal}
                onCheckedChange={setUsarPatronal}
                disabled={!unidadeId}
              />
            </div>
            {!unidadeId ? (
              <p className="text-[11px] text-muted-foreground">
                Selecione a unidade do colaborador para cadastrar o sindicato patronal.
              </p>
            ) : (
              usarPatronal && (
                <Campos
                  valor={patronal}
                  set={setPatronal}
                  prefixo="Ex: Sindicato de Hotéis, Bares e Restaurantes"
                />
              )
            )}
          </section>
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
