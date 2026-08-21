// ------------------------------------------------------------------
// Domínio: DP → Regras de vale-alimentação e vale-transporte.
//
// Mesmo conjunto de campos que a aba Remuneração do colaborador, para o admin
// editar a regra em qualquer uma das duas telas. Aqui a edição é do padrão:
// empresa, unidade ou cargo, com a opção de já aplicar em quem está ativo.
// ------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DpDialogShell } from "@/components/dp/DpDialogShell";
import { ValeCorteFields } from "@/components/dp/beneficios/ValeCorteFields";
import { remuneracaoBlank, type RemuneracaoFormState } from "@/components/dp/RemuneracaoFields";
import {
  DESCONTO_TIPO_LABEL, DIAS_BASE_PADRAO, DIAS_ORIGEM_LABEL, PERIODICIDADE_LABEL,
  type DescontoTipo, type DiasOrigem, type Periodicidade,
} from "@/lib/dp/beneficios-regras";
import {
  aplicarPadrao, extrairPadrao, resolverPadrao,
  type PadraoAlcance,
} from "@/lib/dp/beneficiosPadrao";
import {
  useDpBeneficiosPadroes, useSalvarDpBeneficiosPadrao,
} from "@/hooks/useDpBeneficiosPadrao";
import { useSalvarValeRegrasEmpresa } from "@/hooks/useDpValeRegras";
import type { ValeTipo } from "@/hooks/useDpValeCalculadora";
import { toast } from "sonner";

type Escopo = "empresa" | "unidade" | "cargo";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tipo: ValeTipo;
  unidades: { id: string; nome: string }[];
  cargos: { id: string; nome: string }[];
}

const ROTULO: Record<ValeTipo, string> = {
  va: "Vale-Alimentação",
  vt: "Vale-Transporte",
};

const soDigitos = (v: string) => v.replace(/\D/g, "").slice(0, 2);

export function ValeRegrasDialog({ open, onOpenChange, tipo, unidades, cargos }: Props) {
  const padroes = useDpBeneficiosPadroes();
  const salvarPadrao = useSalvarDpBeneficiosPadrao();
  const salvarEmpresa = useSalvarValeRegrasEmpresa();

  const [escopo, setEscopo] = useState<Escopo>("empresa");
  const [unidadeId, setUnidadeId] = useState<string>("");
  const [cargoId, setCargoId] = useState<string>("");
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

  const set = (patch: Partial<RemuneracaoFormState>) => setForm((f) => ({ ...f, ...patch }));

  const escopoIncompleto =
    (escopo === "unidade" && !unidadeId) || (escopo === "cargo" && !cargoId);

  const salvar = async () => {
    if (escopoIncompleto) {
      toast.error("Escolha a unidade ou o cargo do padrão.");
      return;
    }
    const grupos = [tipo === "va" ? "vale_alimentacao" : "vale_transporte"] as const;
    try {
      await salvarPadrao.mutateAsync({
        unidade_id: alvoUnidade,
        cargo_id: alvoCargo,
        payload: extrairPadrao(form),
        alcance,
        grupos: grupos as any,
      });
      // O padrão da empresa também alimenta a calculadora mensal.
      if (escopo === "empresa") {
        const p = tipo === "va" ? "vale_alimentacao" : "vale_transporte";
        const c = tipo;
        await salvarEmpresa.mutateAsync({
          tipo,
          patch: {
            [`${c}_dia_pagamento`]: (form as any)[`${p}_dia_pagamento`]
              ? Number((form as any)[`${p}_dia_pagamento`])
              : null,
            [`${c}_dias_corte`]: (form as any)[`${p}_dias_corte`]
              ? Number((form as any)[`${p}_dias_corte`])
              : null,
            [`${c}_desconta_falta`]: (form as any)[`${p}_desconta_falta`],
            [`${c}_desconta_folga_extra`]: (form as any)[`${p}_desconta_folga_extra`],
            [`${c}_desconta_atestado`]: (form as any)[`${p}_desconta_atestado`],
            [`${c}_desconta_ferias`]: (form as any)[`${p}_desconta_ferias`],
          },
        });
      }
      toast.success(`Regras do ${ROTULO[tipo]} salvas.`);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível salvar as regras.");
    }
  };

  const salvando = salvarPadrao.isPending || salvarEmpresa.isPending;

  return (
    <DpDialogShell
      open={open}
      onOpenChange={onOpenChange}
      icon={Wallet}
      size="lg"
      title={`Regras do ${ROTULO[tipo]}`}
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

        {tipo === "vt" ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Valor por dia</Label>
              <Input
                inputMode="decimal"
                value={form.vale_transporte_valor_dia}
                onChange={(e) => set({ vale_transporte_valor_dia: e.target.value })}
                placeholder="Ex: 10,40"
              />
            </div>
            <ValeCorteFields
              id="vt_regras"
              valor={{
                diaPagamento: form.vale_transporte_dia_pagamento,
                diasCorte: form.vale_transporte_dias_corte,
                regras: {
                  falta: form.vale_transporte_desconta_falta,
                  folga_extra: form.vale_transporte_desconta_folga_extra,
                  atestado: form.vale_transporte_desconta_atestado,
                  ferias: form.vale_transporte_desconta_ferias,
                },
              }}
              onChange={(patch) =>
                set({
                  ...(patch.diaPagamento !== undefined
                    ? { vale_transporte_dia_pagamento: soDigitos(patch.diaPagamento) }
                    : {}),
                  ...(patch.diasCorte !== undefined
                    ? { vale_transporte_dias_corte: soDigitos(patch.diasCorte) }
                    : {}),
                  ...(patch.regras
                    ? {
                        vale_transporte_desconta_falta: patch.regras.falta,
                        vale_transporte_desconta_folga_extra: patch.regras.folga_extra,
                        vale_transporte_desconta_atestado: patch.regras.atestado,
                        vale_transporte_desconta_ferias: patch.regras.ferias,
                      }
                    : {}),
                })
              }
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Periodicidade</Label>
              <Select
                value={form.vale_alimentacao_periodicidade}
                onValueChange={(v: Periodicidade) => set({ vale_alimentacao_periodicidade: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PERIODICIDADE_LABEL) as Periodicidade[]).map((t) => (
                    <SelectItem key={t} value={t}>{PERIODICIDADE_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>
                {form.vale_alimentacao_periodicidade === "diario" ? "Valor por dia" : "Valor por mês"}
              </Label>
              <Input
                inputMode="decimal"
                value={form.vale_alimentacao_valor}
                onChange={(e) => set({ vale_alimentacao_valor: e.target.value })}
                placeholder="Ex: 25,00"
              />
            </div>
            {form.vale_alimentacao_periodicidade === "diario" && (
              <>
                <div className="space-y-2">
                  <Label>Dias considerados no mês</Label>
                  <Select
                    value={form.vale_alimentacao_dias_origem}
                    onValueChange={(v: DiasOrigem) => set({ vale_alimentacao_dias_origem: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(DIAS_ORIGEM_LABEL) as DiasOrigem[]).map((t) => (
                        <SelectItem key={t} value={t}>{DIAS_ORIGEM_LABEL[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {form.vale_alimentacao_dias_origem === "fixo" && (
                  <div className="space-y-2">
                    <Label>Quantidade de dias</Label>
                    <Input
                      inputMode="numeric"
                      value={form.vale_alimentacao_dias_base}
                      onChange={(e) =>
                        set({ vale_alimentacao_dias_base: e.target.value.replace(/\D/g, "") })
                      }
                      placeholder={String(DIAS_BASE_PADRAO)}
                    />
                  </div>
                )}
              </>
            )}
            <div className="space-y-2">
              <Label>Desconto do colaborador</Label>
              <Select
                value={form.vale_alimentacao_desconto_tipo}
                onValueChange={(v: DescontoTipo) => set({ vale_alimentacao_desconto_tipo: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(DESCONTO_TIPO_LABEL) as DescontoTipo[]).map((t) => (
                    <SelectItem key={t} value={t}>{DESCONTO_TIPO_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.vale_alimentacao_desconto_tipo !== "nenhum" && (
              <div className="space-y-2">
                <Label>
                  {form.vale_alimentacao_desconto_tipo === "percentual"
                    ? "Percentual descontado (%)"
                    : "Valor descontado (R$)"}
                </Label>
                <Input
                  inputMode="decimal"
                  value={form.vale_alimentacao_desconto_valor}
                  onChange={(e) => set({ vale_alimentacao_desconto_valor: e.target.value })}
                  placeholder={
                    form.vale_alimentacao_desconto_tipo === "percentual" ? "1" : "20,00"
                  }
                />
              </div>
            )}
            <ValeCorteFields
              id="va_regras"
              valor={{
                diaPagamento: form.vale_alimentacao_dia_pagamento,
                diasCorte: form.vale_alimentacao_dias_corte,
                regras: {
                  falta: form.vale_alimentacao_desconta_falta,
                  folga_extra: form.vale_alimentacao_desconta_folga_extra,
                  atestado: form.vale_alimentacao_desconta_atestado,
                  ferias: form.vale_alimentacao_desconta_ferias,
                },
              }}
              onChange={(patch) =>
                set({
                  ...(patch.diaPagamento !== undefined
                    ? { vale_alimentacao_dia_pagamento: soDigitos(patch.diaPagamento) }
                    : {}),
                  ...(patch.diasCorte !== undefined
                    ? { vale_alimentacao_dias_corte: soDigitos(patch.diasCorte) }
                    : {}),
                  ...(patch.regras
                    ? {
                        vale_alimentacao_desconta_falta: patch.regras.falta,
                        vale_alimentacao_desconta_folga_extra: patch.regras.folga_extra,
                        vale_alimentacao_desconta_atestado: patch.regras.atestado,
                        vale_alimentacao_desconta_ferias: patch.regras.ferias,
                      }
                    : {}),
                })
              }
            />
          </div>
        )}
      </div>
    </DpDialogShell>
  );
}
