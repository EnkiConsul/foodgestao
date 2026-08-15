import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarOff, Info, AlertTriangle, Save, Trash2, Users, Clock, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDpTurnos, TURNO_FORM_DEFAULT } from "@/hooks/useDpTurnos";
import { CopiarConfigColaboradorDialog, type ConfigCopiada } from "@/components/dp/CopiarConfigColaboradorDialog";
import { CienciaLegalDialog } from "@/components/dp/CienciaLegalDialog";
import { useDpUnidades } from "@/hooks/useDpCadastros";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpColaboradorConfigTrabalho } from "@/hooks/useDpColaboradorConfigTrabalho";
import { contratoPolicy } from "@/lib/dp/contrato-policy";
import { formatarHoras, calcularCargaDia } from "@/lib/dp/jornada-utils";
import { formatarFaixaTurno, intervaloAbaixoDoLegal } from "@/lib/dp/turno-utils";
import { atalhosDeHorario, resolverTurnoDoHorario, type HorarioSimples } from "@/lib/dp/turno-resolver";
import { verificarAlertasClt, idadeNaData, temAlertaClt, type AlertaClt } from "@/lib/dp/clt-alertas";
import { tituloSistema } from "@/lib/text/titleCase";
import {
  cargaSemanalConfig, configTemErro, diasPadrao, DOW_LABEL, folgaFixaDerivada, normalizarDias,
  resumoConfigTexto, temHorarioProprio, turnoDoDia, validarConfigTrabalho,
  type DiaConfig, type TurnoResolvido,
} from "@/lib/dp/config-trabalho";

const hoje = () => new Date().toISOString().slice(0, 10);
const fmt = (d?: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : null);

const HORARIO_PADRAO: HorarioSimples = { entrada: "08:00", saida: "17:00", intervalo_minutos: 60 };

export interface JornadaColaborador {
  id?: string | null;
  nome?: string | null;
  regime?: string | null;
  unidade_id?: string | null;
  /** Base da vigência inicial da jornada. */
  data_admissao?: string | null;
  /** Usada apenas para os alertas de menor de 18 anos. */
  data_nascimento?: string | null;
}

/** Resultado do salvamento acionado de fora (pelo rodapé do cadastro). */
export type SalvarJornadaResultado = "salvo" | "nada" | "pendente_ciencia" | "erro";

interface Props {
  colaborador: JornadaColaborador | null;
  /** Recarrega o formulário com a configuração vigente quando muda para true. */
  active?: boolean;
  /** Mostra o botão "Salvar" dentro do painel. */
  showSaveButton?: boolean;
  /**
   * Registra o salvamento do painel para que o cadastro do colaborador possa
   * acioná-lo pelo botão único do rodapé. Recebe null ao desmontar.
   */
  onRegistrarSalvar?: (
    fn: (() => Promise<SalvarJornadaResultado>) | null,
  ) => void;

}


/**
 * Painel de horário de trabalho do colaborador.
 *
 * O empresário digita o horário direto (entrada, saída, intervalo) e marca os
 * dias trabalhados. O sistema converte isso, em silêncio, em um "horário da
 * loja" compartilhado (tabela dp_turnos) para que escala, ponto e folha
 * continuem lendo turno. Dias fora do padrão ficam como exceção no próprio
 * colaborador, sem criar horários novos na loja.
 */
export function ColaboradorJornadaPanel({
  colaborador, active = true, showSaveButton = true, onRegistrarSalvar,
}: Props) {
  const policy = contratoPolicy(colaborador?.regime);
  const { selectedCompanyId } = useCompanyContext();
  const { data: unidades = [] } = useDpUnidades();
  const { configs, vigente, isLoading, salvar, encerrar, remover, saving } =
    useDpColaboradorConfigTrabalho(colaborador?.id ?? undefined);

  const topoRef = useRef<HTMLDivElement | null>(null);
  const [unidadeId, setUnidadeId] = useState<string>("none");
  const [horario, setHorario] = useState<HorarioSimples>(HORARIO_PADRAO);
  const [folgaVariavel, setFolgaVariavel] = useState(false);
  const [dias, setDias] = useState<DiaConfig[]>(diasPadrao());
  const [inicio, setInicio] = useState(hoje());
  /** Houve alteração do usuário desde o carregamento — evita salvar sem motivo. */
  const [alterado, setAlterado] = useState(false);
  /** "base" = admissão (ou vigência atual) · "nova_data" = mudança de horário. */
  const [vigenciaModo, setVigenciaModo] = useState<"base" | "nova_data">("base");
  const admissao = colaborador?.data_admissao ?? null;
  const [obs, setObs] = useState("");
  const [copiarOpen, setCopiarOpen] = useState(false);
  const [cienciaOpen, setCienciaOpen] = useState(false);


  const { turnos: turnosUnidade, criar: criarTurno } = useDpTurnos(unidadeId === "none" ? null : unidadeId);
  const turnosAtivos = useMemo(() => turnosUnidade.filter((t) => t.ativo), [turnosUnidade]);

  const turnosResolvidos: TurnoResolvido[] = useMemo(
    () => turnosAtivos.map((t) => ({
      id: t.id,
      nome: t.nome,
      cor: t.cor,
      entrada: (t.entrada ?? "").slice(0, 5),
      saida: (t.saida ?? "").slice(0, 5),
      intervalo_minutos: t.intervalo_minutos ?? 0,
    })),
    [turnosAtivos],
  );

  const atalhos = useMemo(() => atalhosDeHorario(turnosResolvidos).slice(0, 6), [turnosResolvidos]);

  // Recarrega o formulário com a configuração vigente sempre que o painel ativa.
  useEffect(() => {
    if (!active) return;
    if (vigente) {
      setUnidadeId(vigente.unidade_id ?? "none");
      setFolgaVariavel(vigente.folga_variavel);
      setDias(normalizarDias(vigente.dias, vigente.folga_fixa_dow));
      setObs(vigente.observacoes ?? "");
      setInicio(vigente.vigencia_inicio ?? admissao ?? hoje());
    } else {
      setUnidadeId(colaborador?.unidade_id ?? "none");
      setFolgaVariavel(false);
      setDias(diasPadrao());
      setObs("");
      setInicio(admissao ?? hoje());
    }
    setVigenciaModo("base");
    setAlterado(false);

  }, [active, vigente, colaborador?.unidade_id, admissao]);

  // O horário principal da tela vem do turno padrão gravado na vigência.
  useEffect(() => {
    if (!active || !vigente?.turno_padrao_id) return;
    const t = turnosResolvidos.find((x) => x.id === vigente.turno_padrao_id);
    if (t?.entrada && t?.saida) {
      setHorario({ entrada: t.entrada, saida: t.saida, intervalo_minutos: t.intervalo_minutos ?? 0 });
    }
  }, [active, vigente?.turno_padrao_id, turnosResolvidos]);

  /** Turno virtual que representa o horário digitado — só para cálculo na tela. */
  const turnoPadraoTela: TurnoResolvido = useMemo(
    () => ({ id: "padrao-tela", nome: "Horário de Trabalho", cor: null, ...horario }),
    [horario],
  );

  const config = useMemo(
    () => ({
      turno_padrao_id: turnoPadraoTela.id,
      folga_variavel: folgaVariavel,
      folga_fixa_dow: null as number | null,
      dias,
    }),
    [turnoPadraoTela.id, folgaVariavel, dias],
  );

  const turnosTela = useMemo(() => [turnoPadraoTela, ...turnosResolvidos], [turnoPadraoTela, turnosResolvidos]);

  const validacoes = useMemo(
    () => validarConfigTrabalho(config, turnosTela, { regime: colaborador?.regime, vigenciaInicio: inicio }),
    [config, turnosTela, colaborador?.regime, inicio],
  );
  const carga = cargaSemanalConfig(config, turnosTela);
  const bloqueado = configTemErro(validacoes);
  const folgas = folgaFixaDerivada(dias);

  /**
   * Alertas trabalhistas do horário resolvido de cada dia.
   *
   * O escopo do que é verificado sai da política do contrato: no intermitente,
   * freelancer, PJ e MEI o cadastro é apenas disponibilidade, então só valem as
   * regras de menor de idade e o informativo de adicional noturno.
   */
  const alertas: AlertaClt[] = useMemo(() => {
    const idade = idadeNaData(colaborador?.data_nascimento, inicio);
    return verificarAlertasClt({
      idade,
      regime: colaborador?.regime,
      folgaVariavel,
      dias: dias.map((d) => {
        const t = turnoDoDia(d, turnoPadraoTela.id, turnosTela);
        return {
          dow: d.dow,
          trabalha: d.trabalha,
          entrada: t?.entrada ?? null,
          saida: t?.saida ?? null,
          intervalo_minutos: t?.intervalo_minutos ?? null,
        };
      }),
    });
  }, [
    dias, turnoPadraoTela.id, turnosTela, folgaVariavel,
    colaborador?.data_nascimento, colaborador?.regime, inicio,
  ]);

  const avisos = alertas.filter((a) => a.severidade === "aviso");
  const infos = alertas.filter((a) => a.severidade === "info");

  /** Qualquer alteração do usuário habilita o salvamento pelo rodapé do cadastro. */
  const marcarAlterado = () => setAlterado(true);

  const alternarDia = (dow: number) => {
    marcarAlterado();
    setDias((prev) => prev.map((d) => (d.dow === dow
      ? { ...d, trabalha: !d.trabalha, entrada: null, saida: null, intervalo_minutos: null }
      : d)));
  };

  /** Liga/desliga o horário próprio do dia, partindo do horário atualmente previsto. */
  const alternarHorarioProprio = (dow: number, ativar: boolean) => {
    marcarAlterado();
    setDias((prev) => prev.map((d) => {
      if (d.dow !== dow) return d;
      if (!ativar) return { ...d, entrada: null, saida: null, intervalo_minutos: null };
      return { ...d, ...horario };
    }));
  };

  const definirHorarioDia = (dow: number, patch: Partial<HorarioSimples>) => {
    marcarAlterado();
    setDias((prev) => prev.map((d) => (d.dow === dow ? { ...d, ...patch } : d)));
  };

  const definirHorario = (patch: Partial<HorarioSimples>) => {
    marcarAlterado();
    setHorario((h) => ({ ...h, ...patch }));
  };

  /** Atalhos de escala: 6x1 folga no domingo e 5x2 folga sábado e domingo. */
  const aplicarEscala = (modo: "6x1" | "5x2") => {
    marcarAlterado();
    setFolgaVariavel(false);
    const folgar = modo === "6x1" ? [0] : [0, 6];
    setDias((prev) => prev.map((d) => (folgar.includes(d.dow)
      ? { ...d, trabalha: false, entrada: null, saida: null, intervalo_minutos: null }
      : { ...d, trabalha: true })));
  };

  const onCopiarConfig = (c: ConfigCopiada) => {
    marcarAlterado();
    setFolgaVariavel(c.folga_variavel);
    setDias(normalizarDias(c.dias));
    const base = c.turno_padrao_id ? turnosResolvidos.find((t) => t.id === c.turno_padrao_id) : null;
    if (base?.entrada && base?.saida) {
      setHorario({ entrada: base.entrada, saida: base.saida, intervalo_minutos: base.intervalo_minutos ?? 0 });
    }
    toast.success("Configuração copiada — revise e salve");
  };


  /**
   * Converte o horário digitado em um horário da loja: reaproveita um turno com
   * o mesmo horário na unidade ou cria um novo, sem pedir nada ao usuário.
   */
  const resolverTurnoPadrao = async (): Promise<string> => {
    const unidade = unidadeId === "none" ? null : unidadeId;
    const decisao = resolverTurnoDoHorario(horario, turnosResolvidos.map((t) => ({ ...t, ativo: true })), unidade);
    if (decisao.tipo === "reaproveita") return decisao.turno.id;
    const criado = await criarTurno.mutateAsync({
      form: {
        ...TURNO_FORM_DEFAULT,
        unidade_id: unidade,
        nome: decisao.novo.nome,
        categoria: decisao.novo.categoria,
        entrada: decisao.novo.entrada,
        saida: decisao.novo.saida,
        intervalo_minutos: decisao.novo.intervalo_minutos,
      },
      ciencia: intervaloAbaixoDoLegal(horario)
        ? { confirmada: true, justificativa: "Horário definido no cadastro do colaborador" }
        : null,
    });
    return criado.id;
  };

  /** Registra a ciência dos desvios da CLT em dp_regras_historico. */
  const registrarCiencia = async (justificativa: string) => {
    if (!selectedCompanyId) return;
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user?.id) return;
      await supabase.from("dp_regras_historico").insert({
        company_id: selectedCompanyId,
        usuario_id: auth.user.id,
        tabela: "dp_colaborador_config_trabalho",
        registro_id: colaborador?.id ?? null,
        valor_antigo: null as never,
        valor_novo: {
          vigencia_inicio: inicio,
          horario,
          dias,
          alertas: avisos.map((a) => ({ codigo: a.codigo, mensagem: a.mensagem })),
        } as never,
        justificativa: justificativa || null,
        ciencia_confirmada: true,
      });
    } catch { /* o cadastro não deve falhar por causa do log */ }
  };

  const persistir = async () => {
    const turnoPadraoId = await resolverTurnoPadrao();
    await salvar.mutateAsync({
      unidade_id: unidadeId === "none" ? null : unidadeId,
      turno_padrao_id: turnoPadraoId,
      folga_variavel: folgaVariavel,
      folga_fixa_dow: folgaVariavel || folgas.length !== 1 ? null : folgas[0],
      observacoes: obs.trim() || null,
      vigencia_inicio: inicio,
      dias: dias.map((d) => ({ ...d, turno_id: null })),
    });
    setAlterado(false);
    toast.success("Horário de trabalho salvo");
    // Feedback: o topo do painel mostra a vigência gravada.
    topoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const onSalvar = async () => {
    if (!colaborador?.id) {
      toast.error("Salve os dados do colaborador antes de definir o horário.");
      return;
    }
    if (!horario.entrada || !horario.saida) { toast.error("Informe a entrada e a saída."); return; }
    if (bloqueado) { toast.error("Corrija os pontos indicados antes de salvar."); return; }
    if (temAlertaClt(alertas)) { setCienciaOpen(true); return; }
    try {
      await persistir();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o horário");
    }
  };

  const onConfirmarCiencia = async (justificativa: string) => {
    setCienciaOpen(false);
    try {
      await registrarCiencia(justificativa);
      await persistir();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o horário");
    }
  };

  /**
   * Salvamento acionado pelo botão único do cadastro do colaborador.
   * Devolve "pendente_ciencia" quando ainda falta a confirmação dos avisos —
   * nesse caso o cadastro permanece aberto nesta aba.
   */
  const salvarExterno = async (): Promise<SalvarJornadaResultado> => {
    if (!colaborador?.id || !alterado) return "nada";
    if (!horario.entrada || !horario.saida) {
      toast.error("Informe a entrada e a saída do horário de trabalho.");
      return "erro";
    }
    if (bloqueado) {
      toast.error("Corrija os pontos indicados no horário de trabalho.");
      return "erro";
    }
    if (temAlertaClt(alertas)) {
      setCienciaOpen(true);
      return "pendente_ciencia";
    }
    try {
      await persistir();
      return "salvo";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o horário");
      return "erro";
    }
  };


  const salvarExternoRef = useRef(salvarExterno);
  salvarExternoRef.current = salvarExterno;

  useEffect(() => {
    if (!onRegistrarSalvar) return;
    onRegistrarSalvar(() => salvarExternoRef.current());
    return () => onRegistrarSalvar(null);
  }, [onRegistrarSalvar]);


  const cargaDiaria = calcularCargaDia(horario);

  return (
    <div ref={topoRef} className="space-y-5">

      {!colaborador?.id && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Defina o horário agora: ele será gravado automaticamente logo após o colaborador ser criado.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setCopiarOpen(true)}>
          <Users className="h-4 w-4" aria-hidden="true" />
          {tituloSistema("Copiar de Outro Colaborador")}
        </Button>
      </div>

      {policy.jornadaHint && (
        <p className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span><strong className="text-foreground">Contrato {policy.label}.</strong> {policy.jornadaHint}</span>
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ct-unidade">Unidade</Label>
          <Select value={unidadeId} onValueChange={(v) => { marcarAlterado(); setUnidadeId(v); }}>
            <SelectTrigger id="ct-unidade"><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem unidade definida</SelectItem>
              {unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ct-inicio">Vigência</Label>
          {vigenciaModo === "base" && (vigente || admissao) ? (
            <div className="space-y-1.5">
              <p className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                {vigente
                  ? <>Mantém a vigência atual: <strong className="text-foreground">{fmt(inicio)}</strong></>
                  : <>Vigente desde a admissão: <strong className="text-foreground">{fmt(inicio)}</strong></>}
              </p>
              <Button
                type="button" variant="link" size="sm" className="h-auto p-0 text-xs"
                onClick={() => { setVigenciaModo("nova_data"); setInicio(hoje()); }}
              >
                Mudança de horário a partir de outra data
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Input
                id="ct-inicio" type="date" value={inicio}
                onChange={(e) => { marcarAlterado(); setInicio(e.target.value); }}
              />

              {(vigente || admissao) && (
                <Button
                  type="button" variant="link" size="sm" className="h-auto p-0 text-xs"
                  onClick={() => {
                    setVigenciaModo("base");
                    setInicio(vigente?.vigencia_inicio ?? admissao ?? hoje());
                  }}
                >
                  {vigente ? "Manter a vigência atual" : "Usar a data de admissão"}
                </Button>
              )}
              {!vigente && !admissao && (
                <p className="text-[11px] text-muted-foreground">
                  Informe a data de admissão no cadastro para que a vigência seja preenchida automaticamente.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <section className="space-y-3 rounded-lg border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
            {tituloSistema("Horário de Trabalho")}
          </h3>
          <span className="text-xs tabular-nums text-muted-foreground">{formatarHoras(cargaDiaria)}/dia</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="ct-entrada">Entrada</Label>
            <Input
              id="ct-entrada" type="time" value={horario.entrada}
              onChange={(e) => definirHorario({ entrada: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="ct-saida">Saída</Label>
            <Input
              id="ct-saida" type="time" value={horario.saida}
              onChange={(e) => definirHorario({ saida: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="ct-intervalo">Intervalo (min)</Label>
            <Input
              id="ct-intervalo" type="number" min={0} inputMode="numeric" value={horario.intervalo_minutos}
              onChange={(e) => definirHorario({ intervalo_minutos: Number(e.target.value || 0) })}
            />
          </div>
        </div>
        {atalhos.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">Horários já usados na loja:</span>
            {atalhos.map((t) => (
              <Button
                key={t.id} type="button" size="sm" variant="secondary" className="h-7 text-[11px]"
                onClick={() => definirHorario({
                  entrada: t.entrada, saida: t.saida, intervalo_minutos: t.intervalo_minutos ?? 0,
                })}
              >
                {formatarFaixaTurno(t)}
              </Button>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          {policy.horasPorConvocacao
            ? "Este é o horário habitual de disponibilidade. O que vale para pagamento é o que for efetivamente convocado e trabalhado."
            : "Este horário vale para todos os dias trabalhados. Dias diferentes ficam como exceção logo abaixo."}
        </p>

      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">{tituloSistema("Dias da Semana")}</h3>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => aplicarEscala("6x1")}>
              6x1
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => aplicarEscala("5x2")}>
              5x2
            </Button>
            <span className="text-xs tabular-nums text-muted-foreground">{formatarHoras(carga)}/semana</span>
          </div>
        </div>
        <ul className="divide-y rounded-lg border">
          {dias.map((dia) => {
            const proprio = temHorarioProprio(dia);
            const turno = turnoDoDia(dia, turnoPadraoTela.id, turnosTela);
            return (
              <li key={dia.dow} className="space-y-2 p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Switch
                    checked={dia.trabalha}
                    onCheckedChange={() => alternarDia(dia.dow)}
                    aria-label={`Trabalha ${DOW_LABEL[dia.dow]}`}
                  />
                  <span className="w-24 shrink-0 text-sm font-medium">{DOW_LABEL[dia.dow]}</span>
                  {dia.trabalha ? (
                    <div className="ml-auto flex items-center gap-2">
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {turno ? formatarFaixaTurno(turno) : "sem horário"}
                      </span>
                      {proprio && <Badge variant="outline" className="text-[10px]">Exceção</Badge>}
                    </div>
                  ) : (
                    <Badge variant="secondary" className="ml-auto">Folga</Badge>
                  )}
                </div>

                {dia.trabalha && (
                  <div className="space-y-2 pl-[3.25rem]">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Switch
                        checked={proprio}
                        onCheckedChange={(v) => alternarHorarioProprio(dia.dow, v)}
                        aria-label={`Horário diferente em ${DOW_LABEL[dia.dow]}`}
                      />
                      Horário diferente neste dia
                    </label>
                    {proprio && (
                      <div className="grid gap-2 sm:grid-cols-3">
                        <div className="space-y-1">
                          <Label className="text-[11px]" htmlFor={`h-ent-${dia.dow}`}>Entrada</Label>
                          <Input
                            id={`h-ent-${dia.dow}`} type="time" className="h-9"
                            value={dia.entrada ?? ""}
                            onChange={(e) => definirHorarioDia(dia.dow, { entrada: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px]" htmlFor={`h-sai-${dia.dow}`}>Saída</Label>
                          <Input
                            id={`h-sai-${dia.dow}`} type="time" className="h-9"
                            value={dia.saida ?? ""}
                            onChange={(e) => definirHorarioDia(dia.dow, { saida: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px]" htmlFor={`h-int-${dia.dow}`}>Intervalo (min)</Label>
                          <Input
                            id={`h-int-${dia.dow}`} type="number" min={0} inputMode="numeric" className="h-9"
                            value={dia.intervalo_minutos ?? 0}
                            onChange={(e) => definirHorarioDia(dia.dow, { intervalo_minutos: Number(e.target.value || 0) })}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {policy.folgaSemanal !== "nao_se_aplica" && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
            <div className="min-w-0 text-xs">
              <p className="font-medium text-foreground">{tituloSistema(policy.folgaLabel)}</p>
              <p className="text-muted-foreground">
                {folgaVariavel
                  ? "A folga muda a cada semana e é definida na escala do mês."
                  : folgas.length === 0
                    ? "Nenhum dia de folga marcado acima."
                    : `Folga em ${folgas.map((d) => DOW_LABEL[d]).join(", ")} — desmarque o dia acima para alterar.`}
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch
                checked={folgaVariavel}
                onCheckedChange={(v) => { marcarAlterado(); setFolgaVariavel(v); }}
                aria-label="A folga varia conforme a escala"
              />
              Varia conforme a escala
            </label>
          </div>
        )}
      </section>

      {(avisos.length > 0 || infos.length > 0) && (
        <section className="space-y-1.5">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldAlert className="h-4 w-4 text-amber-600" aria-hidden="true" />
            {tituloSistema("Pontos de Atenção Trabalhista")}
          </h3>
          <ul className="space-y-1.5">
            {avisos.map((a) => (
              <li
                key={a.codigo}
                className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs text-amber-700 dark:text-amber-400"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {a.mensagem}
              </li>
            ))}
            {infos.map((a) => (
              <li key={a.codigo} className="flex items-start gap-2 rounded-lg border bg-muted/30 p-2.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {a.mensagem}
              </li>
            ))}
          </ul>
          {avisos.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              O cadastro não é bloqueado: ao salvar, você confirma a ciência e ela fica registrada no histórico.
            </p>
          )}
        </section>
      )}

      {validacoes.length > 0 && (
        <ul className="space-y-1.5">
          {validacoes.map((v, i) => (
            <li
              key={i}
              className={`flex items-start gap-2 rounded-lg border p-2.5 text-xs ${
                v.nivel === "erro"
                  ? "border-destructive/40 bg-destructive/5 text-destructive"
                  : "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400"
              }`}
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {v.mensagem}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="ct-obs">Observações</Label>
        <Textarea
          id="ct-obs" rows={2} value={obs}
          onChange={(e) => { marcarAlterado(); setObs(e.target.value); }}
        />

      </div>

      {showSaveButton && (
        <div className="flex justify-end">
          <Button className="gap-2" disabled={saving || bloqueado} onClick={() => void onSalvar()}>
            <Save className="h-4 w-4" aria-hidden="true" />
            {saving ? "Salvando..." : tituloSistema("Salvar Configuração")}
          </Button>
        </div>
      )}

      {colaborador?.id && (
        <section className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-semibold">{tituloSistema("Histórico de Vigências")}</h3>
          {isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : configs.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarOff className="h-4 w-4" aria-hidden="true" /> Nenhuma configuração registrada.
            </p>
          ) : (
            <ul className="divide-y">
              {configs.map((c) => {
                const ativo = !c.vigencia_fim || c.vigencia_fim >= hoje();
                return (
                  <li key={c.id} className="flex items-start justify-between gap-2 py-2">
                    <div className="min-w-0 text-sm">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {fmt(c.vigencia_inicio)} → {fmt(c.vigencia_fim) ?? "sem término"}
                        {ativo && <Badge>Vigente</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {resumoConfigTexto(
                          {
                            turno_padrao_id: c.turno_padrao_id,
                            folga_variavel: c.folga_variavel,
                            folga_fixa_dow: c.folga_fixa_dow,
                            dias: c.dias,
                          },
                          turnosResolvidos,
                        )}
                      </p>
                      {c.observacoes && <p className="text-xs text-muted-foreground">{c.observacoes}</p>}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {ativo && !c.vigencia_fim && (
                        <Button
                          size="sm" variant="outline" disabled={saving}
                          onClick={() => void encerrar.mutateAsync({ id: c.id })}
                        >
                          Encerrar hoje
                        </Button>
                      )}
                      <Button
                        size="icon" variant="ghost" aria-label="Remover configuração" disabled={saving}
                        onClick={() => void remover.mutateAsync(c.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <CienciaLegalDialog
        open={cienciaOpen}
        titulo="Horário fora da referência da CLT"
        alertas={avisos.map((a) => ({ campo: a.codigo, mensagem: a.mensagem }))}
        confirming={saving}
        onCancel={() => setCienciaOpen(false)}
        onConfirm={(j) => void onConfirmarCiencia(j)}
      />

      <CopiarConfigColaboradorDialog
        open={copiarOpen}
        onOpenChange={setCopiarOpen}
        colaboradorId={colaborador?.id ?? undefined}
        unidadeId={unidadeId === "none" ? null : unidadeId}
        turnos={turnosResolvidos}
        onCopiar={onCopiarConfig}
      />
    </div>
  );
}
