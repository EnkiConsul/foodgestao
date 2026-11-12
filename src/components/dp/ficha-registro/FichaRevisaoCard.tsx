import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { garantirColaboradorNovo } from "@/lib/billing/excedente-colaboradores";
import { FranquiaColaboradoresAviso, useEstadoFranquia } from "@/components/billing/FranquiaColaboradoresAviso";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUpsertDpCargo, useUpsertDpCargoSalario } from "@/hooks/useDpCadastros";
import { useSindicatoDoCargo } from "@/hooks/useSindicatoDoCargo";
import { registrarCienciaRegra, salvarDependente } from "@/lib/dp/regras-oficial";
import { cienciaDivergenciaValida, divergenciasComFicha, resumoDivergencias } from "@/lib/dp/ficha-registro/divergencia";
import { DivergenciaFichaAlerta } from "./DivergenciaFichaAlerta";
import { useDpPontoConformidade } from "@/hooks/useDpPontoConformidade";
import { AVISO_ART74, justificativaValida } from "@/lib/dp/ponto-conformidade";
import {
  dependentesDaFicha, inferirFormaPagamento, inferirRegime, LIMITE_PONTO_OBRIGATORIO, parentescoDependente, salarioDaFicha,
} from "@/lib/dp/ficha-registro/inferencia";
import { Link } from "react-router-dom";
import {
  AlertTriangle, Check, ChevronDown, ChevronUp, FileText, KeyRound, Loader2, Plus, Save, UserCheck, UserCog, X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { matchCargo } from "@/lib/dp/ficha-registro/cargo-match";
import { matchTurno, type TurnoCadastrado } from "@/lib/dp/ficha-registro/turno-match";
import {
  dispensaPontoExigeMotivo, JUSTIFICATIVA_PONTO_MIN, semDadosAcesso, turnoPadraoDoLote, type AjusteFichaLote,
} from "@/lib/dp/ficha-registro/organizacao-lote";
import { MOTIVOS_DISPENSA_PONTO } from "@/components/dp/ficha-registro/lote/EscolhasLoteCampos";
import { formatCnpj, matchUnidade } from "@/lib/dp/ficha-registro/unidade-match";
import { CONFIANCA_LABEL, nivelDoCampo, trechoDoTexto, type NivelConfianca } from "@/lib/dp/ficha-registro/confianca";
import { montarPayloadFicha } from "@/lib/dp/ficha-registro/payload";
import { camposFaltando, resumoFaltando } from "@/lib/dp/cadastro-completude";
import { useDpSalarioCargoResolver } from "@/hooks/useDpSalarioCargoResolver";
import { CargoFormDialog } from "@/components/dp/cargos/CargoFormDialog";
import { CargoBuscaSelect } from "./CargoBuscaSelect";
import { ConfirmarIgnorarFichaDialog } from "./ConfirmarIgnorarFichaDialog";
import { UnidadeFormDialog } from "@/components/dp/UnidadeFormDialog";
import { SetorFormDialog } from "@/components/dp/setores/SetorFormDialog";
import { TurnoForm } from "@/components/dp/TurnoForm";
import { TURNO_FORM_DEFAULT, useDpTurnos } from "@/hooks/useDpTurnos";
import { FichaComparacaoDialog } from "./FichaComparacaoDialog";
import { FichaHistoricoLido } from "./FichaHistoricoLido";
import {
  jornadaDaFicha, useAplicarFicha, useIgnorarFicha, useReativarFicha, type FichaItem,
} from "@/hooks/useDpFichaImportacao";
import {
  alertaCargaSemanal, aplicarIntervaloMinimo, formatarHoras, inconformidadesJornada, minutosEntre, normalizeHora,
  problemasJornada, resumoInconformidades, resumoSemanal, rotuloFolgaSemanal,
  type JornadaDia, type JornadaSugerida,
} from "@/lib/dp/ficha-registro/jornada-parse";
import { PENDENCIA_POR_INCONFORMIDADE } from "@/lib/dp/ficha-registro/organizacao-lote";
import { JornadaConformidadeAlerta } from "./JornadaConformidadeAlerta";
import { notifyError } from "@/lib/notifyError";
import { mensagemOrigemApoio, vincularOrigemApoio } from "@/lib/dp/apoio-origem";
import { EnderecoFields } from "@/components/shared/EnderecoFields";
import { anexarSomenteFicha, useDpPreadmissao } from "@/hooks/dp/useDpPreadmissoes";
import {
  dadosParaCadastro, divergenciasAdmin, divergenciasAdminSemEscolha, divergenciasFicha,
  divergenciasSemEscolha, resolverPorNome, type EscolhaDivergencia,
} from "@/lib/dp/preadmissao/comparacaoFicha";
import {
  escolhasObrigatoriasFaltando,
  mensagemEscolhasObrigatorias,
} from "@/lib/dp/ficha-registro/validacao";



const DOW_LABEL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const NIVEL_CLASS: Record<NivelConfianca, string> = {
  alta: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  media: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  baixa: "border-destructive/40 text-destructive",
  ausente: "border-muted text-muted-foreground",
};

/** Vínculos disponíveis no cadastro (enum dp_regime_trabalho). */
const REGIMES: Array<{ value: string; label: string }> = [
  { value: "clt", label: "CLT efetivo" },
  { value: "intermitente", label: "CLT intermitente" },
  { value: "estagio", label: "Estagiário" },
  { value: "temporario", label: "Temporário" },
  { value: "pj", label: "PJ / Sócio" },
  { value: "mei", label: "MEI" },
  { value: "freelancer", label: "Freelancer (sem registro)" },
];

const ESTADOS_CIVIS: Array<{ value: string; label: string }> = [
  { value: "solteiro", label: "Solteiro(a)" },
  { value: "casado", label: "Casado(a)" },
  { value: "uniao_estavel", label: "União estável" },
  { value: "divorciado", label: "Divorciado(a)" },
  { value: "viuvo", label: "Viúvo(a)" },
];

/** Formas de pagamento do cadastro (enum dp_forma_pagamento). */
const FORMAS_PAGAMENTO: Array<{ value: string; label: string }> = [
  { value: "mensalista", label: "Mensalista" },
  { value: "horista", label: "Horista" },
  { value: "diarista", label: "Diarista" },
  { value: "semanal", label: "Semanal" },
  { value: "por_turno", label: "Por turno" },
  { value: "servico_acordo", label: "Serviço acordado" },
];

interface Props {
  item: FichaItem;
  cargos: Array<{ id: string; nome: string; cbo?: string | null }>;
  unidades: Array<{ id: string; nome: string; cnpj?: string | null; possui_relogio_ponto?: boolean | null }>;
  setores?: Array<{ id: string; nome: string; unidade_id: string | null }>;
  turnos?: TurnoCadastrado[];
  unidadePadraoId: string | null;
  empresaCnpj?: string | null;
  /** Setor e vínculo definidos na barra "aplicar a todas as fichas". */
  setorPadraoId?: string | null;
  regimePadrao?: string | null;
  /** Adiantamento da maioria do lote (a escolha na ficha prevalece). */
  adiantamentoPadrao?: boolean | null;
  /** Abre o cadastro completo do colaborador criado por esta ficha. */
  onAbrirCadastro?: (colaboradorId: string) => void;
  /**
   * Conferência da ficha oficial de uma Pré-Admissão: cadastro e conclusão da
   * pré-admissão acontecem na mesma operação.
   */
  preadmissaoId?: string | null;
  /** Promoção de folguista: pessoa que passa a constar como já promovida. */
  pessoaApoioId?: string | null;
  /** Posição da ficha no lote (1-based) e total, para orientar quem cadastra. */
  posicao?: number;
  total?: number;
  /** Primeira ficha pendente: recebe destaque visual. */
  emFoco?: boolean;
  /** Chamado após cadastrar/atualizar com sucesso. */
  onConcluido?: (itemId: string, nome: string) => void;
  /** Chamado depois de ignorar a ficha (a tela avança e oferece "Desfazer"). */
  onIgnorado?: (itemId: string, nome: string) => void;
  /** Mostra o aviso de franquia no cartão (a tela de lote mostra um único aviso no topo). */
  avisoFranquia?: boolean;
  /** Cargo e setor decididos na organização do lote (o gestor ainda pode trocar). */
  vinculoLote?: { cargoId: string | null; setorId: string | null } | null;
  /** Turno da maioria do lote: vale só para fichas sem horário reconhecido. */
  turnoPadraoId?: string | null;
  /** Mostra no topo o que ainda falta a pessoa definir (conferência do lote). */
  destacarPendencias?: boolean;
  /** Botões fixos no rodapé da janela, acima da área segura do celular. */
  rodapeFixo?: boolean;
  /**
   * Base fixa da gaveta de conferência: quando informada, as ações (Ignorar,
   * Salvar e próxima, Criar cadastro) são desenhadas nela, fora da rolagem.
   */
  rodapeContainer?: HTMLElement | null;
  /** Rascunho salvo no lote para esta ficha (dados completados e escolhas). */
  rascunho?: AjusteFichaLote | null;
  /** Forma de pagamento escolhida para o lote/grupo (a escolha na ficha prevalece). */
  formaPagamentoPadrao?: string | null;
  /** Lote: salva o que foi preenchido sem criar o cadastro e segue para a próxima ficha. */
  onSalvarRascunho?: (ajuste: AjusteFichaLote) => Promise<void>;
  /** Lote: ponto decidido na ação em grupo (null = segue a unidade). */
  folhaPontoPadrao?: boolean | null;
  /** Lote: motivo da dispensa de ponto informado na ação em grupo. */
  justificativaPontoPadrao?: string | null;
  /** Lote: ciência única do intervalo de 30 a 59 min (justificativa registrada no lote). */
  cienciaIntervaloLote?: string | null;
}

export function FichaRevisaoCard({
  item, cargos, unidades, setores = [], turnos = [], unidadePadraoId, empresaCnpj,
  setorPadraoId = null, regimePadrao = null, adiantamentoPadrao = null, onAbrirCadastro, preadmissaoId = null,
  pessoaApoioId = null, posicao, total, emFoco = false, onConcluido, onIgnorado, avisoFranquia = true, vinculoLote = null,
  turnoPadraoId = null, destacarPendencias = false, rodapeFixo = false, rodapeContainer = null,
  rascunho = null, formaPagamentoPadrao = null, onSalvarRascunho,
  folhaPontoPadrao = null, justificativaPontoPadrao = null, cienciaIntervaloLote = null,
}: Props) {
  const comRodape = (node: ReactNode) => (rodapeContainer ? createPortal(node, rodapeContainer) : node);
  const extraidos = (item.dados_extraidos ?? {}) as Record<string, unknown>;
  const confianca = (item.confianca_campos ?? {}) as Record<string, string>;

  const [dados, setDados] = useState<Record<string, unknown>>(() => ({ ...extraidos, ...(rascunho?.dados ?? {}) }));
  const cargoSugerido = useMemo(
    () => matchCargo({ cargo_nome: (dados.cargo_nome as string) ?? null, cbo: (dados.cbo as string) ?? null }, cargos),
    [dados.cargo_nome, dados.cbo, cargos],
  );
  const unidadeSugerida = useMemo(() => matchUnidade(dados, unidades, empresaCnpj), [dados, unidades, empresaCnpj]);
  /**
   * Só o nome parecido preenche sozinho. CBO igual com nome diferente (ex.:
   * CUMIM × GARÇONETE) fica como sugestão: o gestor confirma ou cria o cargo.
   */
  const cargoDoLote =
    vinculoLote?.cargoId && cargos.some((c) => c.id === vinculoLote.cargoId) ? vinculoLote.cargoId : null;
  const cargoAutomatico =
    cargoDoLote ??
    (cargoSugerido.motivo === "cbo_e_nome" || cargoSugerido.motivo === "nome" ? cargoSugerido.cargo_id : null);
  const [cargoId, setCargoIdState] = useState<string | null>(cargoAutomatico);
  const [cargoTocado, setCargoTocado] = useState(false);
  const setCargoId = (id: string | null) => {
    setCargoTocado(true);
    setCargoIdState(id);
  };
  // A lista de cargos chega depois do primeiro desenho: preenche quando chegar.
  useEffect(() => {
    if (!cargoTocado && cargoAutomatico) setCargoIdState(cargoAutomatico);
  }, [cargoAutomatico, cargoTocado]);
  const cargoPorCbo =
    cargoSugerido.motivo === "cbo" ? cargos.find((c) => c.id === cargoSugerido.cargo_id) ?? null : null;
  const [unidadeId, setUnidadeId] = useState<string | null>(
    unidadeSugerida.unidade_id ?? unidadePadraoId ?? unidades[0]?.id ?? null,
  );
  const [setorEscolhido, setSetorEscolhido] = useState<string | null>(vinculoLote?.setorId ?? null);
  const [regimeEscolhido, setRegimeEscolhido] = useState<string | null>(rascunho?.regime ?? null);
  const [regimeEscolhidoManual, setRegimeEscolhidoManual] = useState(!!rascunho?.regime);
  const setorId = setorEscolhido ?? setorPadraoId ?? null;
  const regime = regimeEscolhido ?? regimePadrao ?? null;
  // Na conferência do lote nada fica escondido: o bloco já nasce aberto.
  const [completarAberto, setCompletarAberto] = useState(destacarPendencias);
  const [usarJornada, setUsarJornada] = useState(true);
  const [atualizar, setAtualizar] = useState(!!item.colaborador_existente_id);
  const [anexarFicha, setAnexarFicha] = useState(true);
  const [formaPagamento, setFormaPagamento] = useState<string | null>(
    rascunho?.forma_pagamento ?? formaPagamentoPadrao ?? null,
  );
  // Escolha salva na ficha (rascunho) > ação em grupo do lote > unidade (efeito abaixo).
  const [possuiFolhaPonto, setPossuiFolhaPontoState] = useState<boolean | null>(
    typeof rascunho?.folha_ponto === "boolean" ? rascunho.folha_ponto : folhaPontoPadrao,
  );
  const [pontoTocado, setPontoTocado] = useState(false);
  const setPossuiFolhaPonto = (v: boolean | null) => {
    setPontoTocado(true);
    setPossuiFolhaPontoState(v);
  };
  const [optanteEscolhido, setOptanteAdiantamento] = useState<boolean | null>(
    typeof rascunho?.adiantamento === "boolean" ? rascunho.adiantamento : null,
  );
  const optanteAdiantamento = optanteEscolhido ?? adiantamentoPadrao ?? null;
  // Assinatura dos documentos: celular (padrão) ou papel, escolhida na ficha ou em grupo no lote.
  const [assinaturaPapel, setAssinaturaPapel] = useState<boolean>(rascunho?.assinatura_papel === true);
  const escolhasPendentes = escolhasObrigatoriasFaltando({
    regime,
    formaPagamento,
    possuiFolhaPonto,
    optanteAdiantamento,
  });
  /** Só destacamos campos em vermelho depois de uma tentativa de criar. */
  const [tentouCriar, setTentouCriar] = useState(false);
  const realce = (pendente: boolean) =>
    tentouCriar && pendente ? "border-destructive ring-1 ring-destructive/40" : "";
  const [trechos, setTrechos] = useState<Record<string, boolean>>({});

  const [verTexto, setVerTexto] = useState(false);
  const [cargoDialog, setCargoDialog] = useState(false);
  const [cargoNovoNome, setCargoNovoNome] = useState("");
  const [cargoCriado, setCargoCriado] = useState<{ id: string; nome: string } | null>(null);
  const abrirCadastroCargo = (nome: string) => {
    setCargoNovoNome(nome.trim().toUpperCase());
    setCargoDialog(true);
  };
  const [unidadeDialog, setUnidadeDialog] = useState(false);
  const [setorDialog, setSetorDialog] = useState(false);
  const [comparacao, setComparacao] = useState(false);
  const [confirmouEmpresa, setConfirmouEmpresa] = useState(false);
  const [whatsappEditado, setWhatsappEditado] = useState(
    !!rascunho?.dados && "whatsapp" in rascunho.dados && rascunho.dados.whatsapp !== rascunho.dados.telefone,
  );
  const [salvandoRascunho, setSalvandoRascunho] = useState(false);
  const empresaDivergente = unidadeSugerida.empresaConfere === "nao";
  const bloqueadoPorEmpresa = empresaDivergente && !confirmouEmpresa;
  // Franquia: avisa antes de preencher; quem não pode autorizar o excedente não conclui.
  const criaColaboradorNovo = !(atualizar && !!item.colaborador_existente_id)
    && !["criado", "atualizado", "ignorado"].includes(item.status);
  const estadoFranquia = useEstadoFranquia(criaColaboradorNovo ? item.company_id : null);
  const bloqueadoPorFranquia = estadoFranquia?.tipo === "bloqueado";

  const setoresDaUnidade = useMemo(
    () => (unidadeId ? setores.filter((s) => !s.unidade_id || s.unidade_id === unidadeId) : setores),
    [setores, unidadeId],
  );

  /**
   * Horário da admissão: o que o gestor definiu na ficha em admissão tem
   * prioridade sobre o horário lido do PDF, e é ele que vai para o cadastro na
   * efetivação (a mesma consulta usada abaixo; o cache evita ida extra).
   */
  const preadmissaoJornada = useDpPreadmissao(preadmissaoId ?? null);
  const jornadaDaAdmissao = useMemo(
    () => rascunhoParaJornada(
      (preadmissaoJornada.data?.preadmissao.admin_dados as Record<string, unknown> | null)?.jornada,
    ),
    [preadmissaoJornada.data],
  );
  const jornadaLida = useMemo(
    () => jornadaDaAdmissao ?? jornadaDaFicha(dados),
    [jornadaDaAdmissao, dados],
  );
  /** Horário corrigido à mão nesta revisão: manda em tudo o que for gravado. */
  const [jornadaEditada, setJornadaEditada] = useState<JornadaSugerida | null>(null);
  const [editandoJornada, setEditandoJornada] = useState(false);
  const jornada = jornadaEditada ?? jornadaLida;
  const turnoSugerido = useMemo(() => matchTurno(jornada, turnos, unidadeId), [jornada, turnos, unidadeId]);
  const [turnoId, setTurnoId] = useState<string | null>(rascunho?.turno_id ?? null);
  const turnoDoLote = turnoPadraoDoLote(jornada.vazia, turnoPadraoId, turnos);
  const turnoEscolhido = turnoId ?? turnoSugerido.turno_id ?? turnoDoLote;
  const [turnoDialog, setTurnoDialog] = useState(false);
  const { criar: criarTurno } = useDpTurnos();

  /** Sugestões lidas da ficha: o gestor só confere. Escolha manual prevalece. */
  const regimeInferido = useMemo(() => inferirRegime(dados), [dados]);
  const formaInferida = useMemo(() => inferirFormaPagamento(dados, jornada), [dados, jornada]);
  useEffect(() => {
    if (!regimeEscolhido && !regimePadrao && regimeInferido) setRegimeEscolhido(regimeInferido);
  }, [regimeInferido, regimeEscolhido, regimePadrao]);
  useEffect(() => {
    if (!formaPagamento && formaInferida) setFormaPagamento(formaInferida);
  }, [formaInferida, formaPagamento]);

  /**
   * Divergência com a ficha de registro (registro contábil). Só na importação de
   * ficha — na pré-admissão os dados vêm do candidato, não de registro oficial.
   */
  const [justDivergencia, setJustDivergencia] = useState("");
  const [cienteDivergencia, setCienteDivergencia] = useState(false);
  const divergenciasRegistro = useMemo(() => {
    if (preadmissaoId) return [];
    const cargoSel = cargos.find((c) => c.id === cargoId)?.nome ?? null;
    return divergenciasComFicha(
      {
        cargoNome: (extraidos.cargo_nome as string) ?? null,
        salario: extraidos.salario as string | number | null,
        regime: regimeInferido ?? null,
        formaPagamento: formaInferida ?? null,
      },
      {
        cargoNome: cargoSel,
        salario: dados.salario as string | number | null,
        regime: regimeEscolhidoManual ? regime : null,
        formaPagamento,
        horarioAlterado:
          usarJornada && jornadaEditada && !jornadaLida.vazia
            ? { ficha: "Conforme a ficha", sistema: "Ajustado nesta conferência" }
            : null,
      },
      {
        regime: (v) => REGIMES.find((r) => r.value === v)?.label ?? v,
        forma: (v) => FORMAS_PAGAMENTO.find((f) => f.value === v)?.label ?? v,
      },
    );
  }, [preadmissaoId, cargos, cargoId, extraidos, regimeInferido, formaInferida, dados.salario,
    regimeEscolhidoManual, regime, formaPagamento, usarJornada, jornadaEditada, jornadaLida]);


  /** Art. 74, § 2º da CLT: unidade com mais de 20 pessoas exige controle de jornada. */
  const lotacao = useQuery({
    queryKey: ["dp_unidade_lotacao", unidadeId],
    enabled: !!unidadeId,
    staleTime: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("dp_colaboradores")
        .select("id", { count: "exact", head: true })
        .eq("unidade_id", unidadeId!)
        .eq("ativo", true)
        .is("deleted_at", null);
      if (error) throw error;
      return count ?? 0;
    },
  });
  // O ponto é decisão da unidade: sem relógio, a ficha herda "não utiliza" sem justificativa individual.
  const unidadeTemPonto = !!unidades.find((u) => u.id === unidadeId)?.possui_relogio_ponto;
  const pontoObrigatorio =
    unidadeTemPonto && (lotacao.data ?? 0) + (item.colaborador_existente_id ? 0 : 1) > LIMITE_PONTO_OBRIGATORIO;
  // Unidade sem ponto e sem justificativa que passa de 20 ativos com esta admissão.
  const pontoConformidade = useDpPontoConformidade();
  const lotacaoComEste = (lotacao.data ?? 0) + (item.colaborador_existente_id ? 0 : 1);
  const justificativaUnidade = pontoConformidade.data?.find((u) => u.id === unidadeId)?.justificativa ?? null;
  const unidadeIrregularPonto =
    !!unidadeId && !unidadeTemPonto && lotacaoComEste > LIMITE_PONTO_OBRIGATORIO && !justificativaValida(justificativaUnidade);
  const [justificativaPonto, setJustificativaPontoState] = useState(
    rascunho?.folha_ponto_justificativa ?? justificativaPontoPadrao ?? "",
  );
  const setJustificativaPonto = (v: string) => {
    setPontoTocado(true);
    setJustificativaPontoState(v);
  };
  // No lote, quem não foi marcado registra ponto quando a unidade tem relógio.
  const pontoPadraoUnidade = pontoObrigatorio || !!onSalvarRascunho;
  useEffect(() => {
    if (!unidadeId) return;
    if (!unidadeTemPonto) setPossuiFolhaPontoState(false);
    else if (possuiFolhaPonto === null && pontoPadraoUnidade) setPossuiFolhaPontoState(true);
  }, [unidadeId, unidadeTemPonto, pontoPadraoUnidade, possuiFolhaPonto]);
  /**
   * Dispensa de ponto em unidade com relógio precisa de motivo quando a lei obriga
   * (mais de 20 pessoas) ou quando o banco religaria o ponto do vínculo de emprego.
   */
  const exigeMotivoPonto =
    unidadeTemPonto && possuiFolhaPonto === false && (pontoObrigatorio || (!preadmissaoId && dispensaPontoExigeMotivo(regime)));
  /** Horário com intervalo ilegível/impossível: sinalizado para corrigir, nunca enviado às cegas. */
  const problemasHorario = usarJornada ? problemasJornada(jornada) : [];
  /** Carga semanal e descanso: recalculados a cada ajuste do horário. */
  const semana = useMemo(() => resumoSemanal(jornada), [jornada]);
  const alertaCarga = usarJornada ? alertaCargaSemanal(jornada) : null;
  /**
   * Jornada fora da CLT (carga, intervalo, descanso): corrigir ou registrar a
   * ciência com justificativa. Horário ilegível vem antes (problemasHorario).
   */
  const [folgaNaEscala, setFolgaNaEscala] = useState(false);
  const [justJornada, setJustJornada] = useState("");
  const [cienteJornada, setCienteJornada] = useState(false);
  const [tentouJornada, setTentouJornada] = useState(false);
  const inconformidades = usarJornada && problemasHorario.length === 0
    ? inconformidadesJornada(jornada, { intervaloReduzidoAceito: !!cienciaIntervaloLote })
      .filter((i) => !(folgaNaEscala && i.codigo === "descanso_semanal"))
    : [];
  /** Intervalo de 30–59 min coberto pela ciência do lote: registrado também nesta pessoa. */
  const intervaloReduzidoPeloLote = usarJornada && !!cienciaIntervaloLote
    && inconformidadesJornada(jornada).some((i) => i.codigo === "intervalo_reduzido");
  const cienciaJornadaOk = inconformidades.length === 0 || cienciaDivergenciaValida(justJornada, cienteJornada);
  const plantaoLongo = usarJornada && jornada.dias.some((d) => d.trabalha && d.entrada && d.saida && minutosEntre(d.entrada, d.saida) >= 11 * 60);
  const podeCompletarIntervalo = (() => {
    if (!usarJornada || !inconformidades.some((i) => i.codigo === "intervalo" || i.codigo === "intervalo_reduzido")) return false;
    const base = jornadaEditada ?? jornadaEditavel(jornadaLida);
    return JSON.stringify(aplicarIntervaloMinimo(base).dias) !== JSON.stringify(base.dias);
  })();
  const faltaMotivoPonto = exigeMotivoPonto && justificativaPonto.trim().length < JUSTIFICATIVA_PONTO_MIN;

  const salarioFicha = useMemo(() => salarioDaFicha(dados), [dados]);
  // Na pré-admissão valem os familiares que o próprio candidato informou.
  const pessoasCandidato = preadmissaoJornada.data?.pessoas;
  const dependentesLidos = useMemo(() => {
    if (preadmissaoId) {
      return (pessoasCandidato ?? [])
        .map((p) => ({
          nome: String(p.nome ?? "").trim().toUpperCase(),
          parentesco: parentescoDependente(p.parentesco),
          data_nascimento: p.data_nascimento && /^\d{4}-\d{2}-\d{2}$/.test(p.data_nascimento) ? p.data_nascimento : null,
          cpf: String(p.cpf ?? "").replace(/\D/g, "") || null,
          irrf: !!p.finalidade_dependente,
        }))
        .filter((d): d is { nome: string; parentesco: NonNullable<ReturnType<typeof parentescoDependente>>; data_nascimento: string | null; cpf: string | null; irrf: boolean } =>
          d.nome.length >= 3 && !!d.parentesco);
    }
    return dependentesDaFicha(dados).map((d) => ({ ...d, irrf: true }));
  }, [preadmissaoId, pessoasCandidato, dados]);
  const [importarDependentes, setImportarDependentes] = useState(true);
  const [automatizarCargo, setAutomatizarCargo] = useState(true);
  const upsertCargo = useUpsertDpCargo();
  const upsertPiso = useUpsertDpCargoSalario();
  const sindicatoUnidade = useSindicatoDoCargo(null, unidadeId);
  const patronalUnidade = sindicatoUnidade.data?.patronal ?? null;
  const [preparando, setPreparando] = useState(false);

  /** Corrige um dia do horário desta ficha, mantendo o resumo coerente. */
  const alterarDiaJornada = (dow: number, patch: Partial<JornadaDia>) =>
    setJornadaEditada((atual) => {
      const base = atual ?? jornadaEditavel(jornadaLida);
      const dias = base.dias.map((d) => (d.dow === dow ? { ...d, ...patch } : d));
      const primeiro = dias.find((d) => d.trabalha && d.entrada && d.saida) ?? null;
      return {
        ...base,
        // Quem digitou o intervalo conferiu: a dúvida da leitura do PDF deixa de valer.
        intervalo_incerto: "intervalo_minutos" in patch ? false : base.intervalo_incerto,
        dias,
        entrada: primeiro?.entrada ?? null,
        saida: primeiro?.saida ?? null,
        intervalo_minutos: primeiro?.intervalo_minutos ?? base.intervalo_minutos,
        vira_meia_noite: !!primeiro?.entrada && !!primeiro?.saida && primeiro.saida <= primeiro.entrada,
        vazia: !primeiro,
      };
    });



  const aplicar = useAplicarFicha();
  const ignorar = useIgnorarFicha();
  const reativar = useReativarFicha();

  const aplicado = item.status === "criado" || item.status === "atualizado";
  const ignorado = item.status === "ignorado";

  /** Salário do cargo escolhido cobre a exigência de salário (intermitente/horista). */
  const salarioCargoDe = useDpSalarioCargoResolver();
  const salarioCargo = salarioCargoDe(cargoId, unidadeId);

  /** O que continuará em branco no cadastro depois de aplicar esta ficha. */
  const faltando = useMemo(() => {
    const base = montarPayloadFicha(dados);
    return camposFaltando(
      { ...base, setor_id: setorId, regime },
      { exigirSetor: setores.length > 0, salarioCargo },
    ).filter((campo) => campo.chave !== "dados_pagamento");
  }, [dados, setorId, regime, setores.length, salarioCargo]);

  /**
   * Conferência da ficha oficial contra o STAGING já revisado da pré-admissão.
   * O que o gestor conferiu é a referência: a ficha só substitui um campo por
   * escolha explícita, tanto nos dados pessoais quanto nas informações
   * administrativas (cargo, unidade, setor, salário, vínculo e jornada).
   */
  const preadmissao = useDpPreadmissao(preadmissaoId ?? null);
  const stagingDados = (preadmissao.data?.preadmissao.dados ?? null) as Record<string, unknown> | null;
  const adminDados = (preadmissao.data?.preadmissao.admin_dados ?? null) as Record<string, unknown> | null;
  const divergencias = useMemo(
    () => (preadmissaoId ? divergenciasFicha(stagingDados, dados) : []),
    [preadmissaoId, stagingDados, dados],
  );
  const [escolhas, setEscolhas] = useState<Record<string, EscolhaDivergencia>>({});
  const semEscolha = useMemo(() => divergenciasSemEscolha(divergencias, escolhas), [divergencias, escolhas]);

  /** Nomes canônicos do que foi conferido — nunca mostramos códigos internos. */
  const cargoConferidoId = (adminDados?.cargo_id as string) ?? preadmissao.data?.preadmissao.cargo_previsto_id ?? null;
  const unidadeConferidaId = (adminDados?.unidade_id as string) ?? preadmissao.data?.preadmissao.unidade_prevista_id ?? null;
  const setorConferidoId = (adminDados?.setor_id as string) ?? null;
  const nomesConferidos = useMemo(
    () => ({
      cargo: cargos.find((c) => c.id === cargoConferidoId)?.nome ?? null,
      unidade: unidades.find((u) => u.id === unidadeConferidaId)?.nome ?? null,
      setor: setores.find((s) => s.id === setorConferidoId)?.nome ?? null,
      regime: REGIMES.find((r) => r.value === adminDados?.regime_trabalho)?.label ?? null,
      forma_pagamento: FORMAS_PAGAMENTO.find((f) => f.value === adminDados?.forma_pagamento)?.label ?? null,
    }),
    [cargos, unidades, setores, cargoConferidoId, unidadeConferidaId, setorConferidoId, adminDados],
  );
  const divergenciasDoAdmin = useMemo(
    () => (preadmissaoId ? divergenciasAdmin(adminDados, dados, nomesConferidos) : []),
    [preadmissaoId, adminDados, dados, nomesConferidos],
  );
  const semEscolhaAdmin = useMemo(
    () => divergenciasAdminSemEscolha(divergenciasDoAdmin, escolhas),
    [divergenciasDoAdmin, escolhas],
  );
  const faltaDecidir = semEscolha.length + semEscolhaAdmin.length;

  /**
   * Vínculo enviado ao cadastro: sai EXCLUSIVAMENTE da decisão do gestor. Sem
   * decisão, vale o conferido na pré-admissão; a ficha só entra quando o nome
   * lido corresponde a um cadastro real da empresa.
   */
  const vinculoDecidido = () => {
    const escolheuFicha = (campo: string) => escolhas[`admin.${campo}`] === "ficha";
    const lido = (chave: string) => String((dados[chave] as string) ?? "").trim();
    const cargoFicha = escolheuFicha("cargo") ? resolverPorNome(cargos, lido("cargo")) : null;
    const unidadeFicha = escolheuFicha("unidade") ? resolverPorNome(unidades, lido("unidade")) : null;
    const setorFicha = escolheuFicha("setor") ? resolverPorNome(setores, lido("setor")) : null;
    const regimeFicha = escolheuFicha("regime_trabalho")
      ? REGIMES.find((r) => r.value === lido("regime"))?.value ?? null
      : null;
    const formaFicha = escolheuFicha("forma_pagamento")
      ? FORMAS_PAGAMENTO.find((f) => f.value === lido("forma_pagamento"))?.value ?? null
      : null;
    return {
      cargoId: cargoFicha?.id ?? cargoConferidoId ?? cargoId,
      unidadeId: unidadeFicha?.id ?? unidadeConferidaId ?? unidadeId,
      setorId: setorFicha?.id ?? setorConferidoId ?? setorId,
      regime: regimeFicha ?? (adminDados?.regime_trabalho as string) ?? regime,
      formaPagamento: formaFicha ?? (adminDados?.forma_pagamento as string) ?? formaPagamento,
    };
  };

  /**
   * Somente anexar a ficha: caminho PRÓPRIO, que não cria, não reativa e não
   * altera cadastro algum. Nenhum dado da pré-admissão é alterado.
   */
  const [anexando, setAnexando] = useState(false);
  const somenteAnexarFicha = async () => {
    if (!preadmissaoId) return;
    setAnexando(true);
    try {
      await anexarSomenteFicha(preadmissaoId, item.id);
      toast.success("Ficha registrada como recebida. Nenhum cadastro foi criado ou alterado.");
      await preadmissao.refetch();
    } catch (e) {
      notifyError(e as Error, { surface: "Pessoas 360°", action: "registrar o anexo da ficha" });
    } finally {
      setAnexando(false);
    }
  };

  /**
   * Antes de aprovar: cria o cargo que a ficha traz (com CBO), grava o salário
   * da ficha como padrão da unidade (ou piso da convenção, se houver patronal)
   * e confere a dispensa de ponto em unidade com mais de 20 pessoas.
   */
  const executar = async (camposPermitidos: string[] | null) => {
    if (!unidadeId) {
      setCompletarAberto(true);
      setTentouCriar(true);
      toast.error("Escolha a unidade antes de aprovar. Se ela ainda não existe, use \"Cadastrar Unidade da Ficha\".");
      return;
    }
    if (problemasHorario.length > 0) {
      setJornadaEditada((j) => j ?? jornadaEditavel(jornadaLida));
      setEditandoJornada(true);
      toast.error("Confira o horário de trabalho: informe o intervalo em minutos de cada dia antes de criar o cadastro.");
      document.getElementById(`ficha-horario-${item.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (escolhasPendentes.length > 0) {
      setCompletarAberto(true);
      setTentouCriar(true);
      toast.error(mensagemEscolhasObrigatorias(escolhasPendentes));
      return;
    }
    if (faltaMotivoPonto) {
      setCompletarAberto(true);
      setTentouCriar(true);
      toast.error(
        pontoObrigatorio
          ? "A unidade tem mais de 20 pessoas: o ponto é obrigatório (Art. 74 da CLT). Informe o motivo da dispensa (ex.: cargo de confiança, Art. 62)."
          : "Informe o motivo de não registrar ponto (ex.: cargo de confiança, Art. 62 da CLT). Sem ele o sistema volta a ligar o ponto.",
      );
      return;
    }
    if (!cienciaJornadaOk) {
      setTentouJornada(true);
      toast.error("Horário fora da CLT: corrija o horário ou registre a ciência com o motivo.");
      document.getElementById(`ficha-clt-${item.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (divergenciasRegistro.length > 0 && !cienciaDivergenciaValida(justDivergencia, cienteDivergencia)) {
      setTentouCriar(true);
      toast.error("Há divergência com a ficha de registro. Informe a justificativa e confirme a ciência.");
      document.getElementById(`ficha-div-${item.id}-just`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    let cargoFinal = cargoId;
    if (automatizarCargo) {
      setPreparando(true);
      try {
        const nomeCargo = String(dados.cargo_nome ?? "").trim().toUpperCase();
        // Na pré-admissão o cargo já foi escolhido no convite: nada é criado.
        if (!preadmissaoId && !cargoFinal && !cargoPorCbo && nomeCargo) {
          const novo = await upsertCargo.mutateAsync({ nome: nomeCargo, cbo: String(dados.cbo ?? "").trim() || null });
          cargoFinal = (novo as { id: string }).id;
          setCargoIdState(cargoFinal);
          setCargoTocado(true);
        }
        const cargoPiso = preadmissaoId ? (vinculoDecidido()?.cargoId ?? cargoFinal) : cargoFinal;
        const formaFinal = preadmissaoId ? (vinculoDecidido()?.formaPagamento ?? formaPagamento) : formaPagamento;
        const mensal = (formaFinal ?? formaInferida) === "mensalista";
        if (cargoPiso && unidadeId && salarioFicha && mensal && !salarioCargoDe(cargoPiso, unidadeId)) {
          await upsertPiso.mutateAsync({
            cargo_id: cargoPiso,
            salario_base: salarioFicha,
            vigencia_inicio: new Date().toISOString().slice(0, 10),
            sindicato_patronal_id: patronalUnidade?.id ?? null,
            unidade_id: patronalUnidade?.id ? null : unidadeId,
          });
        }
      } catch (e) {
        notifyError(e as Error, { surface: "Pessoas 360°", action: "cadastrar o cargo e o salário da ficha" });
        setPreparando(false);
        return;
      }
      setPreparando(false);
    }
    executarInterno(camposPermitidos, cargoFinal);
  };

  const executarInterno = async (camposPermitidos: string[] | null, cargoAuto: string | null) => {
    if (escolhasPendentes.length > 0) {
      setCompletarAberto(true);
      setTentouCriar(true);
      toast.error(mensagemEscolhasObrigatorias(escolhasPendentes));
      return;
    }

    if (preadmissaoId && faltaDecidir > 0) {
      toast.error("Escolha, em cada divergência, qual valor vale antes de concluir.");
      return;
    }
    const decidido = preadmissaoId ? vinculoDecidido() : null;
    if (!(decidido?.cargoId ?? cargoAuto ?? cargoId)) {
      setTentouCriar(true);
      toast.warning(
        dados.cargo_nome
          ? `Escolha o cargo de ${String(dados.nome ?? "")} ou cadastre “${String(dados.cargo_nome)}” antes de salvar.`.replace("de  ou", "ou")
          : "Escolha o cargo antes de salvar.",
      );
      document.getElementById(`ficha-cargo-${item.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const dadosBase = preadmissaoId ? dadosParaCadastro(stagingDados, dados, escolhas) : dados;
    const dadosEnvio = unidadeTemPonto && possuiFolhaPonto === false && justificativaPonto.trim()
      ? { ...dadosBase, folha_ponto_dispensa_justificativa: justificativaPonto.trim() }
      : dadosBase;
    if (!(atualizar && !!item.colaborador_existente_id)) {
      try {
        await garantirColaboradorNovo(item.company_id, String(dados.nome ?? "") || null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Inclusão cancelada.");
        return;
      }
    }
    aplicar.mutate(
      {
        item,
        dados: dadosEnvio,
        cargoId: decidido?.cargoId ?? cargoAuto ?? cargoId,
        unidadeId: decidido?.unidadeId ?? unidadeId,
        setorId: decidido?.setorId ?? setorId,
        regime: decidido?.regime ?? regime,
        atualizarExistente: atualizar && !!item.colaborador_existente_id,
        jornada: usarJornada ? jornada : null,
        turnoId: usarJornada ? turnoEscolhido : null,
        camposPermitidos,
        anexarFicha,
        formaPagamento: decidido?.formaPagamento ?? formaPagamento,
        possuiFolhaPonto,
        optanteAdiantamento,
        assinaturaPapel,
        preadmissaoId,
      },
      {
        onSuccess: async (res) => {
          if ((res as { assinatura?: string } | undefined)?.assinatura === "falhou") {
            toast.warning('Cadastro criado, mas não deu para marcar "assina em papel". Marque em "Assinatura de documentos", na ficha do colaborador.');
          }
          setComparacao(false);
          // Familiares da ficha viram dependentes (filhos, enteados, tutelados, cônjuge).
          const colabId = (res as { colaboradorId?: string } | undefined)?.colaboradorId;
          if (divergenciasRegistro.length > 0) {
            try {
              await registrarCienciaRegra({
                companyId: item.company_id,
                tabela: "dp_colaboradores",
                registroId: colabId ?? null,
                valorAntigo: { origem: "ficha_registro", ficha_item_id: item.id },
                valorNovo: {
                  tipo: "divergencia_ficha_registro",
                  divergencias: resumoDivergencias(divergenciasRegistro),
                },
                justificativa: justDivergencia.trim(),
                ciencia: true,
              });
            } catch { /* o cadastro não falha pelo registro de ciência */ }
          }
          if (colabId && !res?.jaAplicado && (inconformidades.length > 0 || intervaloReduzidoPeloLote || folgaNaEscala)) {
            const motivos = [
              inconformidades.length > 0 ? justJornada.trim() : null,
              intervaloReduzidoPeloLote ? `Ciência do lote (intervalo de 30 min): ${cienciaIntervaloLote}` : null,
              folgaNaEscala ? "Ficha listava os 7 dias: 1 folga por semana definida na escala." : null,
            ].filter(Boolean);
            try {
              await registrarCienciaRegra({
                companyId: item.company_id,
                tabela: "dp_colaboradores",
                registroId: colabId,
                valorAntigo: {
                  origem: "ficha_registro",
                  ficha_item_id: item.id,
                  horario_ficha: typeof dados.jornada_texto === "string" ? dados.jornada_texto : null,
                },
                valorNovo: {
                  tipo: "jornada_fora_clt",
                  inconformidades: resumoInconformidades(inconformidades),
                  intervalo_reduzido_ciencia_lote: intervaloReduzidoPeloLote,
                  folga_definida_na_escala: folgaNaEscala,
                },
                justificativa: motivos.join(" | "),
                ciencia: true,
              });
            } catch {
              toast.warning("Cadastro criado, mas a ciência do horário não foi registrada. Avise o suporte Aveto.");
            }
          }
          if (colabId && importarDependentes && dependentesLidos.length > 0 && !res?.jaAplicado) {
            const { data: existentes } = await supabase
              .from("dp_dependentes").select("nome").eq("colaborador_id", colabId);
            const jaTem = new Set((existentes ?? []).map((x) => String(x.nome).toUpperCase()));
            let falhas = 0;
            for (const dep of dependentesLidos) {
              if (jaTem.has(dep.nome)) continue;
              try {
                await salvarDependente(colabId, {
                  nome: dep.nome, parentesco: dep.parentesco, data_nascimento: dep.data_nascimento,
                  cpf: dep.cpf, deficiencia: false, conta_irrf: dep.irrf, conta_salario_familia: dep.parentesco !== "conjuge",
                  observacao: preadmissaoId ? "Informado pelo candidato na pré-admissão." : "Importado da Ficha de Registro.",
                });
              } catch { falhas += 1; }
            }
            if (falhas) toast.warning(`${falhas} dependente(s) da ficha não puderam ser cadastrados. Confira na aba Dependentes.`);
          }
          // Promoção de folguista: o servidor liga a ficha à pessoa e conclui a
          // promoção. Repetir a chamada não promove duas vezes.
          if (pessoaApoioId) {
            try {
              await vincularOrigemApoio(pessoaApoioId, { fichaItemId: item.id });
            } catch (e) {
              toast.error(mensagemOrigemApoio(e));
            }
          }
          toast.success(
            preadmissaoId
              ? "Pré-admissão concluída e cadastro criado"
              : atualizar
              ? "Cadastro atualizado"
              : "Colaborador cadastrado",
          );
          if (unidadeIrregularPonto && !atualizar) {
            toast.warning("Registro de ponto obrigatório na unidade (Art. 74 da CLT)", {
              description: `A unidade agora tem ${lotacaoComEste} colaboradores ativos e está sem ponto e sem justificativa. A pendência foi criada: ative o ponto ou registre a justificativa no cadastro da unidade.`,
              duration: 15000,
            });
          }
          onConcluido?.(item.id, String(dados.nome ?? item.nome_extraido ?? "Colaborador"));
        },
        onError: (e: Error) => notifyError(e, { surface: "Pessoas 360°", action: "concluir a ação" }),
      },
    );
  };

  /** O que foi completado ou escolhido nesta ficha, para continuar depois (não cria cadastro). */
  const montarRascunho = (): AjusteFichaLote => {
    const alterados: Record<string, unknown> = {};
    for (const k of Object.keys(dados)) {
      if (JSON.stringify(dados[k] ?? null) !== JSON.stringify(extraidos[k] ?? null)) alterados[k] = dados[k];
    }
    const aj: AjusteFichaLote = { dados: alterados };
    if (regimeEscolhido) aj.regime = regimeEscolhido;
    if (formaPagamento) aj.forma_pagamento = formaPagamento;
    if (optanteEscolhido !== null) aj.adiantamento = optanteEscolhido;
    // Ponto: guarda a decisão desta ficha (ou a que veio do rascunho) para não se perder.
    if (possuiFolhaPonto !== null && (pontoTocado || typeof rascunho?.folha_ponto === "boolean")) {
      aj.folha_ponto = possuiFolhaPonto;
      aj.folha_ponto_justificativa = possuiFolhaPonto === false ? justificativaPonto.trim() || null : null;
    }
    if (assinaturaPapel || typeof rascunho?.assinatura_papel === "boolean") aj.assinatura_papel = assinaturaPapel;
    if (turnoId) aj.turno_id = turnoId;
    if (cargoTocado) aj.cargo_id = cargoId;
    if (setorEscolhido && setorEscolhido !== (vinculoLote?.setorId ?? null)) aj.setor_id = setorEscolhido;
    return aj;
  };

  const set = (campo: string, valor: string) =>
    setDados((d) => {
      // O WhatsApp acompanha o telefone até alguém digitar um número diferente.
      if (campo === "telefone" && !whatsappEditado) return { ...d, telefone: valor, whatsapp: valor };
      return { ...d, [campo]: valor };
    });

  const endereco = (dados.endereco ?? {}) as Record<string, unknown>;

  /** Parte do endereço lida como texto, venha ela como texto ou vazia. */
  const textoEndereco = (parte: string) =>
    typeof endereco[parte] === "string" ? String(endereco[parte]) : "";


  /** Salário/cargo vindos da última alteração da ficha, com o da admissão para conferência. */
  const notaVigencia = (tipo: "salario" | "cargo") => {
    const vigencia = dados[`${tipo}_vigencia`];
    if (typeof vigencia !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(vigencia)) return null;
    const [a, m, d] = vigencia.split("-");
    const admissao = dados[`${tipo}_admissao`];
    const admissaoTxt =
      tipo === "salario"
        ? typeof admissao === "number" || typeof admissao === "string"
          ? `R$ ${Number(admissao).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
          : null
        : typeof admissao === "string" && admissao.trim() ? admissao : null;
    return (
      <p className="text-[11px] leading-snug text-muted-foreground">
        <Badge variant="outline" className="mr-1 h-4 border-primary/40 px-1 text-[10px] font-normal text-primary">
          Última alteração
        </Badge>
        vigente desde {d}/{m}/{a}
        {admissaoTxt ? ` · na admissão: ${admissaoTxt}` : ""}
      </p>
    );
  };

  const campo = (label: string, nome: string, tipo: "text" | "date" = "text") => {
    const valor = dados[nome];
    const nivel = nivelDoCampo(valor, confianca, nome);
    const duvidoso = nivel === "baixa" || nivel === "ausente";
    const trecho = duvidoso ? trechoDoTexto(item.texto_origem, [label, valor as string]) : null;
    const aberto = !!trechos[nome];
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs">{label}</Label>
          <Badge variant="outline" className={cn("h-4 px-1 text-[10px] font-normal", NIVEL_CLASS[nivel])}>
            {CONFIANCA_LABEL[nivel]}
          </Badge>
        </div>
        <Input
          className="h-9"
          type={tipo}
          value={typeof valor === "string" || typeof valor === "number" ? String(valor) : ""}
          onChange={(e) => set(nome, e.target.value)}
          disabled={aplicado || ignorado}
        />
        {trecho && (
          <>
            <button
              type="button"
              className="text-[11px] text-muted-foreground underline underline-offset-2"
              onClick={() => setTrechos((t) => ({ ...t, [nome]: !t[nome] }))}
            >
              {aberto ? "Esconder trecho lido" : "Ver trecho lido"}
            </button>
            {aberto && (
              <pre className="whitespace-pre-wrap rounded-md bg-muted p-2 text-[11px] leading-snug text-muted-foreground">
                {trecho}
              </pre>
            )}
          </>
        )}
      </div>
    );
  };


  if (ignorado) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <div className="min-w-0 space-y-1">
            <span className="block truncate text-sm text-muted-foreground">{item.nome_extraido ?? "Ficha sem nome"}</span>
            <Badge variant="outline">Ignorada</Badge>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-10 shrink-0"
            disabled={reativar.isPending}
            onClick={() =>
              reativar.mutate(item.id, {
                onSuccess: () => toast.success("Ficha reativada: ela volta para a lista do lote."),
                onError: (e: Error) => notifyError(e, { surface: "Pessoas 360°", action: "reativar a ficha" }),
              })
            }
          >
            Reativar ficha
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(aplicado && "border-emerald-500/40", emFoco && !aplicado && "border-primary ring-2 ring-primary/30")}>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            {(posicao || emFoco) && (
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                {posicao && total ? (
                  <Badge variant="secondary" className="text-[11px]">Ficha {posicao} de {total}</Badge>
                ) : null}
                {emFoco && !aplicado && (
                  <Badge className="text-[11px]">Cadastrando Agora</Badge>
                )}
              </div>
            )}
            <p className="truncate text-base font-semibold">{(dados.nome as string) ?? "Ficha sem nome"}</p>
            <p className="text-xs text-muted-foreground">
              Página {item.pagina_inicio}
              {item.pagina_fim > item.pagina_inicio ? ` a ${item.pagina_fim}` : ""}
            </p>
          </div>
          {aplicado ? (
            <Badge className="bg-emerald-600 text-white">
              <Check className="mr-1 h-3 w-3" />
              {item.status === "criado" ? "Cadastro criado" : "Cadastro atualizado"}
            </Badge>
          ) : item.colaborador_existente_id ? (
            <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">
              <UserCheck className="mr-1 h-3 w-3" /> Já cadastrado
            </Badge>
          ) : item.status === "revisar" ? (
            <Badge variant="outline" className="border-destructive/50 text-destructive">
              <AlertTriangle className="mr-1 h-3 w-3" /> Precisa de revisão
            </Badge>
          ) : null}
        </div>

        {!aplicado && (avisoFranquia || bloqueadoPorFranquia) && <FranquiaColaboradoresAviso estado={estadoFranquia} />}

        {!aplicado && !ignorado && destacarPendencias && (() => {
          const pend: Array<{ rotulo: string; alvo: string; abrir?: boolean }> = [];
          if (!cargoId) pend.push({ rotulo: "cargo", alvo: `ficha-cargo-${item.id}` });
          for (const r of escolhasPendentes) pend.push({ rotulo: r, alvo: `ficha-completar-${item.id}`, abrir: true });
          if (usarJornada && !turnoEscolhido && jornada.vazia) pend.push({ rotulo: "horário", alvo: `ficha-turno-${item.id}` });
          if (!cienciaJornadaOk) {
            for (const i of inconformidades) pend.push({ rotulo: PENDENCIA_POR_INCONFORMIDADE[i.codigo], alvo: `ficha-clt-${item.id}` });
          }
          const ir = (p: (typeof pend)[number]) => {
            if (p.abrir) setCompletarAberto(true);
            window.setTimeout(
              () => document.getElementById(p.alvo)?.scrollIntoView({ behavior: "smooth", block: "center" }),
              60,
            );
          };
          const naoVeio = faltando.map((c) => c.label);
          const blocoAcesso = semDadosAcesso(dados) && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-background/60 p-2 text-xs">
              <KeyRound className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="font-medium">Faltam dados de acesso:</span> sem telefone/WhatsApp e sem e-mail. O cadastro
                pode ser criado, mas a pessoa só acessa o portal depois de preencher.
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 bg-background"
                onClick={() => document.getElementById(`ficha-telefone-${item.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
              >
                Preencher
              </Button>
            </div>
          );
          const blocoNaoVeio = naoVeio.length > 0 && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Não veio na ficha:</span> {naoVeio.join(", ")}.
              {" "}Não impede o cadastro — dá para completar abaixo ou depois.
            </p>
          );
          return pend.length === 0 ? (
            <div className="space-y-2 rounded-lg border border-success/40 bg-success/10 p-3 text-sm">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0 text-success" />
                <span>Tudo o que é obrigatório está definido. Confira os dados lidos e crie o cadastro.</span>
              </div>
              {blocoAcesso}
              {blocoNaoVeio}
            </div>
          ) : (
            <div className="space-y-2 rounded-lg border border-warning/50 bg-warning/10 p-3">
              <p className="text-sm font-semibold">O que falta você definir</p>
              <div className="flex flex-wrap gap-2">
                {pend.map((p) => (
                  <Button
                    key={p.rotulo}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-full bg-background capitalize"
                    onClick={() => ir(p)}
                  >
                    {p.rotulo}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Toque para ir direto ao campo.</p>
              {blocoAcesso}
              {blocoNaoVeio}
            </div>
          );
        })()}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {campo("Nome", "nome")}
          {campo("CPF", "cpf")}
          {campo("Matrícula", "matricula")}
          {campo("Nascimento", "data_nascimento", "date")}
          {campo("Admissão", "data_admissao", "date")}
          <div className="space-y-1">
            {campo("Salário", "salario")}
            {notaVigencia("salario")}
          </div>
          <div id={`ficha-telefone-${item.id}`} className="scroll-mt-24">{campo("Telefone", "telefone")}</div>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">WhatsApp</Label>
              {!whatsappEditado && !!dados.whatsapp && (
                <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal text-muted-foreground">
                  igual ao telefone
                </Badge>
              )}
            </div>
            <Input
              className="h-9"
              value={typeof dados.whatsapp === "string" ? dados.whatsapp : ""}
              onChange={(e) => {
                setWhatsappEditado(true);
                setDados((d) => ({ ...d, whatsapp: e.target.value }));
              }}
              disabled={aplicado || ignorado}
            />
          </div>

          {campo("Nome da mãe", "nome_mae")}
          {campo("RG", "rg_numero")}
          {campo("CTPS", "ctps_numero")}
          {campo("PIS", "pis_nit")}
          <div className="space-y-1">
            {campo("Cargo na ficha", "cargo_nome")}
            {notaVigencia("cargo")}
          </div>
        </div>

        {!aplicado && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1" id={`ficha-cargo-${item.id}`}>
              <Label className="text-xs">Cargo cadastrado *</Label>
              <CargoBuscaSelect
                cargos={cargos}
                value={cargoId}
                onChange={setCargoId}
                nomeLido={(dados.cargo_nome as string) ?? null}
                sugestaoId={cargoPorCbo?.id ?? null}
                rotuloReserva={cargoId && cargoCriado?.id === cargoId ? cargoCriado.nome : null}
                onCriar={abrirCadastroCargo}
                classeRealce={realce(!cargoId)}
              />
              {cargoId && cargoAutomatico === cargoId && (
                <p className="text-[11px] text-muted-foreground">Preenchido pelo cargo da ficha.</p>
              )}
              {!cargoId && cargoPorCbo && !!dados.cargo_nome && (
                <div className="space-y-1.5 rounded-md bg-amber-500/10 p-2">
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    A ficha diz “{String(dados.cargo_nome)}”. O cargo {cargoPorCbo.nome} tem o mesmo código CBO, mas o nome é diferente.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => setCargoId(cargoPorCbo.id)}>
                      Usar {cargoPorCbo.nome}
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => abrirCadastroCargo(String(dados.cargo_nome ?? ""))}>
                      <Plus className="mr-1 h-3 w-3" /> Criar “{String(dados.cargo_nome)}”
                    </Button>
                  </div>
                </div>
              )}
              {!cargoId && !cargoPorCbo && (
                <div className="flex flex-wrap items-center gap-2">
                  <p className={cn("text-[11px]", tentouCriar && !(automatizarCargo && dados.cargo_nome && !preadmissaoId) ? "text-destructive" : "text-amber-600 dark:text-amber-400")}>
                    {dados.cargo_nome
                      ? automatizarCargo && !preadmissaoId
                        ? `O cargo “${String(dados.cargo_nome).toUpperCase()}”${dados.cbo ? ` (CBO ${String(dados.cbo)})` : ""} será cadastrado automaticamente ao aprovar.`
                        : `Nenhum cargo cadastrado corresponde a “${String(dados.cargo_nome)}”.`
                      : "Escolha o cargo ou cadastre um novo."}
                  </p>
                  <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => abrirCadastroCargo(String(dados.cargo_nome ?? ""))}>
                    <Plus className="mr-1 h-3 w-3" /> Criar este cargo
                  </Button>
                </div>
              )}
              {salarioFicha && (
                <label className="flex items-start gap-2 text-[11px] text-muted-foreground">
                  <Switch checked={automatizarCargo} onCheckedChange={setAutomatizarCargo} className="mt-0.5 scale-75" />
                  <span>
                    Usar o salário da ficha (R$ {salarioFicha.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}) como padrão do cargo
                    {patronalUnidade ? ` na convenção ${patronalUnidade.nome}` : " nesta unidade"} quando ainda não houver salário cadastrado.
                  </span>
                </label>
              )}
            </div>


            <div className="space-y-1">
              <Label className="text-xs">Unidade</Label>
              <Select value={unidadeId ?? "__none"} onValueChange={(v) => setUnidadeId(v === "__none" ? null : v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Escolher" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sem unidade</SelectItem>
                  {unidades.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {unidadeSugerida.unidade_id && unidadeSugerida.unidade_id === unidadeId && (
                <p className="text-[11px] text-muted-foreground">
                  {unidadeSugerida.motivo === "cnpj"
                    ? `Unidade reconhecida pelo CNPJ da ficha (${formatCnpj(unidadeSugerida.cnpj_lido)}).`
                    : "Unidade reconhecida pelo nome da empresa na ficha."}
                </p>
              )}
              {!unidadeSugerida.unidade_id && !empresaDivergente && !!unidadeSugerida.cnpj_lido && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  A ficha traz o CNPJ {formatCnpj(unidadeSugerida.cnpj_lido)}, que não está em nenhuma unidade.{" "}
                  <Link to="/dp/unidades" className="underline">Completar o CNPJ nas unidades</Link> faz as próximas
                  fichas serem reconhecidas sozinhas.
                </p>
              )}
              {!unidadeSugerida.cnpj_lido && (
                <p className="text-[11px] text-muted-foreground">
                  Não conseguimos ler o CNPJ do empregador nesta ficha — confira a unidade.
                </p>
              )}
              {!unidadeId && (
                <p className="text-[11px] text-destructive">
                  A unidade é obrigatória para aprovar a ficha.
                  {unidades.length === 0 && " Nenhuma unidade cadastrada ainda: cadastre a partir dos dados da ficha."}
                </p>
              )}
              {!unidadeSugerida.unidade_id && (!unidadeId || !!unidadeSugerida.cnpj_lido || !!unidadeSugerida.empregador_lido) && (
                <Button
                  variant={unidadeId ? "outline" : "default"}
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => setUnidadeDialog(true)}
                >
                  <Plus className="mr-1 h-3 w-3" /> Cadastrar Unidade da Ficha
                </Button>
              )}
            </div>

          </div>
        )}

        {!aplicado && (
          <div className="scroll-mt-20 rounded-lg border bg-muted/20" id={`ficha-completar-${item.id}`}>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 p-3 text-left"
              onClick={() => setCompletarAberto((v) => !v)}
            >
              <span className="text-sm font-medium">Completar cadastro</span>
              <span className="flex items-center gap-2">
                {faltando.length + escolhasPendentes.length > 0 ? (
                  <Badge variant="outline" className="border-amber-500/50 text-[11px] text-amber-600 dark:text-amber-400">
                    {faltando.length + escolhasPendentes.length} campo(s) em branco
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-emerald-500/50 text-[11px] text-emerald-600 dark:text-emerald-400">
                    completo
                  </Badge>
                )}
                {completarAberto ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </span>
            </button>

            {completarAberto && (
              <div className="space-y-3 border-t p-3">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {(setores.length > 0 || !!unidadeId) && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Setor</Label>
                        {unidadeId && (
                          <button type="button" className="text-[11px] text-primary hover:underline" onClick={() => setSetorDialog(true)}>
                            + Novo Setor
                          </button>
                        )}
                      </div>
                      <Select
                        value={setorId ?? "__none"}
                        onValueChange={(v) => setSetorEscolhido(v === "__none" ? null : v)}
                      >
                        <SelectTrigger className="h-9"><SelectValue placeholder="Escolher" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">Sem setor</SelectItem>
                          {setoresDaUnidade.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-1">
                    <Label className="text-xs">Vínculo *</Label>
                    <Select value={regime ?? undefined} onValueChange={(v) => { setRegimeEscolhidoManual(true); setRegimeEscolhido(v); }}>
                      <SelectTrigger className={cn("h-9", realce(!regime))}>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {REGIMES.map((r) => (
                          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {regime && regime === regimeInferido && !regimeEscolhidoManual && (
                      <p className="text-[11px] text-muted-foreground">Sugerido pela ficha (PIS, CTPS, eSocial ou FGTS).</p>
                    )}
                    {tentouCriar && !regime && (
                      <p className="text-[11px] text-destructive">Escolha o vínculo.</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Forma de pagamento *</Label>
                    <Select value={formaPagamento ?? undefined} onValueChange={setFormaPagamento}>
                      <SelectTrigger className={cn("h-9", realce(!formaPagamento))}>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mensalista">Mensalista</SelectItem>
                        <SelectItem value="horista">Horista</SelectItem>
                        <SelectItem value="diarista">Diarista</SelectItem>
                      </SelectContent>
                    </Select>
                    {formaPagamento && formaPagamento === formaInferida && (
                      <p className="text-[11px] text-muted-foreground">Sugerido pela ficha (salário e dias de trabalho).</p>
                    )}
                    {tentouCriar && !formaPagamento && (
                      <p className="text-[11px] text-destructive">Escolha a forma de pagamento.</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Folha de ponto *</Label>
                    <Select value={possuiFolhaPonto === null ? undefined : String(possuiFolhaPonto)} onValueChange={(v) => setPossuiFolhaPonto(v === "true")}>
                      <SelectTrigger className={cn("h-9", realce(possuiFolhaPonto === null))}>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Ativa</SelectItem>
                        <SelectItem value="false">Não utiliza</SelectItem>
                      </SelectContent>
                    </Select>
                    {tentouCriar && possuiFolhaPonto === null && (
                      <p className="text-[11px] text-destructive">Informe se usa folha de ponto.</p>
                    )}
                    {pontoObrigatorio && possuiFolhaPonto !== false && (
                      <p className="text-[11px] text-muted-foreground">Obrigatório: a unidade tem mais de 20 pessoas (Art. 74 da CLT).</p>
                    )}
                    {exigeMotivoPonto && (
                      <div className="space-y-1.5 rounded-md bg-amber-500/10 p-2">
                        <p className="text-[11px] text-amber-700 dark:text-amber-400">
                          {pontoObrigatorio
                            ? "A unidade tem mais de 20 pessoas e o ponto é obrigatório por lei. Só dispense em exceção legal:"
                            : "Só fica sem ponto quem se enquadra numa exceção legal. Informe o motivo:"}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {MOTIVOS_DISPENSA_PONTO.map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setJustificativaPonto(m)}
                              className={cn(
                                "min-h-8 rounded-full border px-2.5 text-[11px]",
                                justificativaPonto === m ? "border-primary bg-primary/10 text-primary" : "bg-background",
                              )}
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                        <Input
                          value={justificativaPonto}
                          onChange={(e) => setJustificativaPonto(e.target.value)}
                          placeholder="Motivo da dispensa *"
                          maxLength={500}
                          className={cn("h-9 text-xs", realce(faltaMotivoPonto))}
                        />
                      </div>
                    )}
                    {unidadeIrregularPonto && (
                      <div className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-[11px] text-destructive">
                        <p className="font-medium">
                          Com esta admissão, a unidade passa a ter {lotacaoComEste} colaboradores ativos e está sem registro de ponto.
                        </p>
                        <p>{AVISO_ART74} Ative o ponto da unidade ou registre a justificativa legal.</p>
                        <Button
                          type="button" size="sm" variant="outline" className="h-7 text-[11px]"
                          onClick={() => window.open(`/dp/cadastros/unidades?editar=${unidadeId}&aba=dados`, "_blank", "noopener")}
                        >
                          Regularizar Unidade
                        </Button>
                      </div>
                    )}
                    {unidades.find((u) => u.id === unidadeId)?.possui_relogio_ponto && possuiFolhaPonto === null && (
                      <p className="text-[11px] text-muted-foreground">Sugestão: ativa, pois a unidade possui relógio de ponto.</p>
                    )}
                  </div>

                  {dependentesLidos.length > 0 && (
                    <div className="space-y-1 sm:col-span-2 rounded-md border p-2">
                      <label className="flex items-center gap-2 text-xs font-medium">
                        <Switch checked={importarDependentes} onCheckedChange={setImportarDependentes} className="scale-75" />
                        Cadastrar {dependentesLidos.length} dependente(s) {preadmissaoId ? "informado(s) pelo candidato" : "lido(s) na ficha"}
                      </label>
                      <ul className="text-[11px] text-muted-foreground">
                        {dependentesLidos.map((d) => (
                          <li key={d.nome}>{d.nome} · {d.parentesco === "conjuge" ? "Cônjuge" : d.parentesco.charAt(0).toUpperCase() + d.parentesco.slice(1)}{d.data_nascimento ? ` · ${d.data_nascimento.split("-").reverse().join("/")}` : ""}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="space-y-1">
                    <Label className="text-xs">Adiantamento salarial *</Label>
                    <Select value={optanteAdiantamento === null ? undefined : String(optanteAdiantamento)} onValueChange={(v) => setOptanteAdiantamento(v === "true")}>
                      <SelectTrigger className={cn("h-9", realce(optanteAdiantamento === null))}>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Optante</SelectItem>
                        <SelectItem value="false">Não optante</SelectItem>
                      </SelectContent>
                    </Select>
                    {optanteEscolhido === null && adiantamentoPadrao !== null && (
                      <p className="text-[11px] text-muted-foreground">
                        {adiantamentoPadrao === false && onSalvarRascunho
                          ? "Entra como não optante. Dá para mudar depois no cadastro."
                          : "Preenchido pelo adiantamento da maioria do lote."}
                      </p>
                    )}
                    {tentouCriar && optanteAdiantamento === null && (
                      <p className="text-[11px] text-destructive">Informe se recebe adiantamento.</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Assinatura de documentos</Label>
                    <Select value={assinaturaPapel ? "papel" : "celular"} onValueChange={(v) => setAssinaturaPapel(v === "papel")}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="celular">Celular (portal)</SelectItem>
                        <SelectItem value="papel">Papel (via impressa)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                      {assinaturaPapel
                        ? "Vale desde a admissão: os documentos não vão para o celular; imprima, colha a assinatura e anexe a via assinada."
                        : !String(dados.whatsapp ?? dados.telefone ?? dados.email ?? "").trim()
                          ? "Sem WhatsApp ou e-mail. Se a pessoa não tem celular, escolha Papel."
                          : "Assina pelo portal, no celular."}
                    </p>
                  </div>


                  <div className="space-y-1">
                    <Label className="text-xs">Estado civil</Label>
                    <Select
                      value={(dados.estado_civil as string) || "__none"}
                      onValueChange={(v) => set("estado_civil", v === "__none" ? "" : v)}
                    >
                      <SelectTrigger className="h-9"><SelectValue placeholder="Escolher" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Não informado</SelectItem>
                        {ESTADOS_CIVIS.map((e) => (
                          <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {campo("E-mail", "email")}
                </div>

                <EnderecoFields
                  idPrefix="ficha-endereco"
                  disabled={aplicado || ignorado}
                  valor={{
                    cep: textoEndereco("cep"),
                    logradouro: textoEndereco("logradouro"),
                    numero: textoEndereco("numero"),
                    complemento: textoEndereco("complemento"),
                    bairro: textoEndereco("bairro"),
                    cidade: textoEndereco("cidade"),
                    uf: textoEndereco("uf"),
                  }}
                  onChange={(patch) =>
                    setDados((d) => ({
                      ...d,
                      endereco: {
                        ...((d.endereco ?? {}) as Record<string, unknown>),
                        ...patch,
                      },
                    }))
                  }
                />

                <p className="text-[11px] text-muted-foreground">
                  Benefícios e jornada detalhada continuam no cadastro completo do colaborador.
                </p>
              </div>
            )}
          </div>
        )}



        {(!jornada.vazia || !aplicado) && (
          <div id={`ficha-horario-${item.id}`} className="scroll-mt-20 rounded-lg border bg-muted/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium">
                {jornadaEditada ? "Horário ajustado nesta conferência" : "Horário da ficha"}
              </p>
              {!aplicado && (
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={() => {
                      setJornadaEditada((j) => j ?? jornadaEditavel(jornadaLida));
                      setEditandoJornada((v) => !v);
                      setUsarJornada(true);
                    }}
                  >
                    {editandoJornada ? "Fechar edição" : jornada.vazia ? "Definir horários" : "Editar horários"}
                  </Button>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Cadastrar</Label>
                    <Switch checked={usarJornada} onCheckedChange={setUsarJornada} />
                  </div>
                </div>
              )}
            </div>
            {semana && usarJornada && (
              <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                <span>
                  <span className="text-muted-foreground">Carga semanal:</span>{" "}
                  <strong className={cn(alertaCarga && "text-warning-foreground")}>{formatarHoras(semana.minutos)}</strong>
                  <span className="text-muted-foreground"> em {semana.diasTrabalho} {semana.diasTrabalho === 1 ? "dia" : "dias"}</span>
                </span>
                <span>
                  <span className="text-muted-foreground">Folga semanal:</span>{" "}
                  <strong>{rotuloFolgaSemanal(semana)}</strong>
                </span>
              </p>
            )}
            {jornada.vazia ? (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Nenhum horário foi lido nesta ficha. Você pode informar os horários à mão.
              </p>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-1 text-xs sm:grid-cols-4 lg:grid-cols-7">
                {jornada.dias.map((d) => (
                  <div key={d.dow} className="rounded border bg-background px-2 py-1">
                    <span className="font-medium">{DOW_LABEL[d.dow]}</span>
                    <span className="ml-1 text-muted-foreground">
                      {d.trabalha && d.entrada && d.saida ? `${d.entrada}–${d.saida}` : "folga"}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {editandoJornada && !aplicado && (
              <div className="mt-3 space-y-2 rounded-md border bg-background p-2">
                {(jornadaEditada ?? jornadaEditavel(jornadaLida)).dias.map((d) => (
                  <div key={d.dow} className="flex flex-wrap items-center gap-2">
                    <span className="w-9 text-xs font-medium">{DOW_LABEL[d.dow]}</span>
                    <Switch
                      checked={d.trabalha}
                      onCheckedChange={(v) => alterarDiaJornada(d.dow, { trabalha: v })}
                      aria-label={`Trabalha ${DOW_LABEL[d.dow]}`}
                    />
                    <Input
                      type="time"
                      className="h-8 w-[104px]"
                      value={d.entrada ?? ""}
                      disabled={!d.trabalha}
                      onChange={(e) => alterarDiaJornada(d.dow, { entrada: e.target.value || null })}
                    />
                    <span className="text-xs text-muted-foreground">até</span>
                    <Input
                      type="time"
                      className="h-8 w-[104px]"
                      value={d.saida ?? ""}
                      disabled={!d.trabalha}
                      onChange={(e) => alterarDiaJornada(d.dow, { saida: e.target.value || null })}
                    />
                    <Input
                      type="number"
                      min={0}
                      className="h-8 w-[92px]"
                      placeholder="Interv."
                      value={d.intervalo_minutos ?? ""}
                      disabled={!d.trabalha}
                      onChange={(e) =>
                        alterarDiaJornada(d.dow, {
                          intervalo_minutos: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                ))}
                <p className="text-[11px] text-muted-foreground">
                  Intervalo em minutos. Desligue o dia para marcar folga. Saída menor que a entrada indica virada de
                  meia-noite.
                </p>
                {jornadaEditada && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={() => { setJornadaEditada(null); setEditandoJornada(false); }}
                  >
                    Voltar ao horário lido na ficha
                  </Button>
                )}
              </div>
            )}
            {jornada.vira_meia_noite && (
              <p className="mt-2 text-[11px] text-muted-foreground">A saída acontece no dia seguinte.</p>
            )}
            {!aplicado && problemasHorario.length > 0 && (
              <div role="alert" className="mt-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-[11px] leading-relaxed text-warning-foreground">
                <strong>Revisar horário.</strong> {problemasHorario.join(" ")}
                {typeof dados.jornada_texto === "string" && dados.jornada_texto ? ` A ficha diz: "${dados.jornada_texto}".` : ""}
                {" "}Toque em "Editar horários" e informe o intervalo em minutos.
              </div>
            )}
            {!aplicado && (
              <JornadaConformidadeAlerta
                id={`ficha-clt-${item.id}`}
                inconformidades={inconformidades}
                justificativa={justJornada}
                onJustificativa={setJustJornada}
                ciente={cienteJornada}
                onCiente={setCienteJornada}
                mostrarErro={tentouJornada}
                plantaoLongo={plantaoLongo && inconformidades.some((i) => i.codigo === "carga_semanal")}
                onIntervaloMinimo={podeCompletarIntervalo
                  ? () => {
                      setJornadaEditada((j) => aplicarIntervaloMinimo(j ?? jornadaEditavel(jornadaLida)));
                      setUsarJornada(true);
                      toast.success("Intervalo mínimo aplicado. Confira a carga semanal.");
                    }
                  : null}
                onFolgaNaEscala={() => setFolgaNaEscala(true)}
              />
            )}
            {!aplicado && folgaNaEscala && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Folga semanal: 1 por semana, definida na escala.{" "}
                <button type="button" className="underline" onClick={() => setFolgaNaEscala(false)}>Desfazer</button>
              </p>
            )}
            {jornadaEditada && !jornadaLida.vazia && (
              <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
                <strong>Horário Diferente da Ficha.</strong> A ficha registra
                {typeof dados.jornada_texto === "string" && dados.jornada_texto ? ` "${dados.jornada_texto}"` : " outro horário"}.
                O cadastro usará o horário ajustado aqui. Peça à contabilidade para atualizar a ficha de registro.
              </div>
            )}

            {!aplicado && usarJornada && (
              <div className="mt-3 scroll-mt-20 space-y-1" id={`ficha-turno-${item.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs">Turno correspondente</Label>
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setTurnoDialog(true)}>
                    <Plus className="mr-1 h-3 w-3" /> Novo Turno
                  </Button>
                </div>
                <Select
                  value={turnoEscolhido ?? "__none"}
                  onValueChange={(v) => setTurnoId(v === "__none" ? null : v)}
                >
                  <SelectTrigger className="h-9"><SelectValue placeholder="Escolher" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sem turno (grava só os horários)</SelectItem>
                    {turnos.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.nome} · {String(t.entrada).slice(0, 5)}–{String(t.saida).slice(0, 5)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {turnoSugerido.turno_id
                    ? `Sugerido pelo horário da ficha (${turnoSugerido.entrada}–${turnoSugerido.saida}).`
                    : turnoSugerido.entrada
                      ? `Nenhum turno com ${turnoSugerido.entrada}–${turnoSugerido.saida}; os horários serão gravados direto no dia.`
                      : "Sem horário identificado nesta ficha."}
                </p>
              </div>
            )}
          </div>
        )}

        {empresaDivergente && !aplicado && (
          <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
            <p className="flex items-center gap-2 text-xs font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" /> Ficha de outra empresa
            </p>
            <p className="text-[11px] text-muted-foreground">
              O empregador desta ficha
              {unidadeSugerida.empregador_lido ? ` (${unidadeSugerida.empregador_lido})` : ""} tem o CNPJ{" "}
              {formatCnpj(unidadeSugerida.cnpj_lido)}, que não é da empresa em uso nem de nenhuma unidade cadastrada.
            </p>
            <div className="flex items-center gap-2">
              <Switch checked={confirmouEmpresa} onCheckedChange={setConfirmouEmpresa} />
              <span className="text-xs">Confirmo que esta ficha é desta empresa</span>
            </div>
          </div>
        )}

        {item.colaborador_existente_id && !aplicado && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
            <Switch checked={atualizar} onCheckedChange={setAtualizar} />
            <span className="text-xs">
              Este CPF já tem cadastro. Ative para completar o cadastro existente com os dados da ficha.
            </span>
          </div>
        )}

        {!aplicado && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Switch checked={anexarFicha} onCheckedChange={setAnexarFicha} />
              <span className="text-xs text-muted-foreground">Guardar o PDF da ficha nos documentos do colaborador</span>
            </div>
            {!!item.texto_origem && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setVerTexto((v) => !v)}>
                <FileText className="mr-1 h-3 w-3" /> {verTexto ? "Ocultar" : "Ver"} texto lido
              </Button>
            )}
          </div>
        )}

        {verTexto && !!item.texto_origem && (
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-[11px] leading-relaxed">
            {item.texto_origem}
          </pre>
        )}

        {!aplicado && !destacarPendencias && faltando.length > 0 && (() => {
          const obrig = faltando.filter((c) => c.obrigatorio);
          const opc = faltando.filter((c) => !c.obrigatorio);
          return (
            <div className="space-y-0.5 text-[11px]">
              {obrig.length > 0 && (
                <p className="text-amber-600 dark:text-amber-400">
                  Obrigatório em falta: {resumoFaltando(obrig)}. Nada impede o cadastro — dá para completar depois.
                </p>
              )}
              {opc.length > 0 && (
                <p className="text-muted-foreground">
                  Sugestão de complemento: {resumoFaltando(opc)}.
                </p>
              )}
            </div>
          );
        })()}

        {!aplicado && escolhasPendentes.length > 0 && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            Selecione antes de criar: {escolhasPendentes.join(", ")}.
          </p>
        )}

        <FichaHistoricoLido
          dados={dados}
          cargoId={cargoId}
          cargoNome={(cargos.find((c) => c.id === cargoId)?.nome as string | undefined) ?? null}
          colaboradorId={aplicado ? item.colaborador_id ?? null : null}
        />

        {aplicado && item.colaborador_id && onAbrirCadastro && (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => item.colaborador_id && onAbrirCadastro(item.colaborador_id)}>
              <UserCog className="mr-1 h-4 w-4" /> Abrir cadastro completo
            </Button>
          </div>
        )}

        {!aplicado && preadmissaoId && (
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <p className="text-xs font-medium">Conferência com a pré-admissão</p>
            {preadmissao.isLoading ? (
              <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Carregando os dados conferidos…
              </p>
            ) : !stagingDados ? (
              <p className="text-[11px] text-destructive">
                Não foi possível carregar os dados conferidos da pré-admissão. Recarregue a página antes de concluir.
              </p>
            ) : divergencias.length === 0 && divergenciasDoAdmin.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                A ficha da contabilidade confere com os dados revisados, inclusive cargo, unidade, salário e jornada.
                Nada será alterado sem sua escolha.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] text-muted-foreground">
                  {divergencias.length + divergenciasDoAdmin.length} campo(s) diferentes do que foi conferido — dados
                  pessoais e informações administrativas. Escolha qual valor vale em cada um; sem escolha, o valor
                  conferido é mantido.
                </p>
                {[...divergencias, ...divergenciasDoAdmin].map((d) => {
                  const escolha = escolhas[d.campo];
                  return (
                    <div key={d.campo} className="rounded-md border bg-background p-2">
                      <p className="text-[11px] font-medium">{d.rotulo}</p>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={escolha === "conferido" ? "default" : "outline"}
                          className="h-7 max-w-full justify-start text-[11px]"
                          aria-pressed={escolha === "conferido"}
                          onClick={() => setEscolhas((e) => ({ ...e, [d.campo]: "conferido" }))}
                        >
                          <span className="truncate">Conferido: {d.valorConferido}</span>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={escolha === "ficha" ? "default" : "outline"}
                          className="h-7 max-w-full justify-start text-[11px]"
                          aria-pressed={escolha === "ficha"}
                          onClick={() => setEscolhas((e) => ({ ...e, [d.campo]: "ficha" }))}
                        >
                          <span className="truncate">Ficha oficial: {d.valorFicha}</span>
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {faltaDecidir > 0 && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    Falta decidir: {[...semEscolha, ...semEscolhaAdmin].map((d) => d.rotulo).join(", ")}.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {!aplicado && (
          <DivergenciaFichaAlerta
            id={`ficha-div-${item.id}`}
            divergencias={divergenciasRegistro}
            justificativa={justDivergencia}
            onJustificativa={setJustDivergencia}
            ciente={cienteDivergencia}
            onCiente={setCienteDivergencia}
            mostrarErro={tentouCriar}
          />
        )}

        {!aplicado && comRodape(

          <div
            className={cn(
              "flex flex-wrap justify-end gap-2",
              rodapeFixo && !rodapeContainer &&
                "sticky bottom-0 z-10 -mx-4 -mb-4 rounded-b-lg border-t bg-card px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]",
            )}
          >
            {!cienciaJornadaOk && (
              <button
                type="button"
                className="w-full rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-left text-xs"
                onClick={() => {
                  setTentouJornada(true);
                  document.getElementById(`ficha-clt-${item.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              >
                <strong>Horário fora da CLT.</strong> Corrija o horário ou registre a ciência para criar o cadastro.
              </button>
            )}
            <ConfirmarIgnorarFichaDialog
              nome={String(dados.nome ?? item.nome_extraido ?? "esta pessoa")}
              emLote={destacarPendencias}
              disabled={ignorar.isPending}
              onConfirm={() =>
                ignorar.mutate(item, {
                  onSuccess: () => onIgnorado?.(item.id, String(dados.nome ?? item.nome_extraido ?? "Ficha sem nome")),
                  onError: (e: Error) => notifyError(e, { surface: "Pessoas 360°", action: "ignorar a ficha" }),
                })
              }
            >
              <Button variant="ghost" size="sm" disabled={ignorar.isPending}>
                {ignorar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <X className="mr-1 h-4 w-4" />} Ignorar
              </Button>
            </ConfirmarIgnorarFichaDialog>
            {preadmissaoId && (
              <Button
                variant="outline"
                size="sm"
                disabled={anexando}
                title="Guarda a ficha recebida sem criar ou alterar cadastro"
                onClick={somenteAnexarFicha}
              >
                {anexando
                  ? <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  : <FileText className="mr-1 h-4 w-4" />}
                Somente anexar a ficha
              </Button>
            )}
            {onSalvarRascunho && (
              <Button
                variant="outline"
                size="sm"
                disabled={salvandoRascunho || aplicar.isPending}
                title="Guarda o que foi preenchido nesta ficha sem criar o cadastro"
                onClick={async () => {
                  setSalvandoRascunho(true);
                  try {
                    await onSalvarRascunho(montarRascunho());
                  } catch (e) {
                    toast.error((e as Error).message);
                  } finally {
                    setSalvandoRascunho(false);
                  }
                }}
              >
                {salvandoRascunho ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                Salvar e próxima
              </Button>
            )}
            <Button
              size="sm"
              disabled={
                aplicar.isPending || preparando || !cienciaJornadaOk ||
                bloqueadoPorEmpresa || bloqueadoPorFranquia ||
                (!preadmissaoId && !!item.colaborador_existente_id && !atualizar) ||
                (!!preadmissaoId && (!stagingDados || faltaDecidir > 0))
              }
              onClick={() => {
                if (preadmissaoId) executar(null);
                else if (atualizar && item.colaborador_existente_id) setComparacao(true);
                else executar(null);
              }}
            >
              {aplicar.isPending || preparando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
              {preadmissaoId
                ? "Concluir admissão com esta ficha"
                : atualizar && item.colaborador_existente_id
                  ? "Comparar e atualizar"
                  : "Criar cadastro"}
            </Button>
          </div>
        )}

        {unidadeDialog && (
          <UnidadeFormDialog
            open={unidadeDialog}
            onOpenChange={setUnidadeDialog}
            nomeInicial={(unidadeSugerida.empregador_lido ?? "").toUpperCase()}
            inicial={{ cnpj: unidadeSugerida.cnpj_lido ?? "" }}
            onSaved={(u) => setUnidadeId(u.id)}
          />
        )}

        {cargoDialog && (
          <CargoFormDialog
            open={cargoDialog}
            onOpenChange={setCargoDialog}
            cargo={null}
            inicial={{
              nome: cargoNovoNome || String(dados.cargo_nome ?? "").toUpperCase(),
              // O CBO lido só acompanha o nome lido; nome digitado na busca começa sem CBO.
              cbo:
                !cargoNovoNome || cargoNovoNome === String(dados.cargo_nome ?? "").trim().toUpperCase()
                  ? String((dados.cbo as string) ?? "")
                  : "",
            }}
            onSaved={(c) => {
              setCargoCriado({ id: c.id, nome: c.nome });
              setCargoId(c.id);
            }}
          />
        )}

        {setorDialog && unidadeId && (
          <SetorFormDialog
            open={setorDialog}
            onOpenChange={setSetorDialog}
            unidadeId={unidadeId}
            unidadeNome={unidades.find((u) => u.id === unidadeId)?.nome}
            nomeInicial={String(dados.setor ?? "").toUpperCase()}
            onSaved={(st) => setSetorEscolhido(st.id)}
          />
        )}

        <TurnoForm
          open={turnoDialog}
          onOpenChange={setTurnoDialog}
          initial={{
            ...TURNO_FORM_DEFAULT,
            unidade_id: unidadeId ?? null,
            entrada: turnoSugerido.entrada ?? TURNO_FORM_DEFAULT.entrada,
            saida: turnoSugerido.saida ?? TURNO_FORM_DEFAULT.saida,
          }}
          unidades={unidades.map((u) => ({ id: u.id, nome: u.nome }))}
          saving={criarTurno.isPending}
          titulo="Novo Turno"
          onSubmit={({ form, ciencia }) =>
            criarTurno.mutate(
              { form, ciencia },
              {
                onSuccess: (t) => {
                  setTurnoId(t.id);
                  setTurnoDialog(false);
                  toast.success("Turno cadastrado e escolhido na ficha.");
                },
                onError: (e) => notifyError(e as Error, { surface: "Pessoas 360°", action: "cadastrar o turno da ficha" }),
              },
            )
          }
        />

        {comparacao && item.colaborador_existente_id && (
          <FichaComparacaoDialog
            open={comparacao}
            onOpenChange={setComparacao}
            colaboradorId={item.colaborador_existente_id}
            dados={dados}
            aplicando={aplicar.isPending}
            onConfirmar={(colunas) => executar(colunas)}
          />
        )}
      </CardContent>
    </Card>
  );
}


/**
 * Converte o horário escolhido na ficha em admissão (rascunho por dia) no
 * formato de jornada sugerida usado na efetivação. Devolve null quando não há
 * horário definido — aí vale o que foi lido do PDF.
 */
function rascunhoParaJornada(valor: unknown): JornadaSugerida | null {
  const r = valor as {
    horario?: { entrada?: string | null; saida?: string | null; intervalo_minutos?: number | null };
    dias?: Array<{ dow: number; trabalha?: boolean; entrada?: string | null; saida?: string | null; intervalo_minutos?: number | null }>;
  } | null | undefined;
  const entrada = normalizeHora(r?.horario?.entrada ?? null);
  const saida = normalizeHora(r?.horario?.saida ?? null);
  if (!entrada || !saida) return null;
  const intervalo = r?.horario?.intervalo_minutos ?? null;
  const dias: JornadaDia[] = (r?.dias ?? []).map((d) => ({
    dow: Number(d.dow),
    trabalha: d.trabalha === true,
    entrada: normalizeHora(d.entrada ?? null) ?? entrada,
    saida: normalizeHora(d.saida ?? null) ?? saida,
    intervalo_minutos: d.intervalo_minutos ?? intervalo,
  }));
  return {
    entrada,
    saida,
    intervalo_minutos: intervalo,
    vira_meia_noite: saida <= entrada,
    dias,
    vazia: false,
  };
}

/**
 * Horário pronto para edição à mão: sempre com os sete dias da semana, para o
 * operador corrigir o que a leitura do PDF errou ou informar horários de fichas
 * sem jornada legível.
 */
function jornadaEditavel(base: JornadaSugerida): JornadaSugerida {
  const porDow = new Map(base.dias.map((d) => [d.dow, d]));
  const dias: JornadaDia[] = Array.from({ length: 7 }, (_, dow) =>
    porDow.get(dow) ?? {
      dow,
      trabalha: !base.vazia && dow >= 1 && dow <= 5,
      entrada: base.entrada,
      saida: base.saida,
      intervalo_minutos: base.intervalo_minutos,
    },
  );
  return { ...base, dias };
}
