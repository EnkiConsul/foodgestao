import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import { Save, Scale, History, Info, Store, Trash2 } from "lucide-react";
import { DpPage, DpPageHeader, DpContentCard } from "@/components/dp/DpPage";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { FeriasRegrasSection } from "@/components/dp/ferias/FeriasRegrasSection";
import { CienciaLegalDialog } from "@/components/dp/CienciaLegalDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpUnidades } from "@/hooks/useDpCadastros";
import { useDpConfigDp, type DpConfigDpForm } from "@/hooks/useDpConfigDp";
import {
  DP_CONFIG_DP_DEFAULT, alertasDeCiencia, padraoLegalDomingo, isMenosProtetiva,
  semanasDaConfig, MODO_FREQUENCIA_LABEL, DIA_SEMANA_CURTO,
  PADRAO_LEGAL_DOMINGO_MULHER, type AlertaCiencia, type ModoFrequencia,
} from "@/lib/dp/dsr-rules";

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <DpContentCard contentClassName="space-y-4 p-4 md:p-5">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </DpContentCard>
  );
}

const num = (v: string, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const PADRAO = "__padrao__";

export default function DpConfiguracoesJornada() {
  const { selectedCompanyId } = useCompanyContext();
  const [unidadeId, setUnidadeId] = useState<string | null>(null);
  const {
    config, configPadrao, temExcecao, temMulheres, negociacoes, historico,
    isLoading, isError, refetch, save, saving, removerExcecao, removendo,
  } = useDpConfigDp(unidadeId);
  const { data: todasUnidades = [] } = useDpUnidades();
  const unidades = useMemo(
    () => todasUnidades.filter((u) => u.company_id === selectedCompanyId),
    [todasUnidades, selectedCompanyId],
  );

  const [form, setForm] = useState<DpConfigDpForm>(DP_CONFIG_DP_DEFAULT);
  const [alertas, setAlertas] = useState<AlertaCiencia[]>([]);

  useEffect(() => { setForm(config); }, [config]);

  const padrao = padraoLegalDomingo(form.setor_comercio);
  const semanas = semanasDaConfig(form);
  const herdando = !!unidadeId && !temExcecao;
  const porAcordo = form.tipo_descanso_domingo === "acordo_coletivo";

  const set = <K extends keyof DpConfigDpForm>(k: K, v: DpConfigDpForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const toggleDia = (dia: number) => {
    setForm((f) => {
      const atual = f.dias_descanso_negociados ?? [];
      const proximo = atual.includes(dia) ? atual.filter((d) => d !== dia) : [...atual, dia];
      return { ...f, dias_descanso_negociados: proximo.sort((a, b) => a - b) };
    });
  };

  const persist = async (cienciaConfirmada: boolean, justificativa?: string) => {
    try {
      await save({ patch: form, unidadeId, cienciaConfirmada, justificativa: justificativa || null });
      setAlertas([]);
      toast.success(unidadeId ? "Regras da unidade atualizadas" : "Regras da empresa atualizadas");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar as regras");
    }
  };

  const handleSave = () => {
    if (porAcordo && !form.negociacao_id) {
      toast.error("Vincule um acordo ou convenção coletiva para usar esse modo de descanso.");
      return;
    }
    if (porAcordo && (form.dias_descanso_negociados ?? []).length === 0) {
      toast.error("Selecione ao menos um dia de descanso negociado.");
      return;
    }
    const pendentes = alertasDeCiencia(form, { temMulheres });
    if (pendentes.length > 0) { setAlertas(pendentes); return; }
    void persist(false);
  };

  const handleRemoverExcecao = async () => {
    if (!unidadeId) return;
    try {
      await removerExcecao(unidadeId);
      setForm(configPadrao);
      toast.success("Exceção removida — a unidade volta a seguir a regra da empresa.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível remover a exceção");
    }
  };

  const historicoRecente = useMemo(() => historico.slice(0, 10), [historico]);

  if (isError) {
    return (
      <DpPage>
        <DpPageHeader title="Regras De Folgas" icon={Scale} />
        <DpErrorState onRetry={refetch} />
      </DpPage>
    );
  }

  return (
    <DpPage>
      <Helmet>
        <title>Regras De Folgas | DP 360°FOOD</title>
        <meta name="description" content="Configure a periodicidade de folga dominical, o descanso por acordo coletivo e as regras de férias do Departamento Pessoal, por empresa ou por unidade." />
      </Helmet>

      <DpPageHeader
        title="Regras De Folgas"
        description="Parâmetros de DSR, folga dominical e férias — aplicados a toda a empresa ou por unidade de loja."
        icon={Scale}
        actions={
          <Button onClick={handleSave} disabled={saving || isLoading} className="gap-2">
            <Save className="h-4 w-4" aria-hidden="true" />
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        }
      />

      <Section
        title="Regra aplicada a"
        description="A regra da unidade prevalece sobre a regra padrão da empresa. Unidades sem exceção seguem o padrão."
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="alvo-regra">Escopo</Label>
            <Select
              value={unidadeId ?? PADRAO}
              onValueChange={(v) => setUnidadeId(v === PADRAO ? null : v)}
            >
              <SelectTrigger id="alvo-regra"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={PADRAO}>Todas as unidades (padrão da empresa)</SelectItem>
                {unidades.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {unidadeId && (
            <div className="flex flex-wrap items-center gap-2">
              {herdando ? (
                <Badge variant="outline" className="gap-1">
                  <Store className="h-3.5 w-3.5" aria-hidden="true" /> Herdando o padrão da empresa
                </Badge>
              ) : (
                <>
                  <Badge className="gap-1">
                    <Store className="h-3.5 w-3.5" aria-hidden="true" /> Exceção própria
                  </Badge>
                  <Button
                    variant="outline" size="sm" className="gap-2"
                    onClick={() => void handleRemoverExcecao()} disabled={removendo}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" /> Remover exceção
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
        {herdando && (
          <p className="text-xs text-muted-foreground">
            Ajuste os campos abaixo e clique em Salvar para criar uma exceção só para esta unidade.
          </p>
        )}
      </Section>

      <Section
        title="Descanso Dominical"
        description="Define se o descanso semanal segue a legislação ou um acordo/convenção coletiva vigente."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tipo-descanso">Base do descanso dominical</Label>
            <Select
              value={form.tipo_descanso_domingo}
              onValueChange={(v) => {
                const tipo = v as DpConfigDpForm["tipo_descanso_domingo"];
                setForm((f) => ({
                  ...f,
                  tipo_descanso_domingo: tipo,
                  dias_descanso_negociados: tipo === "legal" ? [0] : f.dias_descanso_negociados,
                  negociacao_id: tipo === "legal" ? null : f.negociacao_id,
                }));
              }}
            >
              <SelectTrigger id="tipo-descanso"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="legal">Conforme legislação (domingo estrito)</SelectItem>
                <SelectItem value="acordo_coletivo">Acordo coletivo (dias negociados)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              No modo acordo coletivo, a folga nos dias negociados abaixo conta como descanso semanal.
            </p>
          </div>

          {porAcordo && (
            <div className="space-y-1.5">
              <Label htmlFor="negociacao">Acordo / convenção vinculada</Label>
              <Select
                value={form.negociacao_id ?? "none"}
                onValueChange={(v) => set("negociacao_id", v === "none" ? null : v)}
              >
                <SelectTrigger id="negociacao"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {negociacoes.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.tipo_documento.toUpperCase()} · {n.vigencia_inicio}
                      {n.vigencia_fim ? ` a ${n.vigencia_fim}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!form.negociacao_id && (
                <p className="text-xs text-destructive">
                  Obrigatório vincular uma negociação sindical para usar o modo acordo coletivo.
                </p>
              )}
              {negociacoes.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhuma negociação cadastrada em Sindicatos → ACT/CCT.
                </p>
              )}
            </div>
          )}

          {porAcordo && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Dias de descanso negociados</Label>
              <ToggleGroup
                type="multiple"
                className="flex flex-wrap justify-start gap-1"
                value={(form.dias_descanso_negociados ?? []).map(String)}
                onValueChange={() => { /* controlado item a item */ }}
              >
                {DIA_SEMANA_CURTO.map((label, dia) => (
                  <ToggleGroupItem
                    key={dia}
                    value={String(dia)}
                    aria-label={label}
                    className="h-9 min-w-12 px-3"
                    onClick={() => toggleDia(dia)}
                  >
                    {label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-xs text-muted-foreground">
                Folga em qualquer dia marcado é contabilizada como descanso semanal negociado.
              </p>
            </div>
          )}
        </div>
      </Section>

      <Section title="Folga dominical (DSR)">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 flex items-start justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label htmlFor="setor-comercio" className="text-sm font-medium">Empresa do comércio / food service</Label>
              <p className="text-xs text-muted-foreground">
                Define o padrão legal de referência ({padrao} semana(s)).
              </p>
            </div>
            <Switch
              id="setor-comercio"
              checked={form.setor_comercio}
              onCheckedChange={(v) => set("setor_comercio", v)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="modo-freq">Modelo de frequência</Label>
            <Select
              value={form.modo_frequencia_domingo}
              onValueChange={(v) => set("modo_frequencia_domingo", v as ModoFrequencia)}
            >
              <SelectTrigger id="modo-freq"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(MODO_FREQUENCIA_LABEL) as ModoFrequencia[]).map((m) => (
                  <SelectItem key={m} value={m}>{MODO_FREQUENCIA_LABEL[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Apenas um modelo vale por vez.
            </p>
          </div>

          {form.modo_frequencia_domingo === "semanas" ? (
            <div className="space-y-1.5">
              <Label htmlFor="per-domingo">Domingo de folga a cada (semanas)</Label>
              <Input
                id="per-domingo" type="number" min={0} max={12}
                value={form.periodicidade_domingo}
                onChange={(e) => set("periodicidade_domingo", num(e.target.value, padrao))}
              />
              <p className="text-xs text-muted-foreground">
                Padrão legal: {padrao}. Use 0 para não exigir folga dominical.
                {isMenosProtetiva(semanas.geral, padrao) && (
                  <Badge variant="destructive" className="ml-2">Menos protetiva</Badge>
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="dom-mes">Domingos de folga por mês</Label>
              <Select
                value={String(form.domingos_por_mes)}
                onValueChange={(v) => set("domingos_por_mes", Number(v))}
              >
                <SelectTrigger id="dom-mes"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.5">1 a cada 2 meses</SelectItem>
                  <SelectItem value="1">1 por mês</SelectItem>
                  <SelectItem value="2">2 por mês</SelectItem>
                  <SelectItem value="3">3 por mês</SelectItem>
                  <SelectItem value="4">Todo domingo</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Equivale a 1 domingo a cada {semanas.geral ? semanas.geral.toFixed(1) : "—"} semana(s).
                {isMenosProtetiva(semanas.geral, padrao) && (
                  <Badge variant="destructive" className="ml-2">Menos protetiva</Badge>
                )}
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="modo-freq-mulher">Modelo de frequência — mulheres</Label>
            <Select
              value={form.modo_frequencia_domingo_mulher}
              onValueChange={(v) => set("modo_frequencia_domingo_mulher", v as ModoFrequencia)}
            >
              <SelectTrigger id="modo-freq-mulher"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(MODO_FREQUENCIA_LABEL) as ModoFrequencia[]).map((m) => (
                  <SelectItem key={m} value={m}>{MODO_FREQUENCIA_LABEL[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Art. 386 da CLT: quinzenal.</p>
          </div>

          {form.modo_frequencia_domingo_mulher === "semanas" ? (
            <div className="space-y-1.5">
              <Label htmlFor="per-domingo-mulher">Domingo de folga — mulheres (semanas)</Label>
              <Input
                id="per-domingo-mulher" type="number" min={0} max={12}
                value={form.periodicidade_domingo_mulher}
                onChange={(e) => set("periodicidade_domingo_mulher", num(e.target.value, PADRAO_LEGAL_DOMINGO_MULHER))}
              />
              <p className="text-xs text-muted-foreground">
                Padrão legal: {PADRAO_LEGAL_DOMINGO_MULHER} semanas.
                {temMulheres && isMenosProtetiva(semanas.mulher, PADRAO_LEGAL_DOMINGO_MULHER) && (
                  <Badge variant="destructive" className="ml-2">Menos protetiva</Badge>
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="dom-mes-mulher">Domingos por mês — mulheres</Label>
              <Select
                value={String(form.domingos_por_mes_mulher)}
                onValueChange={(v) => set("domingos_por_mes_mulher", Number(v))}
              >
                <SelectTrigger id="dom-mes-mulher"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.5">1 a cada 2 meses</SelectItem>
                  <SelectItem value="1">1 por mês</SelectItem>
                  <SelectItem value="2">2 por mês</SelectItem>
                  <SelectItem value="3">3 por mês</SelectItem>
                  <SelectItem value="4">Todo domingo</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Equivale a 1 domingo a cada {semanas.mulher ? semanas.mulher.toFixed(1) : "—"} semana(s).
                {temMulheres && isMenosProtetiva(semanas.mulher, PADRAO_LEGAL_DOMINGO_MULHER) && (
                  <Badge variant="destructive" className="ml-2">Menos protetiva</Badge>
                )}
              </p>
            </div>
          )}

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
      </Section>

      <FeriasRegrasSection />

      <Section
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
      </Section>

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
