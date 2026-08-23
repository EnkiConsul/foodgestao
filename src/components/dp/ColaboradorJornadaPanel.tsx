import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CalendarOff, Info, AlertTriangle, Save, Trash2, Users, Clock, ShieldAlert, CopyPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDpTurnos, TURNO_FORM_DEFAULT } from "@/hooks/useDpTurnos";
import { CopiarConfigColaboradorDialog, type ConfigCopiada } from "@/components/dp/CopiarConfigColaboradorDialog";
import { CienciaLegalDialog } from "@/components/dp/CienciaLegalDialog";
import { useDpUnidades } from "@/hooks/useDpCadastros";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpColaboradorConfigTrabalho } from "@/hooks/useDpColaboradorConfigTrabalho";
import { useDpRegrasColaborador } from "@/hooks/useDpRegrasColaborador";
import { useDpModelosHorario, type ModeloHorarioColaborador } from "@/hooks/useDpModelosHorario";
import { chaveHorarioBase, contarHorariosBase, horarioBaseMaisComum, sugerirModeloHorario } from "@/lib/dp/modeloHorarioRanking";
import { contratoPolicy } from "@/lib/dp/contrato-policy";
import { formatarHoras } from "@/lib/dp/jornada-utils";
import { formatarFaixaTurno, intervaloAbaixoDoLegal } from "@/lib/dp/turno-utils";
import { resolverTurnoDoHorario, type HorarioSimples } from "@/lib/dp/turno-resolver";
import { verificarAlertasClt, idadeNaData, temAlertaClt, type AlertaClt } from "@/lib/dp/clt-alertas";
import { tituloSistema } from "@/lib/text/titleCase";
import {
  cargaSemanalConfig, configTemErro, copiarHorarioEntreDias, definirHorarioNoDia,
  detalharCargaSemanal, diaDivergeDoBase, horarioEfetivoDia, horarioPadraoDaSemana,
  diasPadrao, DOW_LABEL, DOW_CURTO, folgaFixaDerivada,
  normalizarDias, preencherDiasComHorario, resumoConfigTexto, resumoSemanaPorFaixas,
  turnoDoDia, validarConfigTrabalho,
  type DiaConfig, type TurnoResolvido,
} from "@/lib/dp/config-trabalho";


const hoje = () => new Date().toISOString().slice(0, 10);
const fmt = (d?: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : null);

/**
 * Sem horário compatível no cargo/unidade a tela abre vazia: preencher com
 * 08:00–17:00 fazia o cadastro nascer com um horário que a loja não usa.
 */
const HORARIO_VAZIO: HorarioSimples = { entrada: "", saida: "", intervalo_minutos: 0 };

/** Só o primeiro nome cabe no atalho — o nome completo fica no title. */
const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || nome;

/**
 * Identidade do horário de um colega, usada só para deduplicar os atalhos.
 *
 * Compara apenas horários (base + as variações de entrada/saída/intervalo dos
 * dias trabalhados) e ignora quais dias são folga: dois colegas com exatamente
 * o mesmo horário aparecem uma única vez na fileira, mesmo folgando em dias
 * diferentes. A cópia em si continua trazendo folgas e overrides.
 */
function assinaturaSemana(m: ModeloHorarioColaborador): string {
  const base = m.horario
    ? `${m.horario.entrada}-${m.horario.saida}-${m.horario.intervalo_minutos ?? 0}`
    : "sem-base";
  const variacoes = [...new Set(
    m.dias
      .filter((d) => d.trabalha && (d.entrada || d.saida))
      .map((d) => `${d.entrada ?? "="}-${d.saida ?? "="}-${d.intervalo_minutos ?? "="}`),
  )].sort().join("|");
  return `${base}#${variacoes}`;
}


/** Dias do colega com horário diferente do horário base dele. */
function diasDiferentesDoColega(m: ModeloHorarioColaborador): number[] {
  if (!m.horario) return [];
  return m.dias.filter((d) => d.trabalha && diaDivergeDoBase(d, m.horario!)).map((d) => d.dow);
}

export interface JornadaColaborador {
  id?: string | null;
  nome?: string | null;
  regime?: string | null;
  /** Rótulo do vínculo: o regime não distingue sócio de PJ. */
  vinculo_label?: string | null;
  unidade_id?: string | null;
  cargo_id?: string | null;
  /** Base da vigência inicial da jornada. */
  data_admissao?: string | null;
  /** Usada apenas para os alertas de menor de 18 anos. */
  data_nascimento?: string | null;
  /** Gênero informado no cadastro: define a regra de folga dominical aplicada. */
  sexo?: string | null;
  /** Override individual de folgas dominicais por mês (gênero fora de F/M). */
  domingos_folga_mes?: number | null;
}

/** Resultado do salvamento acionado de fora (pelo rodapé do cadastro). */
export type SalvarJornadaResultado = "salvo" | "nada" | "pendente_ciencia" | "cancelado" | "erro";

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
  const policy = contratoPolicy(colaborador?.regime, colaborador?.vinculo_label);
  const { selectedCompanyId } = useCompanyContext();
  const { data: unidades = [] } = useDpUnidades();
  const { configs, vigente, isLoading, salvar, encerrar, remover, saving } =
    useDpColaboradorConfigTrabalho(colaborador?.id ?? undefined);

  const topoRef = useRef<HTMLDivElement | null>(null);
  /**
   * A unidade é escolhida uma única vez, na aba "Dados" do cadastro: ter dois
   * campos de unidade permitia salvar a jornada em uma unidade diferente da do
   * colaborador. Aqui ela é só leitura.
   */
  const unidadeId = colaborador?.unidade_id ?? "none";
  const unidadeNome = unidades.find((u) => u.id === colaborador?.unidade_id)?.nome ?? null;

  /**
   * Regra de folgas da unidade (exceção da unidade → padrão da empresa), com o
   * override individual de domingos por mês quando o gênero é fora de F/M.
   */
  const {
    config: regrasCfg,
    diasElegiveis: diasElegiveisFolga,
    tetoMensal: tetoDomingos,
  } = useDpRegrasColaborador(
    selectedCompanyId ?? null,
    colaborador?.unidade_id ?? null,
    colaborador?.sexo ?? null,
    colaborador?.domingos_folga_mes ?? null,
  );


  /**
   * Referência usada apenas para preencher dias ainda em branco (colaborador
   * novo, vigência carregada, cópia de colega). O horário padrão de verdade é
   * derivado dos dias — a tela não tem mais um campo de horário base.
   */
  const [horarioReferencia, setHorarioReferencia] = useState<HorarioSimples>(HORARIO_VAZIO);
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
  /**
   * Quando o salvamento vem do rodapé do cadastro, a decisão do diálogo de
   * ciência precisa devolver o resultado para o fluxo que está aguardando —
   * assim um único "Concluir" já salva e fecha a tela.
   */
  const cienciaPendenteRef = useRef<((r: SalvarJornadaResultado) => void) | null>(null);
  const sugestaoAplicadaRef = useRef<string | null>(null);
  const [origemSugestao, setOrigemSugestao] = useState<"cargo" | "sem_compativel" | null>(null);


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

  /**
   * Atalhos de horário mostrados por nome de colaborador: o empresário reconhece
   * "o horário da Cristiane", não a faixa de horas solta.
   */
  const unidadeIdModelo = unidadeId === "none" ? colaborador?.unidade_id ?? null : unidadeId;
  const { modelos } = useDpModelosHorario(unidadeIdModelo, colaborador?.id ?? null);
  const atalhosColegas = useMemo(() => {
    const cargoId = colaborador?.cargo_id ?? null;
    // Quantos colegas usam cada horário base: o horário da loja é o mais
    // repetido, não o primeiro que foi cadastrado.
    const contagem = contarHorariosBase(modelos);
    const usos = (m: typeof modelos[number]) => (m.horario
      ? contagem.get(chaveHorarioBase(m.horario))?.quantidade ?? 0
      : 0);
    const ordenados = [...modelos].sort((a, b) => {
      const aMesmoCargo = (a.cargo_id ?? null) === cargoId ? 1 : 0;
      const bMesmoCargo = (b.cargo_id ?? null) === cargoId ? 1 : 0;
      if (aMesmoCargo !== bMesmoCargo) return bMesmoCargo - aMesmoCargo;
      if (usos(a) !== usos(b)) return usos(b) - usos(a);
      return (b.usado_em ?? "").localeCompare(a.usado_em ?? "");
    });
    const vistos = new Set<string>();
    return ordenados
      .filter((m) => !!m.horario)
      .filter((m) => {
        // A semana inteira entra na chave: dois colegas com o mesmo horário base
        // podem ter dias com horário diferente (padrão da loja no movimento).
        if (vistos.has(assinaturaSemana(m))) return false;
        vistos.add(assinaturaSemana(m));
        return true;
      })
      .slice(0, 10);
  }, [modelos, colaborador?.cargo_id]);



  /**
   * Colaborador novo sem histórico de jornada abre com o horário base mais
   * usado pelos colegas (unidade e, quando houver, o mesmo cargo) em vez do
   * 08:00–17:00 fixo — inclusive quando o cargo ainda não foi escolhido.
   */
  /**
   * A sugestão só vale entre colegas do MESMO cargo na unidade. Sem colega no
   * cargo, o horário fica em branco: um motoqueiro noturno não pode herdar o
   * horário diurno de outro cargo só porque é o mais usado na loja.
   */
  const modelosDoCargo = useMemo(
    () => (colaborador?.cargo_id ? modelos.filter((m) => m.cargo_id === colaborador.cargo_id) : []),
    [modelos, colaborador?.cargo_id],
  );

  useEffect(() => {
    if (!active || vigente || colaborador?.id || alterado) return;
    if (horarioAplicadoRef.current) return;
    if (modelosDoCargo.length === 0) return;
    const base = horarioBaseMaisComum(modelosDoCargo, colaborador?.cargo_id ?? null);
    if (!base) return;
    horarioAplicadoRef.current = "base-cargo";
    setHorarioReferencia(base);
  }, [active, vigente, colaborador?.id, colaborador?.cargo_id, alterado, modelosDoCargo]);

  useEffect(() => {
    if (!active || vigente || colaborador?.id || !colaborador?.cargo_id || alterado) return;
    const chave = `${colaborador?.nome ?? "novo"}:${colaborador?.cargo_id}:${colaborador?.unidade_id ?? "sem-unidade"}:${admissao ?? "sem-admissao"}`;
    if (sugestaoAplicadaRef.current === chave) return;
    const modelo = sugerirModeloHorario(modelosDoCargo, colaborador?.cargo_id);
    sugestaoAplicadaRef.current = chave;
    if (!modelo?.horario) {
      setOrigemSugestao("sem_compativel");
      return;
    }
    horarioAplicadoRef.current = "sugestao";
    setHorarioReferencia(modelo.horario);
    setDias(normalizarDias(modelo.dias));
    setFolgaVariavel(modelo.folga_variavel);
    setAlterado(true);
    setOrigemSugestao("cargo");
  }, [active, vigente, colaborador?.id, colaborador?.nome, colaborador?.cargo_id, colaborador?.unidade_id, admissao, alterado, modelosDoCargo]);

  // Recarrega o formulário com a configuração vigente sempre que o painel ativa.
  useEffect(() => {
    if (!active) return;
    if (vigente) {
      setFolgaVariavel(vigente.folga_variavel);
      setDias(normalizarDias(vigente.dias, vigente.folga_fixa_dow));
      setObs(vigente.observacoes ?? "");
      setInicio(vigente.vigencia_inicio ?? admissao ?? hoje());
    } else {
      setFolgaVariavel(false);

      setDias(diasPadrao());
      setObs("");
      setInicio(admissao ?? hoje());
    }
    setVigenciaModo("base");
    setAlterado(false);
    // Nova vigência carregada: o horário base pode ser reaplicado.
    horarioAplicadoRef.current = null;

  }, [active, vigente, colaborador?.unidade_id, admissao]);


  /**
   * O horário principal da tela vem do turno padrão gravado na vigência — e é
   * aplicado uma única vez por vigência carregada. Sem esse controle, o efeito
   * reaplicava o turno antigo a cada render e desfazia o horário copiado de
   * outro colaborador ou vindo da grade da unidade.
   */
  const horarioAplicadoRef = useRef<string | null>(null);
  useEffect(() => {
    if (!active) return;
    const id = vigente?.turno_padrao_id ?? null;
    if (!id || horarioAplicadoRef.current === id) return;
    const t = turnosResolvidos.find((x) => x.id === id);
    if (!t?.entrada || !t?.saida) return;
    horarioAplicadoRef.current = id;
    setHorarioReferencia({ entrada: t.entrada, saida: t.saida, intervalo_minutos: t.intervalo_minutos ?? 0 });
  }, [active, vigente?.turno_padrao_id, turnosResolvidos]);


  /**
   * Horário principal do colaborador: o que mais se repete nos dias trabalhados.
   * É o único que vira turno na loja; os dias diferentes ficam como horário do
   * próprio colaborador, sem criar turno novo.
   */
  const horario = useMemo<HorarioSimples>(
    () => horarioPadraoDaSemana(dias, horarioReferencia),
    [dias, horarioReferencia],
  );

  /**
   * Todo dia trabalhado mostra o horário preenchido: nada fica "herdando" em
   * silêncio. Só roda depois que a referência é resolvida (turno da vigência,
   * cópia de colega ou grade da unidade).
   */
  useEffect(() => {
    if (vigente?.turno_padrao_id && !horarioAplicadoRef.current) return;
    setDias((prev) => preencherDiasComHorario(prev, horarioReferencia));
  }, [horarioReferencia, vigente?.turno_padrao_id]);

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
  const detalheCarga = useMemo(() => detalharCargaSemanal(config, turnosTela), [config, turnosTela]);
  const carga = cargaSemanalConfig(config, turnosTela);
  const bloqueado = configTemErro(validacoes);
  const folgas = folgaFixaDerivada(dias);

  /**
   * Regra de folga dominical efetiva deste colaborador.
   *
   * A frequência sai da configuração da unidade (tela Folgas > Regras); quando o
   * gênero informado não é feminino nem masculino, vale o override individual
   * cadastrado na aba Dados.
   */
  const regraDominical = useMemo(() => {
    const domingosMes = tetoDomingos;
    const trabalhaDomingo = dias.some((d) => d.dow === 0 && d.trabalha);
    const generoDefinido = colaborador?.sexo === "F" || colaborador?.sexo === "M";
    const override = colaborador?.domingos_folga_mes ?? null;

    const baseTexto =
      regrasCfg.tipo_descanso_domingo === "acordo_coletivo"
        ? `Base: acordo/convenção coletiva — dias negociados: ${
            diasElegiveisFolga.map((d) => DOW_CURTO[d]).join(", ") || "—"
          }.`
        : "Base: legislação (folga no domingo).";

    const origem = override
      ? " (definido no cadastro deste colaborador)"
      : colaborador?.sexo === "F"
        ? " (regra de mulheres da unidade — Art. 386 da CLT)"
        : " (regra geral da unidade)";

    let alerta: string | null = null;
    if (!generoDefinido && !override) {
      alerta =
        "Gênero não informado na aba Dados: o sistema está aplicando a regra geral da unidade.";
    } else if (!trabalhaDomingo) {
      alerta = null;
    } else if (folgaVariavel) {
      alerta = null;
    }

    return { domingosMes, baseTexto, origem, alerta, trabalhaDomingo };
  }, [
    tetoDomingos, dias, folgaVariavel, diasElegiveisFolga,
    regrasCfg.tipo_descanso_domingo, colaborador?.sexo, colaborador?.domingos_folga_mes,
  ]);

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
      ? (d.trabalha
        ? { ...d, trabalha: false, turno_id: null, entrada: null, saida: null, intervalo_minutos: null }
        : {
          ...d,
          trabalha: true,
          turno_id: null,
          entrada: horario.entrada,
          saida: horario.saida,
          intervalo_minutos: horario.intervalo_minutos ?? 0,
        })
      : d)));
  };

  /**
   * Edição direta do horário do dia: o campo já vem preenchido com o horário
   * previsto e o que o usuário digitar passa a valer só para aquele dia.
   */
  const definirHorarioDia = (dow: number, patch: Partial<HorarioSimples>) => {
    marcarAlterado();
    setDias((prev) => {
      const dia = prev.find((d) => d.dow === dow);
      if (!dia) return prev;
      return definirHorarioNoDia(prev, dow, { ...horarioEfetivoDia(dia, horario), ...patch });
    });
  };

  /** Repete o horário de um dia nos dias escolhidos. */
  const repetirHorario = (dow: number, destinos: number[]) => {
    if (destinos.length === 0) return;
    marcarAlterado();
    setDias((prev) => copiarHorarioEntreDias(prev, dow, destinos, horario));
    toast.success(`Horário repetido em ${destinos.map((d) => DOW_CURTO[d]).join(", ")}`);
  };

  const definirHorario = (patch: Partial<HorarioSimples>) => {
    marcarAlterado();
    setHorarioReferencia((h) => ({ ...h, ...patch }));
  };

  /** Atalhos de escala: 6x1 folga no domingo e 5x2 folga sábado e domingo. */
  const aplicarEscala = (modo: "6x1" | "5x2") => {
    marcarAlterado();
    setFolgaVariavel(false);
    const folgar = modo === "6x1" ? [0] : [0, 6];
    setDias((prev) => prev.map((d) => (folgar.includes(d.dow)
      ? { ...d, trabalha: false, turno_id: null, entrada: null, saida: null, intervalo_minutos: null }
      : {
        ...d,
        trabalha: true,
        entrada: d.entrada ?? horario.entrada,
        saida: d.saida ?? horario.saida,
        intervalo_minutos: d.intervalo_minutos ?? horario.intervalo_minutos ?? 0,
      })));
  };

  /**
   * A cópia traz a semana inteira do colega: dias de folga e também os dias com
   * horário diferente, que continuam sendo horário do colaborador (sem turno).
   */
  const somenteDias = (lista: DiaConfig[]): DiaConfig[] =>
    normalizarDias(lista).map((d) => ({ ...d, turno_id: null }));

  const onCopiarConfig = (c: ConfigCopiada) => {
    marcarAlterado();
    setFolgaVariavel(c.folga_variavel);
    setDias(somenteDias(c.dias));
    if (c.horario?.entrada && c.horario?.saida) {
      // Evita que o efeito de sincronização devolva o horário antigo por cima.
      horarioAplicadoRef.current = vigente?.turno_padrao_id ?? "copiado";
      setHorarioReferencia({
        entrada: c.horario.entrada,
        saida: c.horario.saida,
        intervalo_minutos: c.horario.intervalo_minutos ?? 0,
      });
    }
    toast.success("Horário copiado do colega — revise e salve");
  };

  /** Atalho pelo nome do colega: copia o horário e os dias de folga dele. */
  const copiarSemanaDoColega = (m: ModeloHorarioColaborador) => {
    marcarAlterado();
    setFolgaVariavel(m.folga_variavel);
    setDias(somenteDias(m.dias));
    if (m.horario?.entrada && m.horario?.saida) {
      horarioAplicadoRef.current = vigente?.turno_padrao_id ?? "copiado";
      setHorarioReferencia({
        entrada: m.horario.entrada,
        saida: m.horario.saida,
        intervalo_minutos: m.horario.intervalo_minutos ?? 0,
      });
    }
    toast.success(`Horário de ${primeiroNome(m.colaborador_nome)} copiado — revise e salve`);
  };

  /**
   * Converte o horário PRINCIPAL em um horário da loja: reaproveita um turno com
   * o mesmo horário na unidade ou cria um. Só o horário principal passa por aqui
   * — horário de um dia específico fica no colaborador e não vira turno, senão a
   * tela de Turnos enche de variação de minutos de cada pessoa.
   */
  const resolverTurno = async (h: HorarioSimples): Promise<string> => {
    const unidade = unidadeId === "none" ? null : unidadeId;
    const decisao = resolverTurnoDoHorario(h, turnosResolvidos.map((t) => ({ ...t, ativo: true })), unidade);
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
      ciencia: intervaloAbaixoDoLegal(h)
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
    // Só o horário principal vira turno. O colaborador fica vinculado a um único
    // turno; os dias diferentes guardam o horário no próprio colaborador.
    const turnoPadraoId = await resolverTurno(horario);

    const diasResolvidos: DiaConfig[] = dias.map((d) => {
      if (!d.trabalha || !diaDivergeDoBase(d, horario)) {
        return { ...d, turno_id: null, entrada: null, saida: null, intervalo_minutos: null };
      }
      const h = horarioEfetivoDia(d, horario);
      return {
        ...d,
        turno_id: null,
        entrada: h.entrada,
        saida: h.saida,
        intervalo_minutos: h.intervalo_minutos ?? 0,
      };
    });

    await salvar.mutateAsync({
      unidade_id: unidadeId === "none" ? null : unidadeId,
      turno_padrao_id: turnoPadraoId,
      folga_variavel: folgaVariavel,
      folga_fixa_dow: folgaVariavel || folgas.length !== 1 ? null : folgas[0],
      observacoes: obs.trim() || null,
      vigencia_inicio: inicio,
      dias: diasResolvidos,
    });

    // A folga fixa fica em um único lugar: a semana desta tela alimenta também
    // o campo do cadastro, que é lido pela escala e pelo portal.
    if (colaborador?.id) {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        await supabase
          .from("dp_colaboradores")
          .update({ folga_fixa_semana: folgaVariavel || folgas.length !== 1 ? null : folgas[0] })
          .eq("id", colaborador.id);
      } catch { /* o horário já foi gravado; o campo espelho não deve travar */ }
    }
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
    const aguardando = cienciaPendenteRef.current;
    cienciaPendenteRef.current = null;
    try {
      await registrarCiencia(justificativa);
      await persistir();
      aguardando?.("salvo");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o horário");
      aguardando?.("erro");
    }
  };

  /** Fechar o diálogo sem confirmar cancela o salvamento em andamento. */
  const onFecharCiencia = (aberto: boolean) => {
    setCienciaOpen(aberto);
    if (aberto) return;
    const aguardando = cienciaPendenteRef.current;
    cienciaPendenteRef.current = null;
    aguardando?.("cancelado");
  };

  /**
   * Salvamento acionado pelo botão único do cadastro do colaborador.
   * Quando há alerta da CLT, aguarda a ciência do diálogo e só então devolve o
   * resultado — o cadastro conclui em um único clique.
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
      cienciaPendenteRef.current?.("cancelado");
      setCienciaOpen(true);
      return new Promise<SalvarJornadaResultado>((resolve) => {
        cienciaPendenteRef.current = resolve;
      });
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

  // ── Atalho para as Regras de Folgas ────────────────────────────────────
  // Sem alteração pendente vai direto; com alteração pergunta se salva antes.
  const navigate = useNavigate();
  const [irRegrasOpen, setIrRegrasOpen] = useState(false);
  const ROTA_REGRAS = "/dp/folgas?aba=regras";

  const abrirRegrasFolgas = () => {
    if (!colaborador?.id || !alterado) { navigate(ROTA_REGRAS); return; }
    setIrRegrasOpen(true);
  };

  const salvarEIrRegras = async () => {
    const r = await salvarExterno();
    if (r === "erro" || r === "cancelado") return;
    setIrRegrasOpen(false);
    navigate(ROTA_REGRAS);
  };




  return (
    <div ref={topoRef} className="space-y-5">

      {!colaborador?.id && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Defina o horário agora: ele será gravado automaticamente logo após o colaborador ser criado.
        </p>
      )}

      {/* Copiar de um colega: o botão do diálogo completo e os atalhos por nome
          ficam na mesma linha — são a mesma funcionalidade. */}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setCopiarOpen(true)}>
          <Users className="h-4 w-4" aria-hidden="true" />
          {tituloSistema("Copiar de Outro Colaborador")}
        </Button>
        {atalhosColegas.length > 0 && (
          <>
            <span className="text-xs text-muted-foreground">ou copie de:</span>
            {atalhosColegas.map((m) => (
              <Button
                key={m.colaborador_id}
                type="button" size="sm" variant="secondary"
                className="h-7 px-2 text-xs"
                title={`${m.colaborador_nome} · ${resumoSemanaPorFaixas(m.dias, m.horario ?? null, { folgaVariavel: m.folga_variavel })}`}
                onClick={() => copiarSemanaDoColega(m)}
              >
                {primeiroNome(m.colaborador_nome)}
              </Button>
            ))}
          </>
        )}
      </div>

      {policy.jornadaHint && (
        <p className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span><strong className="text-foreground">Contrato {policy.label}.</strong> {policy.jornadaHint}</span>
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Unidade</Label>
          <p className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
            {unidadeNome
              ? <>Horário na unidade <strong className="text-foreground">{unidadeNome}</strong></>
              : "Escolha a unidade na aba Dados para que o horário seja vinculado a ela."}
          </p>
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

      <section className="space-y-2">
        {origemSugestao === "cargo" && (
          <p className="flex items-center gap-2 rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
            <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
            Horário sugerido pelos colegas do mesmo cargo nesta unidade — pode ajustar.
          </p>
        )}
        {origemSugestao === "sem_compativel" && (
          <p className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-500">
            <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
            Nenhum horário compatível encontrado para este cargo nesta unidade — informe o horário
            ou copie o de um colega.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
            {tituloSistema("Horário de Trabalho por Dia")}
          </h3>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => aplicarEscala("6x1")}>
              6x1
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => aplicarEscala("5x2")}>
              5x2
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button" size="sm" variant="ghost"
                  className="h-8 gap-1 text-xs tabular-nums text-muted-foreground"
                  title="Ver como o total da semana foi calculado"
                >
                  {formatarHoras(carga)}/semana
                  <Info className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80">
                <p className="mb-2 text-xs font-medium">Como o total da semana é calculado</p>
                <ul className="space-y-1 text-[11px]">
                  {detalheCarga.map((d) => (
                    <li key={d.dow} className="flex items-baseline justify-between gap-2">
                      <span className="w-16 shrink-0 text-muted-foreground">{DOW_LABEL[d.dow]}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {d.trabalha && d.turno
                          ? `${formatarFaixaTurno(d.turno)} · ${d.turno.intervalo_minutos ?? 0} min${d.origem === "base" ? " · usa o horário base" : ""}`
                          : d.trabalha ? "Sem horário definido" : "Folga"}
                      </span>
                      <span className="shrink-0 tabular-nums">{formatarHoras(d.minutos / 60)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex items-baseline justify-between border-t pt-2 text-xs font-medium">
                  <span>Total</span>
                  <span className="tabular-nums">{formatarHoras(carga)}</span>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>



        <p className="rounded-md border bg-muted/30 p-2 text-[11px] text-muted-foreground">
          Pode ter horário diferente em cada dia da semana. O horário que mais se repete é o turno do
          colaborador na loja; os dias diferentes ficam salvos aqui, sem criar turno novo na tela de
          Turnos.
        </p>

        <ul className="divide-y rounded-lg border">
          {dias.map((dia) => {
            const h = horarioEfetivoDia(dia, horario);
            const diferente = diaDivergeDoBase(dia, horario);
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
                      {diferente && (
                        <Badge
                          variant="outline"
                          className="text-[10px]"
                          title="Horário só deste dia — não cria turno na loja"
                        >
                          Horário deste dia
                        </Badge>
                      )}
                      <RepetirHorarioPopover
                        dow={dia.dow}
                        onRepetir={(destinos) => repetirHorario(dia.dow, destinos)}
                      />
                    </div>
                  ) : (
                    <Badge variant="secondary" className="ml-auto">Folga</Badge>
                  )}
                </div>

                {dia.trabalha && (
                  <div className="grid gap-2 pl-[3.25rem] sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label className="text-[11px]" htmlFor={`h-ent-${dia.dow}`}>Entrada</Label>
                      <Input
                        id={`h-ent-${dia.dow}`} type="time" className="h-9" value={h.entrada}
                        onChange={(e) => definirHorarioDia(dia.dow, { entrada: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]" htmlFor={`h-sai-${dia.dow}`}>Saída</Label>
                      <Input
                        id={`h-sai-${dia.dow}`} type="time" className="h-9" value={h.saida}
                        onChange={(e) => definirHorarioDia(dia.dow, { saida: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]" htmlFor={`h-int-${dia.dow}`}>Intervalo (min)</Label>
                      <Input
                        id={`h-int-${dia.dow}`} type="number" min={0} inputMode="numeric" className="h-9"
                        value={h.intervalo_minutos ?? 0}
                        onChange={(e) => definirHorarioDia(dia.dow, { intervalo_minutos: Number(e.target.value || 0) })}
                      />
                    </div>
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

        {/* Folga dominical: a regra é da tela Folgas (e pode ser alterada pelo
            sindicato). Aqui só mostramos o resultado para este colaborador. */}
        {policy.folgaSemanal !== "nao_se_aplica" && (
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 space-y-1 text-xs">
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <CalendarOff className="h-4 w-4" aria-hidden="true" />
                  {tituloSistema("Folga Dominical Do Colaborador")}
                </p>
                <p className="text-muted-foreground">{regraDominical.baseTexto}</p>
                <p className="text-muted-foreground">
                  Domingos de folga por mês para este colaborador:{" "}
                  <strong className="text-foreground">{regraDominical.domingosMes}</strong>
                  {regraDominical.origem}
                </p>
                <p className="text-muted-foreground">
                  A folga dominical é definida na tela Folgas; o sindicato pode alterar essa
                  frequência.
                </p>
              </div>
              <Button
                type="button" variant="outline" size="sm" className="gap-2"
                onClick={abrirRegrasFolgas}
              >

                <CalendarOff className="h-4 w-4" aria-hidden="true" /> Ver Regras De Folgas
              </Button>
            </div>
            {regraDominical.alerta && (
              <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {regraDominical.alerta}
              </p>
            )}
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
        onCancel={() => onFecharCiencia(false)}
        onConfirm={(j) => void onConfirmarCiencia(j)}
      />

      <AlertDialog open={irRegrasOpen} onOpenChange={setIrRegrasOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Salvar o horário antes de ir?</AlertDialogTitle>
            <AlertDialogDescription>
              Você tem alterações não salvas no horário de trabalho. Deseja salvar antes de abrir
              as Regras de Folgas?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button
              type="button" variant="outline"
              onClick={() => { setIrRegrasOpen(false); navigate(ROTA_REGRAS); }}
            >
              Ir sem salvar
            </Button>
            <AlertDialogAction
              disabled={saving}
              onClick={(e) => { e.preventDefault(); void salvarEIrRegras(); }}
            >
              {saving ? "Salvando..." : "Salvar e ir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      <CopiarConfigColaboradorDialog
        open={copiarOpen}
        onOpenChange={setCopiarOpen}
        colaboradorId={colaborador?.id ?? undefined}
        unidadeId={unidadeId === "none" ? null : unidadeId}
        cargoId={colaborador?.cargo_id ?? null}
        turnos={turnosResolvidos}
        onCopiar={onCopiarConfig}
      />
    </div>
  );
}

/** Repete o horário de um dia nos demais dias escolhidos pelo usuário. */
function RepetirHorarioPopover({ dow, onRepetir }: { dow: number; onRepetir: (destinos: number[]) => void }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<number[]>([]);
  const outros = Object.keys(DOW_LABEL).map(Number).filter((d) => d !== dow);

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSel([]); }}>
      <PopoverTrigger asChild>
        <Button
          type="button" size="sm" variant="ghost" className="h-7 gap-1.5 text-[11px]"
          aria-label={`Repetir o horário de ${DOW_LABEL[dow]} em outros dias`}
        >
          <CopyPlus className="h-3.5 w-3.5" aria-hidden="true" />
          Repetir
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 space-y-2">
        <p className="text-xs font-medium">Repetir {DOW_LABEL[dow]} em:</p>
        <ul className="space-y-1.5">
          {outros.map((d) => (
            <li key={d}>
              <label className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={sel.includes(d)}
                  onCheckedChange={(v) => setSel((prev) => (v ? [...prev, d] : prev.filter((x) => x !== d)))}
                />
                {DOW_LABEL[d]}
              </label>
            </li>
          ))}
        </ul>
        <Button
          type="button" size="sm" className="w-full" disabled={sel.length === 0}
          onClick={() => { onRepetir(sel); setOpen(false); setSel([]); }}
        >
          Aplicar
        </Button>
      </PopoverContent>
    </Popover>
  );
}
