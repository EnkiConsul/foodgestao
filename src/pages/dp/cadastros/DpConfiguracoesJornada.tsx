import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import { Save, Scale, Info, Store, Trash2, Landmark } from "lucide-react";
import { DpPage, DpPageHeader, DpContentCard, useDpEmbedded } from "@/components/dp/DpPage";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { CienciaLegalDialog } from "@/components/dp/CienciaLegalDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpUnidades } from "@/hooks/useDpCadastros";
import { useDpConfigDp, type DpConfigDpForm } from "@/hooks/useDpConfigDp";
import { useSindicatoContextoUnidade } from "@/hooks/useSindicatoContextoUnidade";
import { MenosProtetivaBadge } from "@/components/dp/MenosProtetivaBadge";
import {
  DP_CONFIG_DP_DEFAULT, alertasDeCiencia, padraoLegalDomingo, isMenosProtetiva,
  semanasDaConfig, MODO_FREQUENCIA_LABEL, DIA_SEMANA_CURTO, ORDEM_DIAS_SEG_DOM,
  padroesCltDe, PADRAO_LEGAL_DOMINGO_MULHER, resumoEscolhaFolgas,
  type AlertaCiencia, type ModoFrequencia,
} from "@/lib/dp/dsr-rules";


function SubSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

const num = (v: string, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const STORAGE_KEY = "dp:regras-folgas:unidade";


export default function DpConfiguracoesJornada() {
  const embedded = useDpEmbedded();
  const { selectedCompanyId } = useCompanyContext();
  const [unidadeId, setUnidadeId] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY) || null,
  );
  const {
    config, configPadrao, temExcecao, unidadesConfiguradas, temMulheres,
    isLoading, isError, refetch, save, saveMany, saving, removerExcecao, removendo,
  } = useDpConfigDp(unidadeId);
  const { data: todasUnidades = [] } = useDpUnidades();
  const unidades = useMemo(
    () => todasUnidades.filter((u) => u.company_id === selectedCompanyId),
    [todasUnidades, selectedCompanyId],
  );
  const { data: contextoSindical } = useSindicatoContextoUnidade(unidadeId);

  const [form, setForm] = useState<DpConfigDpForm>(DP_CONFIG_DP_DEFAULT);
  const [alertas, setAlertas] = useState<AlertaCiencia[]>([]);
  const [alvosExtras, setAlvosExtras] = useState<string[]>([]);
  const [limparAberto, setLimparAberto] = useState(false);

  /** Seleciona a primeira unidade quando não há escolha válida guardada. */
  useEffect(() => {
    if (unidades.length === 0) return;
    if (!unidadeId || !unidades.some((u) => u.id === unidadeId)) {
      setUnidadeId(unidades[0].id);
    }
  }, [unidades, unidadeId]);

  useEffect(() => {
    if (unidadeId) localStorage.setItem(STORAGE_KEY, unidadeId);
  }, [unidadeId]);

  useEffect(() => { setForm(config); }, [config]);

  const unidadeAtual = useMemo(
    () => unidades.find((u) => u.id === unidadeId) ?? null,
    [unidades, unidadeId],
  );
  const outrasUnidades = useMemo(
    () => unidades
      .filter((u) => u.id !== unidadeId)
      .map((u) => ({ id: u.id, nome: u.nome, configurada: unidadesConfiguradas.has(u.id) })),
    [unidades, unidadeId, unidadesConfiguradas],
  );

  const padrao = padraoLegalDomingo(form.setor_comercio);
  const semanas = semanasDaConfig(form);
  const naoConfigurada = !!unidadeId && !temExcecao;
  const porAcordo = form.tipo_descanso_domingo === "acordo_coletivo";
  const resumoFolgas = useMemo(() => resumoEscolhaFolgas(form), [form]);

  const travadoClt = form.regra_dsr === "clt";

  const set = <K extends keyof DpConfigDpForm>(k: K, v: DpConfigDpForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  /** Alterna a base da regra: CLT restaura e trava os padrões legais. */
  const setBaseRegra = (v: DpConfigDpForm["regra_dsr"]) =>
    setForm((f) => (v === "clt" ? { ...f, regra_dsr: v, ...padroesCltDe(f.setor_comercio) } : { ...f, regra_dsr: v }));

  const setSetorComercio = (v: boolean) =>
    setForm((f) => ({
      ...f,
      setor_comercio: v,
      ...(f.regra_dsr === "clt" ? padroesCltDe(v) : {}),
    }));

  const toggleDia = (dia: number) => {
    setForm((f) => {
      const atual = f.dias_descanso_negociados ?? [];
      const proximo = atual.includes(dia) ? atual.filter((d) => d !== dia) : [...atual, dia];
      return { ...f, dias_descanso_negociados: proximo.sort((a, b) => a - b) };
    });
  };

  /** Grava nas unidades alvo; mantém a retaguarda da empresa quando replica para todas. */
  const persist = async (
    alvosExtras: string[],
    cienciaConfirmada: boolean,
    justificativa?: string,
  ) => {
    if (!unidadeId) return;
    const nomes: Record<string, string> = {};
    unidades.forEach((u) => { nomes[u.id] = u.nome; });

    const alvos: (string | null)[] = [unidadeId, ...alvosExtras];
    // Replicou para todas as unidades: atualiza também a retaguarda da empresa.
    const todas = unidades.length > 0 && alvos.length === unidades.length;
    if (todas) alvos.push(null);

    try {
      await saveMany({ patch: form, alvos, nomes, cienciaConfirmada, justificativa: justificativa || null });
      setAlertas([]);
      setReplicarAberto(false);
      toast.success(
        alvosExtras.length > 0
          ? `Regras salvas em ${alvosExtras.length + 1} unidades`
          : `Regras de ${unidadeAtual?.nome ?? "unidade"} atualizadas`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar as regras");
    }
  };

  const [alvosPendentes, setAlvosPendentes] = useState<string[]>([]);

  /** Etapa final: exige ciência legal quando a regra é menos protetiva. */
  const concluirSalvamento = (alvosExtras: string[]) => {
    setAlvosPendentes(alvosExtras);
    const pendentes = alertasDeCiencia(form, { temMulheres });
    if (pendentes.length > 0) {
      setReplicarAberto(false);
      setAlertas(pendentes);
      return;
    }
    void persist(alvosExtras, false);
  };

  const handleSave = () => {
    if (!unidadeId) {
      toast.error("Cadastre uma unidade antes de configurar as regras de folgas.");
      return;
    }
    if (porAcordo && (form.dias_descanso_negociados ?? []).length === 0) {
      toast.error("Selecione ao menos um dia de descanso negociado.");
      return;
    }
    if (outrasUnidades.length > 0) {
      setReplicarAberto(true);
      return;
    }
    concluirSalvamento([]);
  };

  const handleLimparRegras = async () => {
    if (!unidadeId) return;
    try {
      await removerExcecao(unidadeId);
      setForm(configPadrao);
      setLimparAberto(false);
      toast.success("Regras da unidade removidas.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível remover as regras");
    }
  };



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
      {!embedded && (
        <Helmet>
          <title>Regras De Folgas | Pessoas 360°FOOD</title>
          <meta name="description" content="Configure a periodicidade de folga dominical, o descanso por acordo coletivo e as regras de férias do Departamento Pessoal, por empresa ou por unidade." />
        </Helmet>
      )}

      <DpPageHeader
        title="Regras De Folgas"
        description="Parâmetros de DSR e folga dominical — aplicados a toda a empresa ou por unidade de loja."
        icon={Scale}
        actions={
          <Button onClick={handleSave} disabled={saving || isLoading} className="gap-2">
            <Save className="h-4 w-4" aria-hidden="true" />
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        }
      />

      <DpContentCard contentClassName="space-y-5 p-4 md:p-5">
        <div>
          <h2 className="text-base font-semibold">Regras De Folgas Da Unidade</h2>
          <p className="text-xs text-muted-foreground">
            Um único cadastro por unidade: descanso dominical e frequência de DSR. Você pode aplicar
            a mesma regra a outras lojas ao salvar.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="alvo-regra">Configurando as regras de</Label>
            <Select
              value={unidadeId ?? ""}
              onValueChange={(v) => setUnidadeId(v)}
              disabled={unidades.length === 0}
            >
              <SelectTrigger id="alvo-regra">
                <SelectValue placeholder="Nenhuma unidade cadastrada" />
              </SelectTrigger>
              <SelectContent>
                {unidades.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.nome}
                    {unidadesConfiguradas.has(u.id) ? "" : " — ainda não configurada"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {unidadeId && (
            <div className="flex flex-wrap items-center gap-2">
              {naoConfigurada ? (
                <Badge variant="outline" className="gap-1">
                  <Store className="h-3.5 w-3.5" aria-hidden="true" /> Ainda não configurada
                </Badge>
              ) : (
                <>
                  <Badge className="gap-1">
                    <Store className="h-3.5 w-3.5" aria-hidden="true" /> Regras configuradas
                  </Badge>
                  <Button
                    variant="outline" size="sm" className="gap-2"
                    onClick={() => setLimparAberto(true)} disabled={removendo}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" /> Limpar Regras
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {unidades.length === 0 && (
          <p className="text-xs text-destructive">
            Cadastre ao menos uma unidade em Cadastros → Unidades para definir as regras de folgas.
          </p>
        )}

        {unidadeId && (
          <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            <p className="flex items-center gap-2 font-medium text-foreground">
              <Landmark className="h-4 w-4" aria-hidden="true" /> Contexto sindical desta unidade
            </p>
            <p className="mt-1">
              {contextoSindical?.sindicatos.length
                ? contextoSindical.sindicatos.join(" • ")
                : "Nenhum sindicato vinculado a esta unidade."}
            </p>
            {contextoSindical?.negociacao && (
              <p className="mt-1">
                Última negociação registrada: {contextoSindical.negociacao.tipo_documento?.toUpperCase() ?? "Documento"}
                {contextoSindical.negociacao.ano ? ` — vigência ${contextoSindical.negociacao.ano}` : ""}
              </p>
            )}
          </div>
        )}

        {outrasUnidades.length > 0 && (
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-sm">Aplicar a mesma regra também em</Label>
              <div className="flex gap-2">
                <Button
                  type="button" variant="ghost" size="sm"
                  onClick={() => setAlvosExtras(outrasUnidades.map((u) => u.id))}
                >
                  Selecionar todas
                </Button>
                <Button
                  type="button" variant="ghost" size="sm"
                  onClick={() => setAlvosExtras([])}
                  disabled={alvosExtras.length === 0}
                >
                  Limpar seleção
                </Button>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {outrasUnidades.map((u) => (
                <label
                  key={u.id}
                  className="flex items-start gap-2 rounded-md border p-2 text-sm"
                  htmlFor={`alvo-${u.id}`}
                >
                  <Checkbox
                    id={`alvo-${u.id}`}
                    checked={alvosExtras.includes(u.id)}
                    onCheckedChange={(c) => toggleAlvoExtra(u.id, c === true)}
                  />
                  <span className="leading-tight">
                    {u.nome}
                    {!u.configurada && (
                      <span className="block text-xs text-muted-foreground">ainda não configurada</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {naoConfigurada && unidadeId && (
          <p className="text-xs text-muted-foreground">
            Os campos abaixo partem do padrão legal (CLT). Ajuste e clique em Salvar para gravar as regras desta unidade.
          </p>
        )}

        <Separator />

        <SubSection
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
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Dias de descanso negociados</Label>
              <ToggleGroup
                type="multiple"
                className="flex flex-wrap justify-start gap-1"
                value={(form.dias_descanso_negociados ?? []).map(String)}
                onValueChange={() => { /* controlado item a item */ }}
              >
                {ORDEM_DIAS_SEG_DOM.map((dia) => (
                  <ToggleGroupItem
                    key={dia}
                    value={String(dia)}
                    aria-label={DIA_SEMANA_CURTO[dia]}
                    className="h-9 min-w-12 px-3"
                    onClick={() => toggleDia(dia)}
                  >
                    {DIA_SEMANA_CURTO[dia]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-xs text-muted-foreground">
                Os dias marcados são as <strong>opções</strong> que o colaborador pode escolher no calendário
                do portal. Marcar mais dias não aumenta a quantidade de folgas.
              </p>
              <div className="flex items-start gap-1.5 rounded-md bg-muted/50 p-2 text-xs">
                <span>
                  Com esta configuração, o colaborador escolhe até{" "}
                  <strong>{resumoFolgas.teto} folga(s) por mês</strong> entre os dias marcados.
                </span>
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" aria-label="Como o teto é calculado" className="mt-0.5 shrink-0">
                      <Info className="size-3.5 text-muted-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-72 text-xs">
                    O teto mensal é o <strong>menor valor</strong> entre o limite de folgas por mês
                    configurado e a quantidade derivada da frequência de folga dominical.
                  </PopoverContent>
                </Popover>
              </div>

            </div>
          )}
        </div>
        </SubSection>

        <Separator />

        <SubSection
          title="Frequência Da Folga Dominical (DSR)"
          description="Quantas vezes o colaborador folga no domingo, conforme a base legal ou negociada."
        >

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="regra-dsr">Base da regra de DSR</Label>
            <Select
              value={form.regra_dsr}
              onValueChange={(v) => setBaseRegra(v as DpConfigDpForm["regra_dsr"])}
            >
              <SelectTrigger id="regra-dsr"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="clt">CLT (padrão legal)</SelectItem>
                <SelectItem value="cct">Acordo/Convenção coletiva</SelectItem>
                <SelectItem value="propria">Política própria da empresa</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {travadoClt
                ? "Valores fixados pelo padrão CLT — mude a base da regra para editar a frequência."
                : "Frequências livres: os campos abaixo podem divergir do padrão CLT, com registro de ciência."}
            </p>
          </div>

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
              onCheckedChange={setSetorComercio}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="modo-freq">Modelo de frequência</Label>
            <Select
              disabled={travadoClt}
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
                id="per-domingo" type="number" min={0} max={12} disabled={travadoClt}
                value={form.periodicidade_domingo}
                onChange={(e) => set("periodicidade_domingo", num(e.target.value, padrao))}
              />
              <p className="text-xs text-muted-foreground">
                Padrão legal: {padrao}. Use 0 para não exigir folga dominical.
              </p>
              {isMenosProtetiva(semanas.geral, padrao) && (
                <MenosProtetivaBadge
                  campo="periodicidade_domingo" setorComercio={form.setor_comercio}
                  valor={semanas.geral} padrao={padrao}
                />
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="dom-mes">Domingos de folga por mês</Label>
              <Select
                disabled={travadoClt}
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
              </p>
              {isMenosProtetiva(semanas.geral, padrao) && (
                <MenosProtetivaBadge
                  campo="periodicidade_domingo" setorComercio={form.setor_comercio}
                  valor={semanas.geral} padrao={padrao}
                />
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="modo-freq-mulher">Modelo de frequência — mulheres</Label>
            <Select
              disabled={travadoClt}
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
                id="per-domingo-mulher" type="number" min={0} max={12} disabled={travadoClt}
                value={form.periodicidade_domingo_mulher}
                onChange={(e) => set("periodicidade_domingo_mulher", num(e.target.value, PADRAO_LEGAL_DOMINGO_MULHER))}
              />
              <p className="text-xs text-muted-foreground">
                Padrão legal: {PADRAO_LEGAL_DOMINGO_MULHER} semanas.
              </p>
              {isMenosProtetiva(semanas.mulher, PADRAO_LEGAL_DOMINGO_MULHER) && (
                <MenosProtetivaBadge
                  campo="periodicidade_domingo_mulher" setorComercio={form.setor_comercio}
                  valor={semanas.mulher} padrao={PADRAO_LEGAL_DOMINGO_MULHER}
                />
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="dom-mes-mulher">Domingos por mês — mulheres</Label>
              <Select
                disabled={travadoClt}
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
              </p>
              {isMenosProtetiva(semanas.mulher, PADRAO_LEGAL_DOMINGO_MULHER) && (
                <MenosProtetivaBadge
                  campo="periodicidade_domingo_mulher" setorComercio={form.setor_comercio}
                  valor={semanas.mulher} padrao={PADRAO_LEGAL_DOMINGO_MULHER}
                />
              )}
            </div>
          )}


        </div>
        </SubSection>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            {alvosExtras.length > 0
              ? `Será salvo em ${alvosExtras.length + 1} unidades.`
              : `Será salvo apenas em ${unidadeAtual?.nome ?? "esta unidade"}.`}
          </p>
          <Button onClick={handleSave} disabled={saving || isLoading} className="gap-2">
            <Save className="h-4 w-4" aria-hidden="true" />
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </DpContentCard>



      <AlertDialog open={limparAberto} onOpenChange={setLimparAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar Regras Desta Unidade?</AlertDialogTitle>
            <AlertDialogDescription>
              As regras de {unidadeAtual?.nome ?? "esta unidade"} serão apagadas e a unidade voltará
              a seguir o padrão legal (CLT) até ser configurada novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removendo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void handleLimparRegras(); }} disabled={removendo}>
              {removendo ? "Removendo..." : "Limpar Regras"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CienciaLegalDialog
        open={alertas.length > 0}
        alertas={alertas}
        confirming={saving}
        onCancel={() => setAlertas([])}
        onConfirm={(justificativa) => void persist(alvosPendentes, true, justificativa)}
      />

    </DpPage>
  );
}
