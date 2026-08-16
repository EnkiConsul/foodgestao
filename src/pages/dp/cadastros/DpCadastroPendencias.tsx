import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import { BellRing, Save, Info } from "lucide-react";
import { DpPage, DpPageHeader, DpContentCard } from "@/components/dp/DpPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useDpPendenciasConfig,
  DP_PENDENCIAS_CONFIG_DEFAULT,
  type DpPendenciasConfig,
} from "@/hooks/useDpPendenciasConfig";

const PRAZO_FIELDS: Array<{
  key: keyof DpPendenciasConfig;
  label: string;
  helper: string;
  min: number;
  max: number;
}> = [
  { key: "alerta_solicitacao_dias", label: "Solicitações (dias para responder)", helper: "Dias após a criação da solicitação até virar pendência atrasada.", min: 1, max: 30 },
  { key: "alerta_troca_dias", label: "Trocas (dias para aprovação do gestor)", helper: "Dias após a criação da troca até virar pendência atrasada.", min: 1, max: 30 },
  { key: "alerta_contracheque_dia_mes", label: "Contracheque (dia limite do mês)", helper: "A partir desse dia do mês, cobra o contracheque do mês anterior por unidade.", min: 1, max: 31 },
  { key: "alerta_adiantamento_offset", label: "Adiantamento (dias após o dia de pagamento)", helper: "Somado ao 'dia_adiantamento' da unidade. Ex.: 5 → cobra 5 dias após.", min: 1, max: 31 },
  { key: "alerta_folha_ponto_dia_mes", label: "Folha de ponto (dia limite do mês)", helper: "A partir desse dia do mês, cobra a folha de ponto do mês anterior por unidade com relógio.", min: 1, max: 31 },
  { key: "alerta_ferias_dias", label: "Férias (dias antes do limite concessivo)", helper: "Janela para alertar sobre períodos aquisitivos com saldo prestes a vencer.", min: 1, max: 365 },
  { key: "alerta_aso_dias", label: "Exames ASO (dias antes do vencimento)", helper: "Janela para alertar exames ocupacionais prestes a vencer.", min: 1, max: 180 },
  { key: "alerta_epi_dias", label: "EPIs (dias antes da troca prevista)", helper: "Janela para alertar EPIs que precisam ser trocados.", min: 1, max: 180 },
  { key: "alerta_treinamento_dias", label: "Treinamentos (dias antes do vencimento)", helper: "Janela para alertar treinamentos que precisam ser renovados.", min: 1, max: 365 },
  { key: "alerta_negociacao_dias", label: "Negociação coletiva (dias antes do vencimento)", helper: "Janela para começar a alertar antes do vencimento anual da última negociação.", min: 1, max: 180 },
  { key: "dias_carencia_portal", label: "Acesso ao portal após desligamento (dias)", helper: "Dias após a data de demissão em que o colaborador ainda pode acessar o portal apenas para baixar documentos.", min: 0, max: 180 },

];

export default function DpCadastroPendencias() {
  const { config, save, saving, isLoading } = useDpPendenciasConfig();
  const [form, setForm] = useState<DpPendenciasConfig>(DP_PENDENCIAS_CONFIG_DEFAULT);

  useEffect(() => {
    if (!isLoading) setForm(config);
  }, [isLoading, config]);

  const handleSave = () => {
    for (const f of PRAZO_FIELDS) {
      const v = Number(form[f.key]);
      if (!Number.isFinite(v) || v < f.min || v > f.max) {
        return toast.error(`Valor inválido em "${f.label}"`, {
          description: `Use um número entre ${f.min} e ${f.max}.`,
        });
      }
    }
    save(form, {
      onSuccess: () => toast.success("Prazos de lembrete atualizados"),
      onError: (e: any) => toast.error("Erro ao salvar", { description: e?.message ?? String(e) }),
    } as any);
  };

  return (
    <DpPage>
      <Helmet><title>Pendências — Cadastro — Pessoas 360°</title></Helmet>
      <DpPageHeader
        icon={BellRing}
        title="Prazos de pendências"
        description="Configure, por empresa, os prazos usados no quadro de pendências da home do DP."
      />

      <DpContentCard>
        <div className="mb-4 flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>
            Os prazos abaixo se aplicam à empresa selecionada no contexto ativo (PF/PJ).
            Alterações reagem imediatamente no quadro de pendências e nos alertas do painel.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {PRAZO_FIELDS.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label className="text-xs">{f.label}</Label>
              <Input
                type="number"
                min={f.min}
                max={f.max}
                value={form[f.key] ?? ""}
                onChange={(e) => setForm({ ...form, [f.key]: Number(e.target.value) })}
              />
              <p className="text-[11px] text-muted-foreground">{f.helper}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={handleSave} disabled={saving || isLoading}>
            <Save className="mr-2 size-4" /> Salvar prazos
          </Button>
        </div>
      </DpContentCard>
    </DpPage>
  );
}
