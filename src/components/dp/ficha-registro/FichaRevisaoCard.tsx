import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUpsertDpCargo, useUpsertDpCargoSalario } from "@/hooks/useDpCadastros";
import { useSindicatoDoCargo } from "@/hooks/useSindicatoDoCargo";
import { salvarDependente } from "@/lib/dp/regras-oficial";
import {
  dependentesDaFicha, inferirFormaPagamento, inferirRegime, LIMITE_PONTO_OBRIGATORIO, salarioDaFicha,
} from "@/lib/dp/ficha-registro/inferencia";
import { Link } from "react-router-dom";
import {
  AlertTriangle, Check, ChevronDown, ChevronUp, FileText, Loader2, Plus, UserCheck, UserCog, X,
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
import { formatCnpj, matchUnidade } from "@/lib/dp/ficha-registro/unidade-match";
import { CONFIANCA_LABEL, nivelDoCampo, trechoDoTexto, type NivelConfianca } from "@/lib/dp/ficha-registro/confianca";
import { montarPayloadFicha } from "@/lib/dp/ficha-registro/payload";
import { camposFaltando, resumoFaltando } from "@/lib/dp/cadastro-completude";
import { useDpSalarioCargoResolver } from "@/hooks/useDpSalarioCargoResolver";
import { CargoCorrespondenciaDialog } from "./CargoCorrespondenciaDialog";
import { UnidadeCorrespondenciaDialog } from "./UnidadeCorrespondenciaDialog";
import { FichaComparacaoDialog } from "./FichaComparacaoDialog";
import { FichaHistoricoLido } from "./FichaHistoricoLido";
import {
  jornadaDaFicha, useAplicarFicha, useIgnorarFicha, type FichaItem,
} from "@/hooks/useDpFichaImportacao";
import {
  normalizeHora, type JornadaDia, type JornadaSugerida,
} from "@/lib/dp/ficha-registro/jornada-parse";
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
}

export function FichaRevisaoCard({
  item, cargos, unidades, setores = [], turnos = [], unidadePadraoId, empresaCnpj,
  setorPadraoId = null, regimePadrao = null, onAbrirCadastro, preadmissaoId = null,
  pessoaApoioId = null, posicao, total, emFoco = false, onConcluido,
}: Props) {
  const extraidos = (item.dados_extraidos ?? {}) as Record<string, unknown>;
  const confianca = (item.confianca_campos ?? {}) as Record<string, string>;

  const [dados, setDados] = useState<Record<string, unknown>>(() => ({ ...extraidos }));
  const cargoSugerido = useMemo(
    () => matchCargo({ cargo_nome: (dados.cargo_nome as string) ?? null, cbo: (dados.cbo as string) ?? null }, cargos),
    [dados.cargo_nome, dados.cbo, cargos],
  );
  const unidadeSugerida = useMemo(() => matchUnidade(dados, unidades, empresaCnpj), [dados, unidades, empresaCnpj]);
  /**
   * Só o nome parecido preenche sozinho. CBO igual com nome diferente (ex.:
   * CUMIM × GARÇONETE) fica como sugestão: o gestor confirma ou cria o cargo.
   */
  const cargoAutomatico =
    cargoSugerido.motivo === "cbo_e_nome" || cargoSugerido.motivo === "nome" ? cargoSugerido.cargo_id : null;
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
  const [setorEscolhido, setSetorEscolhido] = useState<string | null>(null);
  const [regimeEscolhido, setRegimeEscolhido] = useState<string | null>(null);
  const [regimeEscolhidoManual, setRegimeEscolhidoManual] = useState(false);
  const setorId = setorEscolhido ?? setorPadraoId ?? null;
  const regime = regimeEscolhido ?? regimePadrao ?? null;
  const [completarAberto, setCompletarAberto] = useState(false);
  const [usarJornada, setUsarJornada] = useState(true);
  const [atualizar, setAtualizar] = useState(!!item.colaborador_existente_id);
  const [anexarFicha, setAnexarFicha] = useState(true);
  const [formaPagamento, setFormaPagamento] = useState<string | null>(null);
  const [possuiFolhaPonto, setPossuiFolhaPonto] = useState<boolean | null>(null);
  const [optanteAdiantamento, setOptanteAdiantamento] = useState<boolean | null>(null);
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
  const [unidadeDialog, setUnidadeDialog] = useState(false);
  const [comparacao, setComparacao] = useState(false);
  const [confirmouEmpresa, setConfirmouEmpresa] = useState(false);
  const [whatsappEditado, setWhatsappEditado] = useState(false);
  const empresaDivergente = unidadeSugerida.empresaConfere === "nao";
  const bloqueadoPorEmpresa = empresaDivergente && !confirmouEmpresa;

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
  const [turnoId, setTurnoId] = useState<string | null>(null);
  const turnoEscolhido = turnoId ?? turnoSugerido.turno_id;

  /** Sugestões lidas da ficha: o gestor só confere. Escolha manual prevalece. */
  const regimeInferido = useMemo(() => inferirRegime(dados), [dados]);
  const formaInferida = useMemo(() => inferirFormaPagamento(dados, jornada), [dados, jornada]);
  useEffect(() => {
    if (!regimeEscolhido && !regimePadrao && regimeInferido) setRegimeEscolhido(regimeInferido);
  }, [regimeInferido, regimeEscolhido, regimePadrao]);
  useEffect(() => {
    if (!formaPagamento && formaInferida) setFormaPagamento(formaInferida);
  }, [formaInferida, formaPagamento]);

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
  const [justificativaPonto, setJustificativaPonto] = useState("");
  useEffect(() => {
    if (!unidadeId) return;
    if (!unidadeTemPonto) setPossuiFolhaPonto(false);
    else if (possuiFolhaPonto === null && pontoObrigatorio) setPossuiFolhaPonto(true);
  }, [unidadeId, unidadeTemPonto, pontoObrigatorio, possuiFolhaPonto]);

  const salarioFicha = useMemo(() => salarioDaFicha(dados), [dados]);
  const dependentesLidos = useMemo(() => dependentesDaFicha(dados), [dados]);
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
    if (escolhasPendentes.length > 0) {
      setCompletarAberto(true);
      setTentouCriar(true);
      toast.error(mensagemEscolhasObrigatorias(escolhasPendentes));
      return;
    }
    if (pontoObrigatorio && possuiFolhaPonto === false && justificativaPonto.trim().length < 10) {
      setCompletarAberto(true);
      setTentouCriar(true);
      toast.error("A unidade tem mais de 20 pessoas: o ponto é obrigatório (Art. 74 da CLT). Justifique a dispensa (ex.: cargo de confiança, Art. 62).");
      return;
    }
    let cargoFinal = cargoId;
    if (automatizarCargo && !preadmissaoId) {
      setPreparando(true);
      try {
        const nomeCargo = String(dados.cargo_nome ?? "").trim().toUpperCase();
        if (!cargoFinal && !cargoPorCbo && nomeCargo) {
          const novo = await upsertCargo.mutateAsync({ nome: nomeCargo, cbo: String(dados.cbo ?? "").trim() || null });
          cargoFinal = (novo as { id: string }).id;
          setCargoIdState(cargoFinal);
          setCargoTocado(true);
        }
        const mensal = (formaPagamento ?? formaInferida) === "mensalista";
        if (cargoFinal && unidadeId && salarioFicha && mensal && !salarioCargoDe(cargoFinal, unidadeId)) {
          await upsertPiso.mutateAsync({
            cargo_id: cargoFinal,
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

  const executarInterno = (camposPermitidos: string[] | null, cargoAuto: string | null) => {
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
    const dadosEnvio = pontoObrigatorio && possuiFolhaPonto === false
      ? { ...dadosBase, folha_ponto_dispensa_justificativa: justificativaPonto.trim() }
      : dadosBase;
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
        preadmissaoId,
      },
      {
        onSuccess: async (res) => {
          setComparacao(false);
          // Familiares da ficha viram dependentes (filhos, enteados, tutelados, cônjuge).
          const colabId = (res as { colaboradorId?: string } | undefined)?.colaboradorId;
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
                  cpf: dep.cpf, deficiencia: false, conta_irrf: true, conta_salario_familia: dep.parentesco !== "conjuge",
                  observacao: "Importado da Ficha de Registro.",
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
          onConcluido?.(item.id, String(dados.nome ?? item.nome_extraido ?? "Colaborador"));
        },
        onError: (e: Error) => notifyError(e, { surface: "Pessoas 360°", action: "concluir a ação" }),
      },
    );
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
      <Card className="opacity-60">
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <span className="text-sm">{item.nome_extraido ?? "Ficha sem nome"}</span>
          <Badge variant="outline">Ignorada</Badge>
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

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {campo("Nome", "nome")}
          {campo("CPF", "cpf")}
          {campo("Matrícula", "matricula")}
          {campo("Nascimento", "data_nascimento", "date")}
          {campo("Admissão", "data_admissao", "date")}
          {campo("Salário", "salario")}
          {campo("Telefone", "telefone")}
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
          {campo("Cargo na ficha", "cargo_nome")}
        </div>

        {!aplicado && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1" id={`ficha-cargo-${item.id}`}>
              <Label className="text-xs">Cargo cadastrado *</Label>
              <Select value={cargoId ?? undefined} onValueChange={(v) => setCargoId(v)}>
                <SelectTrigger className={cn("h-9", realce(!cargoId))}>
                  <SelectValue placeholder="Escolha o cargo" />
                </SelectTrigger>
                <SelectContent>
                  {cargos.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                    <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => setCargoDialog(true)}>
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
                  <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => setCargoDialog(true)}>
                    <Plus className="mr-1 h-3 w-3" /> Criar este cargo
                  </Button>
                </div>
              )}
              {!preadmissaoId && salarioFicha && (
                <label className="flex items-start gap-2 text-[11px] text-muted-foreground">
                  <Switch checked={automatizarCargo} onCheckedChange={setAutomatizarCargo} className="mt-0.5 scale-75" />
                  <span>
                    Usar o salário da ficha (R$ {salarioFicha.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}) como padrão do cargo
                    {patronalUnidade ? ` na convenção ${patronalUnidade.nome}` : " nesta unidade"} quando ainda não houver salário cadastrado.
                  </span>
                </label>
              )}
              {cargoId && (
                <button
                  type="button"
                  className="text-[11px] text-muted-foreground underline underline-offset-2"
                  onClick={() => setCargoDialog(true)}
                >
                  Cadastrar outro cargo
                </button>
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
              {!unidadeSugerida.unidade_id && (!!unidadeSugerida.cnpj_lido || !!unidadeSugerida.empregador_lido) && (
                <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => setUnidadeDialog(true)}>
                  <Plus className="mr-1 h-3 w-3" /> Criar unidade com os dados da ficha
                </Button>
              )}
            </div>

          </div>
        )}

        {!aplicado && (
          <div className="rounded-lg border bg-muted/20">
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
                  {setores.length > 0 && (
                    <div className="space-y-1">
                      <Label className="text-xs">Setor</Label>
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
                    {pontoObrigatorio && possuiFolhaPonto === false && (
                      <div className="space-y-1 rounded-md bg-amber-500/10 p-2">
                        <p className="text-[11px] text-amber-700 dark:text-amber-400">
                          A unidade tem mais de 20 pessoas e o ponto é obrigatório por lei. Só dispense em exceção legal (ex.: cargo de confiança, Art. 62 da CLT).
                        </p>
                        <Input
                          value={justificativaPonto}
                          onChange={(e) => setJustificativaPonto(e.target.value)}
                          placeholder="Justificativa da dispensa *"
                          className={cn("h-8 text-xs", realce(justificativaPonto.trim().length < 10))}
                        />
                      </div>
                    )}
                    {unidades.find((u) => u.id === unidadeId)?.possui_relogio_ponto && possuiFolhaPonto === null && (
                      <p className="text-[11px] text-muted-foreground">Sugestão: ativa, pois a unidade possui relógio de ponto.</p>
                    )}
                  </div>

                  {dependentesLidos.length > 0 && !preadmissaoId && (
                    <div className="space-y-1 sm:col-span-2 rounded-md border p-2">
                      <label className="flex items-center gap-2 text-xs font-medium">
                        <Switch checked={importarDependentes} onCheckedChange={setImportarDependentes} className="scale-75" />
                        Cadastrar {dependentesLidos.length} dependente(s) lido(s) na ficha
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
                    {tentouCriar && optanteAdiantamento === null && (
                      <p className="text-[11px] text-destructive">Informe se recebe adiantamento.</p>
                    )}
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
          <div className="rounded-lg border bg-muted/30 p-3">
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
            {jornadaEditada && !jornadaLida.vazia && (
              <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
                <strong>Horário Diferente da Ficha.</strong> A ficha registra
                {typeof dados.jornada_texto === "string" && dados.jornada_texto ? ` "${dados.jornada_texto}"` : " outro horário"}.
                O cadastro usará o horário ajustado aqui. Peça à contabilidade para atualizar a ficha de registro.
              </div>
            )}

            {!aplicado && usarJornada && (
              <div className="mt-3 space-y-1">
                <Label className="text-xs">Turno correspondente</Label>
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

        {!aplicado && faltando.length > 0 && (() => {
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

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={ignorar.isPending}
              onClick={() => ignorar.mutate(item, { onError: (e: Error) => notifyError(e, { surface: "Pessoas 360°", action: "concluir a ação" }) })}
            >
              <X className="mr-1 h-4 w-4" /> Ignorar
            </Button>
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
            <Button
              size="sm"
              disabled={
                aplicar.isPending || preparando ||
                bloqueadoPorEmpresa ||
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
          <UnidadeCorrespondenciaDialog
            open={unidadeDialog}
            onOpenChange={setUnidadeDialog}
            nome={unidadeSugerida.empregador_lido ?? ""}
            cnpj={unidadeSugerida.cnpj_lido}
            onCriada={(id) => setUnidadeId(id)}
          />
        )}

        {cargoDialog && (
          <CargoCorrespondenciaDialog
            open={cargoDialog}
            onOpenChange={setCargoDialog}
            cargoNome={String(dados.cargo_nome ?? "")}
            cbo={(dados.cbo as string) ?? null}
            unidadeId={unidadeId}
            unidadeNome={unidades.find((u) => u.id === unidadeId)?.nome ?? null}
            onCriado={(id) => setCargoId(id)}
          />
        )}

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
