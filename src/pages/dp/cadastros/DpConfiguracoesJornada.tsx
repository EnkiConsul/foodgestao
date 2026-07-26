import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import { Save, Scale, History, Info } from "lucide-react";
import { DpPage, DpPageHeader, DpContentCard } from "@/components/dp/DpPage";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { CienciaLegalDialog } from "@/components/dp/CienciaLegalDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useDpConfigDp, type DpConfigDpForm } from "@/hooks/useDpConfigDp";
import {
  DP_CONFIG_DP_DEFAULT, alertasDeCiencia, padraoLegalDomingo,
  PADRAO_LEGAL_DOMINGO_MULHER, isMenosProtetiva, type AlertaCiencia,
} from "@/lib/dp/dsr-rules";

const num = (v: string, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export default function DpConfiguracoesJornada() {
  const { config, temMulheres, historico, isLoading, isError, refetch, save, saving } = useDpConfigDp();
  const [form, setForm] = useState<DpConfigDpForm>(DP_CONFIG_DP_DEFAULT);
  const [alertas, setAlertas] = useState<AlertaCiencia[]>([]);

  useEffect(() => { setForm(config); }, [config]);

  const padrao = padraoLegalDomingo(form.setor_comercio);
  const set = <K extends keyof DpConfigDpForm>(k: K, v: DpConfigDpForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const persist = async (cienciaConfirmada: boolean, justificativa?: string) => {
    try {
      await save({ patch: form, cienciaConfirmada, justificativa: justificativa || null });
      setAlertas([]);
      toast.success("Regras de jornada atualizadas");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar as regras");
    }
  };

  const handleSave = () => {
    const pendentes = alertasDeCiencia(form, { temMulheres });
    if (pendentes.length > 0) { setAlertas(pendentes); return; }
    void persist(false);
  };

  const historicoRecente = useMemo(() => historico.slice(0, 10), [historico]);

  if (isError) {
    return (
      <DpPage>
        <DpPageHeader title="Regras de jornada e folgas" icon={Scale} />
        <DpErrorState onRetry={refetch} />
      </DpPage>
    );
  }

  return (
    <DpPage>
      <Helmet>
        <title>Regras de jornada e folgas | DP 360°FOOD</title>
        <meta name="description" content="Configure escalas, periodicidade de folga dominical e políticas de sábado e feriado do Departamento Pessoal." />
      </Helmet>

      <DpPageHeader
        title="Regras de jornada e folgas"
        subtitle="Parâmetros de DSR, folga dominical e políticas de fim de semana aplicados a toda a empresa."
        icon={Scale}
        actions={
          <Button onClick={handleSave} disabled={saving || isLoading} className="gap-2">
            <Save className="h-4 w-4" aria-hidden="true" />
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        }
      />

      <DpContentCard title="Folga dominical (DSR)">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 flex items-start justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label htmlFor="setor-comercio" className="text-sm font-medium">Empresa do comércio / food service</Label>
              <p className="text-xs text-muted-foreground">
                Define o padrão legal de referência: {padrao} semana(s) entre folgas dominicais.
              </p>
            </div>
            <Switch
              id="setor-comercio"
              checked={form.setor_comercio}
              onCheckedChange={(v) => set("setor_comercio", v)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="per-domingo">Domingo de folga a cada (semanas)</Label>
            <Input
              id="per-domingo" type="number" min={0} max={12}
              value={form.periodicidade_domingo}
              onChange={(e) => set("periodicidade_domingo", num(e.target.value, padrao))}
            />
            <p className="text-xs text-muted-foreground">
              Padrão legal: {padrao}. Use 0 para não exigir folga dominical.
              {isMenosProtetiva(form.periodicidade_domingo, padrao) && (
                <Badge variant="destructive" className="ml-2">Menos protetiva</Badge>
              )}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="per-domingo-mulher">Domingo de folga — mulheres (semanas)</Label>
            <Input
              id="per-domingo-mulher" type="number" min={0} max={12}
              value={form.periodicidade_domingo_mulher}
              onChange={(e) => set("periodicidade_domingo_mulher", num(e.target.value, PADRAO_LEGAL_DOMINGO_MULHER))}
            />
            <p className="text-xs text-muted-foreground">
              Art. 386 da CLT: quinzenal ({PADRAO_LEGAL_DOMINGO_MULHER} semanas).
              {temMulheres && isMenosProtetiva(form.periodicidade_domingo_mulher, PADRAO_LEGAL_DOMINGO_MULHER) && (
                <Badge variant="destructive" className="ml-2">Menos protetiva</Badge>
              )}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="folgas-fds">Folgas de fim de semana por mês (colaborador)</Label>
            <Input
              id="folgas-fds" type="number" min={0} max={5}
              value={form.folgas_fds_por_mes}
              onChange={(e) => set("folgas_fds_por_mes", num(e.target.value, 1))}
            />
            <p className="text-xs text-muted-foreground">
              Teto de sábados/domingos que o colaborador pode marcar sozinho no portal.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="regra-dsr">Base da regra de DSR</Label>
            <Select value={form.regra_dsr} onValueChange={(v) => set("regra_dsr", v as DpConfigDpForm["regra_dsr"])}>
              <SelectTrigger id="regra-dsr"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="clt">CLT (padrão legal)</SelectItem>
                <SelectItem value="cct">Acordo/Convenção coletiva</SelectItem>
                <SelectItem value="propria">Política própria da empresa</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </DpContentCard>

      <DpContentCard title="Sábados, feriados e menores">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pol-sabado">Política de sábado</Label>
            <Select value={form.politica_sabado} onValueChange={(v) => set("politica_sabado", v as DpConfigDpForm["politica_sabado"])}>
              <SelectTrigger id="pol-sabado"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="trabalha">Sempre trabalha</SelectItem>
                <SelectItem value="folga">Sempre folga</SelectItem>
                <SelectItem value="alterna">Alterna entre colaboradores</SelectItem>
                <SelectItem value="especifica">Definida por jornada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pol-feriado">Política de feriado trabalhado</Label>
            <Select value={form.politica_feriado} onValueChange={(v) => set("politica_feriado", v as DpConfigDpForm["politica_feriado"])}>
              <SelectTrigger id="pol-feriado"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="compensa">Compensa com folga</SelectItem>
                <SelectItem value="dobro">Paga em dobro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-2 flex items-start justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label htmlFor="valida-menor" className="text-sm font-medium">Validar restrições para menores de 18 anos</Label>
              <p className="text-xs text-muted-foreground">
                Bloqueia turno noturno (22h–5h), cargos insalubres/perigosos e carga horária acima do permitido.
              </p>
            </div>
            <Switch
              id="valida-menor"
              checked={form.exige_validacao_menor}
              onCheckedChange={(v) => set("exige_validacao_menor", v)}
            />
          </div>
        </div>
      </DpContentCard>

      <DpContentCard
        title="Histórico de alterações"
        description="Registro imutável de mudanças nas regras, com confirmações de ciência."
      >
        {historicoRecente.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Info className="h-4 w-4" aria-hidden="true" /> Nenhuma alteração registrada ainda.
          </p>
        ) : (
          <ul className="divide-y">
            {historicoRecente.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <History className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="text-muted-foreground">
                  {new Date(h.created_at).toLocaleString("pt-BR")}
                </span>
                <span className="font-medium">{h.tabela}</span>
                {h.ciencia_confirmada && <Badge variant="destructive">Ciência confirmada</Badge>}
                {h.justificativa && (
                  <span className="w-full text-xs text-muted-foreground sm:w-auto">“{h.justificativa}”</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </DpContentCard>

      <CienciaLegalDialog
        open={alertas.length > 0}
        alertas={alertas}
        confirming={saving}
        onCancel={() => setAlertas([])}
        onConfirm={(justificativa) => void persist(true, justificativa)}
      />
    </DpPage>
  );
}
