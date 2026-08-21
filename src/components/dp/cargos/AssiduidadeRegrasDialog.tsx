// ------------------------------------------------------------------
// Domínio: DP → Regras do prêmio de assiduidade.
//
// Mesmos campos da aba Remuneração do colaborador, editados aqui como padrão
// da empresa, de uma unidade ou de um cargo. A ficha do colaborador continua
// podendo abrir exceção individual.
// ------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { Award } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DpDialogShell } from "@/components/dp/DpDialogShell";
import { AssiduidadeFields } from "@/components/dp/AssiduidadeFields";
import { remuneracaoBlank, type RemuneracaoFormState } from "@/components/dp/RemuneracaoFields";
import {
  aplicarPadrao, extrairPadrao, resolverPadrao, type PadraoAlcance,
} from "@/lib/dp/beneficiosPadrao";
import {
  useDpBeneficiosPadroes, useSalvarDpBeneficiosPadrao,
} from "@/hooks/useDpBeneficiosPadrao";

type Escopo = "empresa" | "unidade" | "cargo";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unidades: { id: string; nome: string }[];
  cargos: { id: string; nome: string }[];
}

export function AssiduidadeRegrasDialog({ open, onOpenChange, unidades, cargos }: Props) {
  const padroes = useDpBeneficiosPadroes();
  const salvarPadrao = useSalvarDpBeneficiosPadrao();

  const [escopo, setEscopo] = useState<Escopo>("empresa");
  const [unidadeId, setUnidadeId] = useState("");
  const [cargoId, setCargoId] = useState("");
  const [alcance, setAlcance] = useState<PadraoAlcance>("todos");
  const [form, setForm] = useState<RemuneracaoFormState>(remuneracaoBlank);

  const alvoUnidade = escopo === "empresa" ? null : unidadeId || null;
  const alvoCargo = escopo === "cargo" ? cargoId || null : null;

  const padraoAtual = useMemo(
    () => resolverPadrao(padroes.data, alvoUnidade, alvoCargo),
    [padroes.data, alvoUnidade, alvoCargo],
  );

  // Cada troca de escopo recarrega a regra que vale naquele nível.
  useEffect(() => {
    if (!open) return;
    setForm(aplicarPadrao(remuneracaoBlank, padraoAtual?.payload));
  }, [open, padraoAtual]);

  useEffect(() => {
    if (open) setEscopo("empresa");
  }, [open]);

  const escopoIncompleto = (escopo === "unidade" && !unidadeId) || (escopo === "cargo" && !cargoId);

  const salvar = async () => {
    if (escopoIncompleto) {
      toast.error("Escolha a unidade ou o cargo do padrão.");
      return;
    }
    try {
      await salvarPadrao.mutateAsync({
        unidade_id: alvoUnidade,
        cargo_id: alvoCargo,
        payload: extrairPadrao(form),
        alcance,
        grupos: ["assiduidade"],
      });
      toast.success("Regras do prêmio de assiduidade salvas.");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível salvar as regras.");
    }
  };

  const salvando = salvarPadrao.isPending;

  return (
    <DpDialogShell
      open={open}
      onOpenChange={onOpenChange}
      icon={Award}
      size="lg"
      title="Regras do Prêmio de Assiduidade"
      description="Mesmos campos da aba Remuneração do colaborador. O que for salvo aqui vale como padrão e pode ser ajustado caso a caso na ficha."
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar Regras"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Este padrão vale para</Label>
            <Select value={escopo} onValueChange={(v: Escopo) => setEscopo(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="empresa">Empresa inteira</SelectItem>
                <SelectItem value="unidade">Uma unidade</SelectItem>
                <SelectItem value="cargo">Um cargo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {escopo !== "empresa" && (
            <div className="space-y-2">
              <Label>{escopo === "unidade" ? "Unidade" : "Cargo"}</Label>
              {escopo === "unidade" ? (
                <Select value={unidadeId} onValueChange={setUnidadeId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {unidades.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={cargoId} onValueChange={setCargoId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {cargos.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label>Aplicar em</Label>
            <Select value={alcance} onValueChange={(v: PadraoAlcance) => setAlcance(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Colaboradores ativos e próximos cadastros</SelectItem>
                <SelectItem value="novos">Só os próximos cadastros</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-xl border border-border p-3">
          <AssiduidadeFields
            value={form}
            onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
            idPrefix="assid_regra"
          />
        </div>
      </div>
    </DpDialogShell>
  );
}
