import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Save,
  Scale,
  Info,
  Store,
  Trash2,
  Landmark,
  ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CienciaLegalDialog } from "@/components/dp/CienciaLegalDialog";
import { MenosProtetivaBadge } from "@/components/dp/MenosProtetivaBadge";
import { FolgaRegrasPanel } from "@/components/dp/folgas/FolgaRegrasPanel";
import { useDpConfigDp, type DpConfigDpForm } from "@/hooks/useDpConfigDp";
import { useDpFolgaLimites, type RegraLimiteInput } from "@/hooks/useDpFolgaLimites";
import { useDpUnidades } from "@/hooks/useDpCadastros";
import { useSindicatoContextoUnidade } from "@/hooks/useSindicatoContextoUnidade";
import { useDpValeRegrasEmpresa } from "@/hooks/useDpValeRegras";
import { diasElegiveisDaConfig } from "@/lib/dp/dsr-rules";
import {
  DP_CONFIG_DP_DEFAULT,
  alertasDeCiencia,
  padraoLegalDomingo,
  isMenosProtetiva,
  semanasDaConfig,
  MODO_FREQUENCIA_LABEL,
  DIA_SEMANA_CURTO,
  DIA_SEMANA_LABEL,
  ORDEM_DIAS_SEG_DOM,
  padroesCltDe,
  PADRAO_LEGAL_DOMINGO_MULHER,
  resumoEscolhaFolgas,
  aplicarBaseRegra,
  TROCA_FOLGA_MODO_LABEL,
  TROCA_FOLGA_ESCOPO_LABEL,
  type AlertaCiencia,
  type ModoFrequencia,
  type TrocaFolgaModo,
  type TrocaFolgaEscopo,
} from "@/lib/dp/dsr-rules";

/** Opções da base única da regra de folgas exibida na tela. */
type BaseRegraOpcao = "clt" | "cct" | "propria";

function SubSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
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

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modo: "criar" | "editar";
  /** Unidade em edição. No modo criar pode vir null (o usuário escolhe no diálogo). */
  unidadeId: string | null;
  configInicial: DpConfigDpForm;
  unidades: { id: string; nome: string }[];
  /** Unidade de origem para cópia (modo criar). */
  copiarDe?: string | null;
  onSuccess?: () => void;
};

/**
 * Diálogo único de cadastro/edição das regras de folgas de uma unidade.
 * Reúne DSR, dias de descanso, frequência, particularidades, troca e janela mensal.
 */
export function FolgaRegrasFormDialog({
  open,
  onOpenChange,
  modo,
  unidadeId: unidadeIdProp,
  configInicial,
  unidades,
  copiarDe,
  onSuccess,
}: Props) {
  const [etapa, setEtapa] = useState<"unidade" | "formulario">(
    modo === "criar" && !unidadeIdProp ? "unidade" : "formulario",
  );
  const [unidadeSelecionada, setUnidadeSelecionada] = useState<string | null>(unidadeIdProp);
  const [copiarDeSelecionado, setCopiarDeSelecionado] = useState<string | null>(copiarDe ?? null);

  const { data: todasUnidades = [] } = useDpUnidades();
  const nomeUnidade = useMemo(
    () => new Map(unidades.map((u) => [u.id, u.nome])),
    [unidades],
  );

  const unidadeEfetiva = unidadeSelecionada ?? unidadeIdProp;
  const { data: contextoSindical } = useSindicatoContextoUnidade(unidadeEfetiva);

  const [form, setForm] = useState<DpConfigDpForm>(configInicial);
  const [alertas, setAlertas] = useState<AlertaCiencia[]>([]);

  const { saveMany, saving, configPadrao } = useDpConfigDp(null);
  const { config: configOrigem } = useDpConfigDp(copiarDeSelecionado);
  const hookLimites = useDpFolgaLimites(unidadeEfetiva);
  const hookLimitesOrigem = useDpFolgaLimites(copiarDeSelecionado);

  const [regrasRascunho, setRegrasRascunho] = useState<RegraLimiteInput[]>([]);

  // Reseta o estado quando o diálogo abre.
  useEffect(() => {
    if (!open) return;
    setEtapa(modo === "criar" && !unidadeIdProp ? "unidade" : "formulario");
    setUnidadeSelecionada(unidadeIdProp);
    setCopiarDeSelecionado(copiarDe ?? null);
    setForm(configInicial);
    setAlertas([]);
    setRegrasRascunho([]);
  }, [open, modo, unidadeIdProp, configInicial, copiarDe]);

  // Preenche o rascunho de particularidades: edição = regras da unidade; criação com cópia = regras da origem.
  useEffect(() => {
    if (etapa !== "formulario") return;
    if (modo === "editar" && unidadeEfetiva) {
      setRegrasRascunho(
        hookLimites.regras.map((r) => ({
          id: r.id,
          tipo: r.tipo,
          nome: r.nome,
          unidade_id: r.unidade_id,
          dia_semana: r.dia_semana,
          maximo: r.maximo,
          vigencia_inicio: r.vigencia_inicio,
          vigencia_fim: r.vigencia_fim,
          ativo: r.ativo,
          cargo_ids: [...r.cargo_ids],
          colaborador_ids: [...r.colaborador_ids],
        })),
      );
    } else if (modo === "criar" && copiarDeSelecionado) {
      setRegrasRascunho(
        hookLimitesOrigem.regras.map((r) => ({
          tipo: r.tipo,
          nome: r.nome,
          unidade_id: unidadeEfetiva ?? r.unidade_id,
          dia_semana: r.dia_semana,
          maximo: r.maximo,
          vigencia_inicio: r.vigencia_inicio,
          vigencia_fim: r.vigencia_fim,
          ativo: r.ativo,
          cargo_ids: [...r.cargo_ids],
          colaborador_ids: [...r.colaborador_ids],
        })),
      );
    }
  }, [etapa, modo, unidadeEfetiva, copiarDeSelecionado, hookLimites.regras, hookLimitesOrigem.regras]);

  const padrao = padraoLegalDomingo(form.setor_comercio);
  const semanas = semanasDaConfig(form);
  const porAcordo = form.tipo_descanso_domingo === "acordo_coletivo";
  const resumoFolgas = useMemo(() => resumoEscolhaFolgas(form), [form]);
  const diasDeFolga = useMemo(() => diasElegiveisDaConfig(form), [form]);
  const { data: valeRegras } = useDpValeRegrasEmpresa();

  const apenasDomingo = useMemo(
    () => !porAcordo || diasDeFolga.filter((d) => d !== 0).length === 0,
    [porAcordo, diasDeFolga],
  );
  const nomesDiasDeFolga = useMemo(
    () =>
      ORDEM_DIAS_SEG_DOM.filter((d) => diasDeFolga.includes(d))
        .map((d) => DIA_SEMANA_LABEL[d]?.toLowerCase() ?? "")
        .filter(Boolean)
        .join(", "),
    [diasDeFolga],
  );
  const tipoDias: TipoDiasDescanso = apenasDomingo ? "domingo" : tipoDiasDescanso(diasDeFolga);
  const rotulos =
    tipoDias === "domingo"
      ? {
          titulo: "Frequência Da Folga Dominical (DSR)",
          porMes: "Domingos de folga por mês",
          semanas: "Domingo de folga a cada (semanas)",
          porMesMulher: "Domingos por mês — mulheres",
          semanasMulher: "Domingo de folga — mulheres (semanas)",
          todo: "Todo domingo",
          equivale: "1 domingo",
        }
      : tipoDias === "fim_de_semana"
        ? {
            titulo: "Frequência Da Folga De Descanso (DSR)",
            porMes: "Folgas de fim de semana por mês",
            semanas: "Folga de descanso a cada (semanas)",
            porMesMulher: "Folgas de fim de semana por mês — mulheres",
            semanasMulher: "Folga de descanso — mulheres (semanas)",
            todo: "Todo fim de semana",
            equivale: "1 folga de fim de semana",
          }
        : {
            titulo: "Frequência Da Folga De Descanso (DSR)",
            porMes: "Folgas de descanso por mês",
            semanas: "Folga de descanso a cada (semanas)",
            porMesMulher: "Folgas de descanso por mês — mulheres",
            semanasMulher: "Folga de descanso — mulheres (semanas)",
            todo: "Toda semana (dia marcado)",
            equivale: "1 folga",
          };

  const travadoClt = form.regra_dsr === "clt";
  const baseRegra: BaseRegraOpcao = porAcordo ? "cct" : form.regra_dsr === "clt" ? "clt" : "propria";

  const set = <K extends keyof DpConfigDpForm>(k: K, v: DpConfigDpForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const setBaseRegra = (v: BaseRegraOpcao) =>
    setForm((f) => {
      if (v === "clt") return aplicarBaseRegra(f, "clt");
      if (v === "cct") {
        return {
          ...f,
          regra_dsr: "cct",
          tipo_descanso_domingo: "acordo_coletivo",
          dias_descanso_negociados: (f.dias_descanso_negociados ?? []).length
            ? f.dias_descanso_negociados
            : [0],
        };
      }
      return {
        ...f,
        regra_dsr: "propria",
        tipo_descanso_domingo: "legal",
        dias_descanso_negociados: [0],
      };
    });

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

  const validar = (): boolean => {
    if (!unidadeEfetiva) {
      toast.error("Selecione uma unidade.");
      return false;
    }
    if (porAcordo && (form.dias_descanso_negociados ?? []).length === 0) {
      toast.error("Selecione ao menos um dia de descanso negociado.");
      return false;
    }
    if (form.folga_janela_fecha_dia < form.folga_janela_abre_dia) {
      toast.error("O dia de encerramento precisa ser igual ou depois do dia de abertura.");
      return false;
    }
    return true;
  };

  const persist = async (cienciaConfirmada: boolean, justificativa?: string) => {
    if (!unidadeEfetiva) return;
    const nomes: Record<string, string> = {};
    unidades.forEach((u) => {
      nomes[u.id] = u.nome;
    });

    try {
      await saveMany({
        patch: form,
        alvos: [unidadeEfetiva],
        nomes,
        cienciaConfirmada,
        justificativa: justificativa || null,
      });

      // Grava as particularidades de folga mantidas no rascunho.
      await hookLimites.salvarMuitas.mutateAsync(
        regrasRascunho.map((r) => ({ ...r, unidade_id: unidadeEfetiva })),
      );

      toast.success(
        modo === "criar"
          ? `Regras de ${nomeUnidade.get(unidadeEfetiva) ?? "unidade"} criadas`
          : `Regras de ${nomeUnidade.get(unidadeEfetiva) ?? "unidade"} atualizadas`,
      );
      onSuccess?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar as regras");
    }
  };

  const handleSalvar = () => {
    if (!validar()) return;
    const pendentes = alertasDeCiencia(form, { temMulheres: false });
    if (pendentes.length > 0) {
      setAlertas(pendentes);
      return;
    }
    void persist(false);
  };

  const unidadesDisponiveis = useMemo(
    () => unidades.filter((u) => u.id !== unidadeSelecionada),
    [unidades, unidadeSelecionada],
  );

  const handleAvancar = () => {
    if (!unidadeSelecionada) {
      toast.error("Escolha a unidade que receberá as regras.");
      return;
    }
    if (copiarDeSelecionado && configOrigem) {
      setForm({ ...configOrigem });
    }
    setEtapa("formulario");
  };

  if (etapa === "unidade") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Regra De Folgas</DialogTitle>
            <DialogDescription>
              Escolha a unidade que receberá as regras. Você pode começar copiando as regras de outra
              unidade.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nova-unidade">Unidade</Label>
              <Select
                value={unidadeSelecionada ?? ""}
                onValueChange={(v) => {
                  setUnidadeSelecionada(v || null);
                  setCopiarDeSelecionado(null);
                }}
              >
                <SelectTrigger id="nova-unidade">
                  <SelectValue placeholder="Selecione a unidade" />
                </SelectTrigger>
                <SelectContent>
                  {unidades.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="copiar-de">Copiar regras de (opcional)</Label>
              <Select
                value={copiarDeSelecionado ?? ""}
                onValueChange={(v) => setCopiarDeSelecionado(v || null)}
                disabled={unidadesDisponiveis.length === 0}
              >
                <SelectTrigger id="copiar-de">
                  <SelectValue
                    placeholder={
                      unidadesDisponiveis.length === 0
                        ? "Nenhuma outra unidade"
                        : "Não copiar"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Não copiar</SelectItem>
                  {unidadesDisponiveis.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAvancar} disabled={!unidadeSelecionada}>
              Avançar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {modo === "criar" && (
              <Button variant="ghost" size="icon" onClick={() => setEtapa("unidade")}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            <DialogTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5" aria-hidden="true" />
              {modo === "criar" ? "Nova Regra De Folgas" : "Editar Regras De Folgas"}
            </DialogTitle>
          </div>
          <DialogDescription>
            {unidadeEfetiva
              ? `Configurando ${nomeUnidade.get(unidadeEfetiva) ?? "unidade"}`
              : "Configure os parâmetros de folga da unidade."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {unidadeEfetiva && (
            <div className="rounded-md border bg-muted/40 p-3 text-xs">
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
                  Última negociação registrada:{" "}
                  {contextoSindical.negociacao.tipo_documento?.toUpperCase() ?? "Documento"}
                  {contextoSindical.negociacao.ano
                    ? ` — vigência ${contextoSindical.negociacao.ano}`
                    : ""}
                </p>
              )}
            </div>
          )}

          <SubSection
            title="Base Da Regra De Folgas"
            description="Define de onde vem a regra de descanso: a legislação, um acordo/convenção coletiva ou uma política própria."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="base-regra">Base da regra de folgas</Label>
                <Select value={baseRegra} onValueChange={(v) => setBaseRegra(v as BaseRegraOpcao)}>
                  <SelectTrigger id="base-regra">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clt">Conforme legislação (CLT — domingo estrito)</SelectItem>
                    <SelectItem value="cct">Acordo/convenção coletiva (dias negociados)</SelectItem>
                    <SelectItem value="propria">Política própria da empresa</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {travadoClt
                    ? "No padrão CLT as frequências voltam ao mínimo legal e o sistema gera automaticamente as folgas dominicais do colaborador a partir da data de admissão — ele não precisa marcá-las no portal, apenas solicitar troca ou exceção."
                    : "Fora do padrão CLT você define livremente a frequência das folgas dominicais, com registro de ciência quando a regra for menos protetiva."}
                </p>
              </div>

              {porAcordo && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Dias de descanso negociados</Label>
                  <ToggleGroup
                    type="multiple"
                    className="flex flex-wrap justify-start gap-1"
                    value={(form.dias_descanso_negociados ?? []).map(String)}
                    onValueChange={() => {
                      /* controlado item a item */
                    }}
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
                    Os dias marcados são as <strong>opções</strong> que o colaborador pode escolher no
                    calendário do portal. Marcar mais dias não aumenta a quantidade de folgas.
                  </p>
                  <div className="flex items-start gap-1.5 rounded-md bg-muted/50 p-2 text-xs">
                    <span>
                      Com esta configuração, o colaborador escolhe até{" "}
                      <strong>{resumoFolgas.teto} folga(s) por mês</strong> entre os dias marcados.
                    </span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          aria-label="Como o teto é calculado"
                          className="mt-0.5 shrink-0"
                        >
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
            title={rotulos.titulo}
            description={
              apenasDomingo
                ? "Quantas vezes o colaborador folga no domingo, conforme a base legal ou negociada."
                : `Considera os dias de descanso negociados (${nomesDiasDeFolga}).`
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <p className="text-xs text-muted-foreground">
                  {travadoClt
                    ? "Valores fixados pelo padrão CLT — mude a base da regra de folgas para editar a frequência. No padrão CLT o sistema já gera as folgas dominicais do colaborador."
                    : "Frequências livres: os campos abaixo podem divergir do padrão CLT, com registro de ciência."}
                </p>
              </div>

              <div className="sm:col-span-2 flex items-start justify-between gap-4 rounded-lg border p-3">
                <div>
                  <Label htmlFor="setor-comercio" className="text-sm font-medium">
                    Empresa do comércio / food service
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Define o padrão legal de referência ({padrao} semana(s)).
                  </p>
                </div>
                <Switch id="setor-comercio" checked={form.setor_comercio} onCheckedChange={setSetorComercio} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="modo-freq">Modelo de frequência</Label>
                <Select
                  disabled={travadoClt}
                  value={form.modo_frequencia_domingo}
                  onValueChange={(v) => set("modo_frequencia_domingo", v as ModoFrequencia)}
                >
                  <SelectTrigger id="modo-freq">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(MODO_FREQUENCIA_LABEL) as ModoFrequencia[]).map((m) => (
                      <SelectItem key={m} value={m}>
                        {MODO_FREQUENCIA_LABEL[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Apenas um modelo vale por vez.</p>
              </div>

              {form.modo_frequencia_domingo === "semanas" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="per-domingo">{rotulos.semanas}</Label>
                  <Input
                    id="per-domingo"
                    type="number"
                    min={0}
                    max={12}
                    disabled={travadoClt}
                    value={form.periodicidade_domingo}
                    onChange={(e) => set("periodicidade_domingo", num(e.target.value, padrao))}
                  />
                  <p className="text-xs text-muted-foreground">Padrão legal: {padrao}. Use 0 para não exigir folga dominical.</p>
                  {isMenosProtetiva(semanas.geral, padrao) && (
                    <MenosProtetivaBadge
                      campo="periodicidade_domingo"
                      setorComercio={form.setor_comercio}
                      valor={semanas.geral}
                      padrao={padrao}
                    />
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="dom-mes">{rotulos.porMes}</Label>
                  <Select
                    disabled={travadoClt}
                    value={String(form.domingos_por_mes)}
                    onValueChange={(v) => set("domingos_por_mes", Number(v))}
                  >
                    <SelectTrigger id="dom-mes">
                      <SelectValue />
                    </SelectTrigger>
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
                      campo="periodicidade_domingo"
                      setorComercio={form.setor_comercio}
                      valor={semanas.geral}
                      padrao={padrao}
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
                  <SelectTrigger id="modo-freq-mulher">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(MODO_FREQUENCIA_LABEL) as ModoFrequencia[]).map((m) => (
                      <SelectItem key={m} value={m}>
                        {MODO_FREQUENCIA_LABEL[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Art. 386 da CLT: quinzenal.</p>
              </div>

              {form.modo_frequencia_domingo_mulher === "semanas" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="per-domingo-mulher">
                    {rotulos.semanasMulher}{" "}
                    <span className="text-muted-foreground">(Art. 386)</span>
                  </Label>
                  <Input
                    id="per-domingo-mulher"
                    type="number"
                    min={0}
                    max={12}
                    disabled={travadoClt}
                    value={form.periodicidade_domingo_mulher}
                    onChange={(e) =>
                      set("periodicidade_domingo_mulher", num(e.target.value, PADRAO_LEGAL_DOMINGO_MULHER))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Padrão legal: {PADRAO_LEGAL_DOMINGO_MULHER} semanas.
                  </p>
                  {isMenosProtetiva(semanas.mulher, PADRAO_LEGAL_DOMINGO_MULHER) && (
                    <MenosProtetivaBadge
                      campo="periodicidade_domingo_mulher"
                      setorComercio={form.setor_comercio}
                      valor={semanas.mulher}
                      padrao={PADRAO_LEGAL_DOMINGO_MULHER}
                    />
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="dom-mes-mulher">
                    {rotulos.porMesMulher}{" "}
                    <span className="text-muted-foreground">(Art. 386)</span>
                  </Label>
                  <Select
                    disabled={travadoClt}
                    value={String(form.domingos_por_mes_mulher)}
                    onValueChange={(v) => set("domingos_por_mes_mulher", Number(v))}
                  >
                    <SelectTrigger id="dom-mes-mulher">
                      <SelectValue />
                    </SelectTrigger>
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
                      campo="periodicidade_domingo_mulher"
                      setorComercio={form.setor_comercio}
                      valor={semanas.mulher}
                      padrao={PADRAO_LEGAL_DOMINGO_MULHER}
                    />
                  )}
                </div>
              )}
            </div>
          </SubSection>

          <Separator />

          <FolgaRegrasPanel
            unidadeId={unidadeEfetiva ?? null}
            diasPermitidos={diasDeFolga}
            modo="rascunho"
            regrasRascunho={regrasRascunho}
            onChangeRascunho={setRegrasRascunho}
          />

          <Separator />

          <SubSection
            title="Troca De Folga Entre Colaboradores"
            description="Define se os colaboradores podem trocar folgas entre si e sobre quais folgas a troca vale."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="troca-modo">Troca de folga</Label>
                <Select
                  value={form.troca_folga_modo}
                  onValueChange={(v) =>
                    set("troca_folga_modo", v as DpConfigDpForm["troca_folga_modo"])
                  }
                >
                  <SelectTrigger id="troca-modo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TROCA_FOLGA_MODO_LABEL) as TrocaFolgaModo[]).map((m) => (
                      <SelectItem key={m} value={m}>
                        {TROCA_FOLGA_MODO_LABEL[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Na troca direta, o aceite do colega já efetiva a troca no calendário.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="troca-escopo">Troca permitida sobre</Label>
                <Select
                  disabled={form.troca_folga_modo === "proibida"}
                  value={form.troca_folga_escopo}
                  onValueChange={(v) =>
                    set("troca_folga_escopo", v as DpConfigDpForm["troca_folga_escopo"])
                  }
                >
                  <SelectTrigger id="troca-escopo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TROCA_FOLGA_ESCOPO_LABEL) as TrocaFolgaEscopo[]).map((m) => (
                      <SelectItem key={m} value={m}>
                        {TROCA_FOLGA_ESCOPO_LABEL[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Folgas fora do escopo permitido são recusadas pelo sistema, com o motivo informado ao
                  colaborador.
                </p>
              </div>
            </div>
          </SubSection>

          <Separator />

          <SubSection
            title="Período Mensal Para Escolha Das Folgas"
            description="Define os dias do mês em que os colaboradores podem escolher as folgas do mês seguinte. Fora desse período eles só conseguem solicitar exceção."
          >
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4 rounded-md border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="janela-ativa">Usar período mensal de escolha</Label>
                  <p className="text-xs text-muted-foreground">
                    Quando desligado, a marcação segue liberada como hoje.
                  </p>
                </div>
                <Switch
                  id="janela-ativa"
                  checked={form.folga_janela_ativa}
                  onCheckedChange={(v) => set("folga_janela_ativa", v)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="janela-abre">Abre no dia</Label>
                  <Input
                    id="janela-abre"
                    type="number"
                    min={1}
                    max={28}
                    disabled={!form.folga_janela_ativa}
                    value={form.folga_janela_abre_dia}
                    onChange={(e) =>
                      set("folga_janela_abre_dia", Math.min(28, Math.max(1, num(e.target.value, 10))))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="janela-fecha">Encerra no dia</Label>
                  <Input
                    id="janela-fecha"
                    type="number"
                    min={1}
                    max={28}
                    disabled={!form.folga_janela_ativa}
                    value={form.folga_janela_fecha_dia}
                    onChange={(e) =>
                      set("folga_janela_fecha_dia", Math.min(28, Math.max(1, num(e.target.value, 20))))
                    }
                  />
                  {form.folga_janela_fecha_dia < form.folga_janela_abre_dia && (
                    <p className="text-xs text-destructive">
                      O dia de encerramento precisa ser igual ou depois do dia de abertura.
                    </p>
                  )}
                </div>
              </div>

              {(valeRegras?.va_ativo || valeRegras?.vt_ativo) && (
                <div className="rounded-md bg-muted/50 p-3 text-xs">
                  <p className="font-medium">Datas de corte dos vales</p>
                  <ul className="mt-1 space-y-0.5 text-muted-foreground">
                    {valeRegras?.va_ativo && (
                      <li>
                        Vale-alimentação: paga no dia {valeRegras.va_dia_pagamento ?? "—"}
                        {valeRegras.va_dias_corte != null
                          ? `, com contagem fechada ${valeRegras.va_dias_corte} dia(s) antes`
                          : ""}
                        .
                      </li>
                    )}
                    {valeRegras?.vt_ativo && (
                      <li>
                        Vale-transporte: paga no dia {valeRegras.vt_dia_pagamento ?? "—"}
                        {valeRegras.vt_dias_corte != null
                          ? `, com contagem fechada ${valeRegras.vt_dias_corte} dia(s) antes`
                          : ""}
                        .
                      </li>
                    )}
                  </ul>
                  <p className="mt-1 text-muted-foreground">
                    Encerrar a escolha das folgas até essa data ajuda a fechar os vales já com as folgas
                    definidas.
                  </p>
                </div>
              )}

              <div className="flex items-start justify-between gap-4 rounded-md border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="janela-auto">Definir automaticamente quem não escolher</Label>
                  <p className="text-xs text-muted-foreground">
                    Depois do encerramento, quem não marcou recebe folga de fim de semana começando pelos
                    dias mais vazios. Se não houver mais vaga, o sistema avisa você.
                  </p>
                </div>
                <Switch
                  id="janela-auto"
                  disabled={!form.folga_janela_ativa}
                  checked={form.folga_autoatribuir}
                  onCheckedChange={(v) => set("folga_autoatribuir", v)}
                />
              </div>
            </div>
          </SubSection>
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSalvar()} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" aria-hidden="true" />
            {saving ? "Salvando..." : "Salvar regras"}
          </Button>
        </DialogFooter>

        <CienciaLegalDialog
          open={alertas.length > 0}
          alertas={alertas}
          confirming={saving}
          onCancel={() => setAlertas([])}
          onConfirm={(justificativa) => void persist(true, justificativa)}
        />
      </DialogContent>
    </Dialog>
  );
}
