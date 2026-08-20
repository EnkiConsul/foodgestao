import { useMemo } from "react";
import { useDpColaboradorConfigTrabalho } from "@/hooks/useDpColaboradorConfigTrabalho";
import { useDpDependentes } from "@/hooks/useDpDependentes";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { DpColaborador } from "@/hooks/useDpColaboradores";
import { useDpBeneficios } from "@/hooks/useDpBeneficios";
import { useDpTurnos } from "@/hooks/useDpTurnos";
import { useDpUnidades } from "@/hooks/useDpCadastros";
import { useSindicatoDoCargo } from "@/hooks/useSindicatoDoCargo";
import { contratoPolicy } from "@/lib/dp/contrato-policy";
import { AdicionalTempoServicoCard } from "@/components/dp/AdicionalTempoServicoCard";
import {
  FORMA_PAGAMENTO_LABEL,
  ASSIDUIDADE_CRITERIO_LABEL,
  PREMIO_TIPO_LABEL,
  BASE_HORAS_MES_PADRAO,
  BASE_DIAS_MES_PADRAO,
  valorHoraPorBase,
  valorDiaPorBase,
  valorAdicional,
} from "@/lib/dp/remuneracao";
import {
  cargaSemanalConfig,
  detalharCargaSemanal,
  resumoSemanaPorFaixas,
  type ConfigTrabalho,
  type TurnoResolvido,
} from "@/lib/dp/config-trabalho";
import { MOTIVO_DESLIGAMENTO_LABEL, ELEGIBILIDADE_LABEL } from "@/lib/dp/desligamento";
import {
  User, Briefcase, Mail, Clock, Wallet, Lock, LogOut, Shield, CheckCircle2, XCircle, Pencil, X, Users, Award,
} from "lucide-react";
import { maskCpf } from "@/lib/cpf";

const fmtDate = (d?: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : "—");
const fmtCurrency = (v?: number | null) =>
  v == null || Number.isNaN(v)
    ? "—"
    : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const VINCULO_LABEL: Record<string, string> = {
  CLT: "CLT efetivo",
  Intermitente: "CLT intermitente",
  Estagiario: "Estagiário",
  Temporario: "Temporário",
  PJ: "PJ",
  Socio: "Sócio",
  Freelancer: "Freelancer (sem registro)",
};

const vinculoLabel = (c: { regime?: string | null; vinculo_label?: string | null }): string =>
  (c.vinculo_label ? VINCULO_LABEL[c.vinculo_label] : null) ??
  (c.regime ? contratoPolicy(c.regime).label : null) ??
  "—";

const PERFIL_LABEL: Record<string, string> = {
  colaborador: "Colaborador",
  gestor: "Gestor",
  admin: "Admin",
};

const DIAS_SEMANA: Record<string, string> = {
  "0": "Domingo",
  "1": "Segunda-feira",
  "2": "Terça-feira",
  "3": "Quarta-feira",
  "4": "Quinta-feira",
  "5": "Sexta-feira",
  "6": "Sábado",
};

interface ColaboradorFichaDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  colaborador?: DpColaborador | null;
  onEdit: () => void;
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </div>
      <Separator />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-sm text-foreground">{value || "—"}</div>
    </div>
  );
}

export function ColaboradorFichaDialog({ open, onOpenChange, colaborador, onEdit }: ColaboradorFichaDialogProps) {
  const { atribuicoes } = useDpBeneficios(colaborador?.id ?? "todos");
  const enquadramento = useSindicatoDoCargo(
    (colaborador as any)?.cargo_id ?? null,
    (colaborador as any)?.unidade_id ?? null,
  );

  const perfil = (colaborador as any)?.perfil_acesso as string | null;
  const isDesligado = !!colaborador?.data_desligamento;
  const folga = (colaborador as any)?.folga_fixa_semana;
  const possuiFolha = (colaborador as any)?.possui_folha_ponto as boolean | null;
  const optanteAdiantamento = (colaborador as any)?.optante_adiantamento as boolean | null;
  const acessoPortalAte = (colaborador as any)?.acesso_portal_ate as string | null;
  const userId = (colaborador as any)?.user_id as string | null;

  const beneficioAtivos = useMemo(
    () => atribuicoes.filter((a) => a.colaborador_id === colaborador?.id && a.ativo),
    [atribuicoes, colaborador?.id],
  );

  const configTrabalho = useDpColaboradorConfigTrabalho(colaborador?.id ?? null);
  const { dependentes } = useDpDependentes(colaborador?.id ?? null);
  const configVigente = configTrabalho.vigente ?? configTrabalho.configs[0] ?? null;

  // A carga semanal não existe como campo: é calculada a partir dos dias e do
  // turno padrão. Dias sem horário próprio herdam o horário do turno.
  const { turnos } = useDpTurnos();
  const { data: unidades } = useDpUnidades();

  const turnosResolvidos = useMemo<TurnoResolvido[]>(
    () =>
      (turnos ?? []).map((t: any) => ({
        id: t.id,
        nome: t.nome,
        cor: t.cor ?? null,
        entrada: String(t.entrada ?? "").slice(0, 5),
        saida: String(t.saida ?? "").slice(0, 5),
        intervalo_minutos: t.intervalo_minutos ?? 0,
      })),
    [turnos],
  );

  const configDominio = useMemo<ConfigTrabalho | null>(() => {
    if (!configVigente) return null;
    return {
      turno_padrao_id: (configVigente as any).turno_padrao_id ?? null,
      folga_variavel: !!(configVigente as any).folga_variavel,
      folga_fixa_dow: (configVigente as any).folga_fixa_dow ?? null,
      dias: (configVigente.dias ?? []).map((d: any) => ({
        dow: d.dow,
        trabalha: !!d.trabalha,
        turno_id: d.turno_id ?? null,
        entrada: d.entrada ? String(d.entrada).slice(0, 5) : null,
        saida: d.saida ? String(d.saida).slice(0, 5) : null,
        intervalo_minutos: d.intervalo_minutos ?? null,
      })),
    };
  }, [configVigente]);

  const detalhesCarga = useMemo(
    () => (configDominio ? detalharCargaSemanal(configDominio, turnosResolvidos) : []),
    [configDominio, turnosResolvidos],
  );
  const cargaSemanalCalculada = useMemo(
    () => (configDominio ? cargaSemanalConfig(configDominio, turnosResolvidos) : null),
    [configDominio, turnosResolvidos],
  );
  const turnoPadrao = useMemo(
    () => turnosResolvidos.find((t) => t.id === configDominio?.turno_padrao_id) ?? null,
    [turnosResolvidos, configDominio?.turno_padrao_id],
  );
  const resumoFaixas = useMemo(
    () =>
      configDominio
        ? resumoSemanaPorFaixas(
            configDominio.dias,
            turnoPadrao
              ? {
                  entrada: turnoPadrao.entrada,
                  saida: turnoPadrao.saida,
                  intervalo_minutos: turnoPadrao.intervalo_minutos ?? 0,
                }
              : null,
            { folgaVariavel: configDominio.folga_variavel },
          )
        : null,
    [configDominio, turnoPadrao],
  );
  const diasTrabalhadosSemana = detalhesCarga.filter((d) => d.trabalha).length;
  const unidadeConfigNome = useMemo(() => {
    const id = (configVigente as any)?.unidade_id as string | null | undefined;
    if (!id) return null;
    return (unidades ?? []).find((u: any) => u.id === id)?.nome ?? null;
  }, [configVigente, unidades]);


  const insalubridade = (colaborador as any)?.insalubridade_percentual as number | null;
  const periculosidade = (colaborador as any)?.periculosidade_percentual as number | null;
  const va = (colaborador as any)?.vale_alimentacao as boolean | null;
  const vaValor = (colaborador as any)?.vale_alimentacao_valor as number | null;
  const vaPeriodicidade = (colaborador as any)?.vale_alimentacao_periodicidade as string | null;
  const vaDiasBase = (colaborador as any)?.vale_alimentacao_dias_base as number | null;
  const vaDescontoTipo = (colaborador as any)?.vale_alimentacao_desconto_tipo as string | null;
  const vaDescontoValor = (colaborador as any)?.vale_alimentacao_desconto_valor as number | null;
  const cargaSemanal = (colaborador as any)?.carga_semanal_horas as number | null;
  const formaPagamento = (colaborador as any)?.forma_pagamento as keyof typeof FORMA_PAGAMENTO_LABEL | null;
  const salarioBase = (colaborador as any)?.salario_base as number | null;
  const valorHora = (colaborador as any)?.valor_hora as number | null;
  const baseSalarial = (colaborador as any)?.base_salarial as number | null;
  const baseHorasMes = (colaborador as any)?.base_horas_mes as number | null;
  const baseDiasMes = (colaborador as any)?.base_dias_mes as number | null;
  const valorHoraManual = (colaborador as any)?.valor_hora_manual as boolean | null;
  const adicionalPercentual = (colaborador as any)?.adicional_percentual as number | null;
  const dependentesIrrf = (colaborador as any)?.dependentes_irrf as number | null;
  const valeTransporte = (colaborador as any)?.vale_transporte as boolean | null;
  const valeTransporteDia = (colaborador as any)?.vale_transporte_valor_dia as number | null;
  const premioAssiduidade = (colaborador as any)?.premio_assiduidade as boolean | null;
  const premioAssiduidadeValor = (colaborador as any)?.premio_assiduidade_valor as number | null;
  const assiduidadeCriterio = (colaborador as any)?.assiduidade_criterio as keyof typeof ASSIDUIDADE_CRITERIO_LABEL | null;
  const assiduidadeTolerancia = (colaborador as any)?.assiduidade_tolerancia_min as number | null;
  const assiduidadeMaxAtrasos = (colaborador as any)?.assiduidade_max_atrasos as number | null;
  const assiduidadeConsideraAtestado = (colaborador as any)?.assiduidade_considera_atestado as boolean | null;
  const assiduidadeMaxAtestados = (colaborador as any)?.assiduidade_max_atestados as number | null;
  const premioTipo = (colaborador as any)?.premio_assiduidade_tipo as keyof typeof PREMIO_TIPO_LABEL | null;
  const pisNit = (colaborador as any)?.pis_nit as string | null;

  // Vales: campos de ciclo/pagamento e descontos configurados no cadastro.
  const vaDiaPagamento = (colaborador as any)?.vale_alimentacao_dia_pagamento as number | null;
  const vaDiasCorte = (colaborador as any)?.vale_alimentacao_dias_corte as number | null;
  const vaDescontos = [
    (colaborador as any)?.vale_alimentacao_desconta_falta ? "falta" : null,
    (colaborador as any)?.vale_alimentacao_desconta_folga_extra ? "folga extra" : null,
    (colaborador as any)?.vale_alimentacao_desconta_atestado ? "atestado" : null,
    (colaborador as any)?.vale_alimentacao_desconta_ferias ? "férias" : null,
  ].filter(Boolean) as string[];
  const vtDiaPagamento = (colaborador as any)?.vale_transporte_dia_pagamento as number | null;
  const vtDiasCorte = (colaborador as any)?.vale_transporte_dias_corte as number | null;
  const vtDescontos = [
    (colaborador as any)?.vale_transporte_desconta_falta ? "falta" : null,
    (colaborador as any)?.vale_transporte_desconta_folga_extra ? "folga extra" : null,
    (colaborador as any)?.vale_transporte_desconta_atestado ? "atestado" : null,
    (colaborador as any)?.vale_transporte_desconta_ferias ? "férias" : null,
  ].filter(Boolean) as string[];

  // Valor da hora / do dia só são gravados quando digitados: aqui derivamos da base.
  const baseCalculo = baseSalarial ?? salarioBase ?? null;
  const horasBase = baseHorasMes ?? BASE_HORAS_MES_PADRAO;
  const diasBase = baseDiasMes ?? BASE_DIAS_MES_PADRAO;
  const valorHoraCalculado = valorHoraPorBase(baseCalculo, horasBase);
  const valorHoraExibido = valorHora ?? valorHoraCalculado;
  const valorDiaExibido = valorDiaPorBase(baseCalculo, diasBase);
  const insalubridadeValor = insalubridade ? valorAdicional(baseCalculo ?? 0, insalubridade) : 0;
  const periculosidadeValor = periculosidade ? valorAdicional(baseCalculo ?? 0, periculosidade) : 0;
  const temBeneficio = beneficioAtivos.length > 0 || !!va || !!valeTransporte;

  if (!colaborador) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden p-0 [&>button]:hidden">
        <DialogHeader className="shrink-0 border-b border-border bg-background p-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-xl font-bold uppercase leading-tight">
                  {colaborador?.nome || "Colaborador"}
                </DialogTitle>
                {colaborador?.ativo ? (
                  <Badge variant="outline" className="h-5 border-emerald-500/30 bg-emerald-500/10 px-1.5 text-[11px] text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="mr-1 h-3 w-3" /> Ativo
                  </Badge>
                ) : (
                  <Badge variant="outline" className="h-5 border-destructive/30 bg-destructive/10 px-1.5 text-[11px] text-destructive">
                    <XCircle className="mr-1 h-3 w-3" /> Desligado
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className={`h-5 px-1.5 text-[11px] ${
                    perfil === "admin"
                      ? "bg-destructive/10 text-destructive border-destructive/30"
                      : perfil === "gestor"
                      ? "bg-primary/10 text-primary border-primary/30"
                      : ""
                  }`}
                >
                  <Shield className="mr-1 h-3 w-3" />
                  {PERFIL_LABEL[perfil ?? "colaborador"]}
                </Badge>
              </div>
              <DialogDescription className="mt-1">
                Ficha completa do colaborador. Clique em <strong>Editar</strong> para alterar os dados.
              </DialogDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                size="sm"
                onClick={() => { onOpenChange(false); onEdit(); }}
              >
                <Pencil className="mr-2 h-4 w-4" aria-hidden="true" /> Editar
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => onOpenChange(false)}
                aria-label="Fechar ficha"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6 pt-4">
          {/* Identificação */}
          <Section icon={User} title="Identificação">
            <Field label="CPF" value={colaborador?.cpf ? maskCpf(colaborador.cpf) : "—"} />
            <Field label="Matrícula" value={colaborador?.matricula} />
            <Field label="Tipo de Vínculo" value={vinculoLabel(colaborador as any)} />
            <Field label="Data de Nascimento" value={fmtDate((colaborador as any)?.data_nascimento)} />
          </Section>

          {/* Contato e vínculo */}
          <Section icon={Mail} title="Contato e Vínculo">
            <Field label="E-mail" value={(colaborador as any)?.email} />
            <Field label="WhatsApp" value={(colaborador as any)?.whatsapp} />
            <Field label="Cargo" value={colaborador?.cargo_nome ?? (colaborador as any)?.cargo} />
            <Field label="Unidade" value={colaborador?.unidade_nome} />
            <Field label="Data de Admissão" value={fmtDate((colaborador as any)?.data_admissao)} />
            <Field label="Folga Fixa Semanal" value={folga != null ? DIAS_SEMANA[String(folga)] : "—"} />
            <Field label="Sindicato Laboral" value={enquadramento.data?.laboral?.nome} />
            <Field label="Sindicato Patronal" value={enquadramento.data?.patronal?.nome} />

          </Section>

          {/* Jornada e horários */}
          <Section icon={Clock} title="Horário de Trabalho">
            <Field
              label="Carga Semanal"
              value={
                cargaSemanalCalculada
                  ? `${cargaSemanalCalculada.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}h · ${diasTrabalhadosSemana} dia(s) por semana`
                  : "—"
              }
            />
            <Field
              label="Folga Semanal"
              value={
                configDominio?.folga_variavel
                  ? "Conforme escala"
                  : folga != null
                  ? DIAS_SEMANA[String(folga)]
                  : configDominio?.folga_fixa_dow != null
                  ? DIAS_SEMANA[String(configDominio.folga_fixa_dow)]
                  : "—"
              }
            />
            <Field label="Unidade da Configuração" value={unidadeConfigNome ?? colaborador?.unidade_nome} />
            <Field
              label="Turno Padrão"
              value={
                turnoPadrao
                  ? `${turnoPadrao.nome} · ${turnoPadrao.entrada} às ${turnoPadrao.saida}`
                  : "Sem turno padrão"
              }
            />
            <Field
              label="Folha de Ponto"
              value={possuiFolha ? "Sim — vinculado à folha de ponto" : "Não"}
            />
            <Field
              label="Adiantamento Salarial"
              value={optanteAdiantamento ? "Optante" : "Não optante"}
            />
            <Field label="Vigência da Configuração" value={fmtDate((configVigente as any)?.vigencia_inicio)} />
            <Field label="Observações da Jornada" value={(configVigente as any)?.observacoes} />
            {resumoFaixas && (
              <div className="col-span-full space-y-1">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Resumo da semana
                </div>
                <div className="text-sm text-foreground">{resumoFaixas}</div>
              </div>
            )}
            <div className="col-span-full space-y-1">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Horários por dia da semana
              </div>
              {detalhesCarga.length > 0 ? (
                <div className="divide-y divide-border rounded-md border border-border">
                  {detalhesCarga.map((d) => (
                    <div key={d.dow} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
                      <span className="text-muted-foreground">{DIAS_SEMANA[String(d.dow)]}</span>
                      <span className={d.trabalha ? "font-medium" : "text-muted-foreground"}>
                        {!d.trabalha
                          ? "Folga"
                          : d.turno
                          ? `${d.turno.entrada || "—"} às ${d.turno.saida || "—"}${
                              d.turno.intervalo_minutos ? ` · ${d.turno.intervalo_minutos} min de intervalo` : ""
                            }${d.origem === "base" ? " · horário do turno" : ""}`
                          : "Sem horário definido"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Nenhum horário configurado para este colaborador.
                </div>
              )}
            </div>
          </Section>

          {/* Remuneração */}
          <Section icon={Wallet} title="Remuneração">
            <Field label="Forma de Pagamento" value={formaPagamento ? FORMA_PAGAMENTO_LABEL[formaPagamento] : "—"} />
            <Field label="Salário Base" value={fmtCurrency(salarioBase)} />
            <Field
              label="Valor da Hora"
              value={
                valorHoraExibido != null
                  ? `${fmtCurrency(valorHoraExibido)}${valorHora == null ? " (calculado)" : valorHoraManual ? " (manual)" : ""}`
                  : "—"
              }
            />
            <Field
              label="Valor do Dia"
              value={valorDiaExibido != null ? `${fmtCurrency(valorDiaExibido)} (calculado)` : "—"}
            />
            <Field
              label="Base de Cálculo"
              value={
                baseCalculo != null
                  ? `${fmtCurrency(baseCalculo)} / ${horasBase}h · ${diasBase} dias`
                  : "—"
              }
            />
            <Field label="PIS/NIT" value={pisNit} />
            <Field
              label="Insalubridade"
              value={insalubridade ? `${insalubridade}% · ${fmtCurrency(insalubridadeValor)}/mês` : "Não"}
            />
            <Field
              label="Periculosidade"
              value={periculosidade ? `${periculosidade}% · ${fmtCurrency(periculosidadeValor)}/mês` : "Não"}
            />
            <Field
              label="Adicional Aplicado na Folha"
              value={adicionalPercentual ? `${adicionalPercentual}%` : "—"}
            />
            <Field label="Dependentes IRRF" value={dependentesIrrf ?? "—"} />
            <Field label="Vale-Transporte" value={valeTransporte ? "Sim — ver Benefícios" : "Não"} />
            <Field label="Vale-Alimentação" value={va ? "Sim — ver Benefícios" : "Não"} />

            {/* Assiduidade fica em Remuneração (não é benefício) */}
            <div className="col-span-full space-y-2 rounded-xl border border-border bg-muted/40 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Award className="h-4 w-4 text-primary" aria-hidden="true" />
                Prêmio de assiduidade
              </div>
              {premioAssiduidade ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field
                    label="Valor do Prêmio"
                    value={
                      premioTipo === "percentual"
                        ? `${premioAssiduidadeValor ?? 0}% do salário`
                        : fmtCurrency(premioAssiduidadeValor)
                    }
                  />
                  <Field label="Tipo" value={premioTipo ? PREMIO_TIPO_LABEL[premioTipo] : "—"} />
                  <Field
                    label="Critério"
                    value={assiduidadeCriterio ? ASSIDUIDADE_CRITERIO_LABEL[assiduidadeCriterio] : "—"}
                  />
                  <Field
                    label="Tolerância de Atraso"
                    value={assiduidadeTolerancia != null ? `${assiduidadeTolerancia} min` : "—"}
                  />
                  <Field label="Máx. Atrasos Tolerados" value={assiduidadeMaxAtrasos ?? "—"} />
                  <Field
                    label="Atestado Faz Perder o Prêmio"
                    value={assiduidadeConsideraAtestado === false ? "Não" : "Sim"}
                  />
                  {assiduidadeConsideraAtestado !== false && (
                    <Field label="Atestados Tolerados no Mês" value={assiduidadeMaxAtestados ?? 0} />
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Colaborador sem prêmio de assiduidade.</p>
              )}
            </div>
          </Section>

          {/* Benefícios */}
          <Section icon={Briefcase} title="Benefícios">
            {va && (
              <div className="col-span-full space-y-2 rounded-lg border border-border p-3">
                <div className="text-sm font-medium text-foreground">Vale-alimentação</div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field
                    label="Valor"
                    value={`${fmtCurrency(vaValor)} ${vaPeriodicidade === "diario" ? "por dia" : "por mês"}${
                      vaPeriodicidade === "diario" && vaDiasBase ? ` · base ${vaDiasBase} dias` : ""
                    }`}
                  />
                  <Field
                    label="Dia de Pagamento"
                    value={vaDiaPagamento ? `Dia ${vaDiaPagamento}` : "—"}
                  />
                  <Field
                    label="Corte para Apuração"
                    value={vaDiasCorte != null ? `${vaDiasCorte} dia(s) antes do pagamento` : "—"}
                  />
                  <Field
                    label="Descontos Aplicados"
                    value={vaDescontos.length ? vaDescontos.join(", ") : "Nenhum"}
                  />
                  <Field
                    label="Desconto do Colaborador"
                    value={
                      vaDescontoTipo === "nenhum" || !vaDescontoValor
                        ? "Sem desconto"
                        : vaDescontoTipo === "percentual"
                        ? `${vaDescontoValor}%`
                        : fmtCurrency(vaDescontoValor)
                    }
                  />
                </div>
              </div>
            )}

            {valeTransporte && (
              <div className="col-span-full space-y-2 rounded-lg border border-border p-3">
                <div className="text-sm font-medium text-foreground">Vale-transporte</div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Valor" value={`${fmtCurrency(valeTransporteDia)} por dia`} />
                  <Field
                    label="Dia de Pagamento"
                    value={vtDiaPagamento ? `Dia ${vtDiaPagamento}` : "—"}
                  />
                  <Field
                    label="Corte para Apuração"
                    value={vtDiasCorte != null ? `${vtDiasCorte} dia(s) antes do pagamento` : "—"}
                  />
                  <Field
                    label="Descontos Aplicados"
                    value={vtDescontos.length ? vtDescontos.join(", ") : "Nenhum"}
                  />
                </div>
              </div>
            )}

            {beneficioAtivos.length > 0 && (
              <div className="col-span-full flex flex-wrap gap-2">
                {beneficioAtivos.map((b) => (
                  <Badge key={b.id} variant="outline" className="text-xs">
                    {b.beneficio_nome ?? "Benefício"}
                    {b.valor ? ` — ${fmtCurrency(b.valor)}` : ""}
                  </Badge>
                ))}
              </div>
            )}

            {!temBeneficio && (
              <div className="col-span-full text-sm text-muted-foreground">Nenhum benefício ativo.</div>
            )}

            <AdicionalTempoServicoCard
              admissao={(colaborador as any)?.data_admissao ?? null}
              cargoId={(colaborador as any)?.cargo_id ?? null}
              unidadeId={(colaborador as any)?.unidade_id ?? null}
              sindicatoId={enquadramento.data?.laboral?.id ?? null}
              base={baseCalculo ?? 0}
              pisoCargo={null}
              onBeforeNavigate={() => onOpenChange(false)}
            />
          </Section>

          {/* Dependentes */}
          <Section icon={Users} title="Dependentes">
            {dependentes.length > 0 ? (
              <div className="col-span-full divide-y divide-border rounded-md border border-border">
                {dependentes.map((d: any) => (
                  <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-sm">
                    <span className="font-medium">{d.nome}</span>
                    <span className="text-muted-foreground">
                      {fmtDate(d.data_nascimento)}
                      {d.dependente_irrf ? " · IRRF" : ""}
                      {d.salario_familia ? " · Salário-família" : ""}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="col-span-full text-sm text-muted-foreground">Nenhum dependente cadastrado.</div>
            )}
          </Section>

          {/* Acesso ao portal */}
          <Section icon={Lock} title="Acesso ao Portal">
            <Field
              label="Usuário Vinculado"
              value={userId ? "Sim — acesso liberado via CPF" : "Não vinculado"}
            />
            {userId && (
              <Field label="Login (CPF)" value={colaborador?.cpf ? maskCpf(colaborador.cpf) : "—"} />
            )}
          </Section>

          {/* Desligamento */}
          {isDesligado && (
            <Section icon={LogOut} title="Desligamento">
              <Field label="Data da Demissão" value={fmtDate(colaborador?.data_desligamento)} />
              <Field
                label="Motivo"
                value={
                  MOTIVO_DESLIGAMENTO_LABEL[(colaborador as any)?.motivo_desligamento as keyof typeof MOTIVO_DESLIGAMENTO_LABEL]
                }
              />
              <Field
                label="Elegibilidade para Recontratação"
                value={
                  ELEGIBILIDADE_LABEL[(colaborador as any)?.elegivel_recontratacao as keyof typeof ELEGIBILIDADE_LABEL]
                }
              />
              <Field label="Acesso ao Portal Até" value={fmtDate(acessoPortalAte)} />
              <Field label="Observações" value={(colaborador as any)?.observacao_desligamento} />
            </Section>
          )}
        </div>

      </DialogContent>
    </Dialog>
  );
}
