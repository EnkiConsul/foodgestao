import { useState, useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { regimeRisco } from "@/lib/dp/regime-riscos";
import { RegimeRiscoDialog } from "@/components/dp/RegimeRiscoDialog";
import { toProperName } from "@/lib/text/properName";

import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ColaboradorDocumentosPanel } from "@/components/dp/documentos/ColaboradorDocumentosPanel";
import { DependentesPanel } from "@/components/dp/DependentesPanel";
import { AdicionalTempoServicoCard } from "@/components/dp/AdicionalTempoServicoCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useUpsertDpColaborador, useDpColaboradores, type DpColaborador } from "@/hooks/useDpColaboradores";
import { divergenciasIsonomia, DIAS_BASE_PADRAO, type DivergenciaIsonomia } from "@/lib/dp/beneficios-regras";
import { snapshotColegaBeneficios } from "@/lib/dp/isonomia-snapshot";
import { itensIsonomiaDoCadastro } from "@/hooks/useDpIsonomiaBeneficios";
import { BeneficioDispensaDialog, type DispensaBeneficio, type MotivoIsonomiaEscolhido } from "@/components/dp/BeneficioDispensaDialog";
import { useDpUnidades, useDpCargos, useUpsertDpCargo, usePropagarRiscosCargo, useDpCargoSalarios, useUpsertDpCargoSalario, useDpPatronalPorUnidade, useDpSindicatos, type DpCargo } from "@/hooks/useDpCadastros";
import { salarioCargoNaUnidade, mensagemErroPiso, rotuloSalarioCargo, agruparPisosPorCargo } from "@/lib/dp/cargoSalarios";

import { useDpBeneficios } from "@/hooks/useDpBeneficios";
import { Textarea } from "@/components/ui/textarea";
import { maskCpf, isValidCpf } from "@/lib/cpf";
import { MOTIVO_DESLIGAMENTO_OPTIONS, ELEGIBILIDADE_OPTIONS } from "@/lib/dp/desligamento";
import type { Database } from "@/integrations/supabase/types";
import { contratoPolicy } from "@/lib/dp/contrato-policy";
import { percentualAdicionalVigente } from "@/lib/dp/adicionais-risco";
import { ColaboradorDesligamentoPanel } from "./ColaboradorDesligamentoPanel";
import { ColaboradorAcessoPanel } from "./ColaboradorAcessoPanel";
import { Trash2 } from "lucide-react";
import { DIA_PAGAMENTO_PADRAO, DIAS_CORTE_PADRAO, REGRAS_DESCONTO_PADRAO } from "@/lib/dp/va-calculo";

import { useDeleteDpColaborador } from "@/hooks/useDpColaboradores";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpRegrasColaborador } from "@/hooks/useDpRegrasColaborador";

import { useDpColaboradorConfigTrabalho } from "@/hooks/useDpColaboradorConfigTrabalho";
import { CienciaLegalDialog } from "@/components/dp/CienciaLegalDialog";
import { PadraoDivergenciaAviso } from "@/components/dp/PadraoDivergenciaAviso";
import { ColaboradorJornadaPanel, type SalvarJornadaResultado } from "@/components/dp/ColaboradorJornadaPanel";
import { CargoQuickCreateDialog } from "@/components/dp/CargoQuickCreateDialog";
import { SindicatoEnquadramentoField } from "@/components/dp/SindicatoEnquadramentoField";
import { UnidadeAdiantamentoDialog } from "@/components/dp/UnidadeAdiantamentoDialog";

import { CargoSalarioConflitoDialog } from "@/components/dp/CargoSalarioConflitoDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { compararSalarioCargo, moedaBR, salarioReferencia, sugerirNomeVariacao } from "@/lib/dp/cargos";
import {
  RemuneracaoFields,
  remuneracaoBlank,
  numeroBR,
  type RemuneracaoFormState,
} from "@/components/dp/RemuneracaoFields";
import {
  formaPagamentoPadrao,
  ajustarFormaPagamento,
  remuneracaoPendente,
  permiteAdiantamento as permiteAdiantamentoRemuneracao,
  BASE_HORAS_MES_PADRAO,
  BASE_DIAS_MES_PADRAO,
  type FormaPagamento,
  type AssiduidadeCriterio,
} from "@/lib/dp/remuneracao";
import {
  useDpBeneficiosPadroes, useSalvarDpBeneficiosPadrao,
} from "@/hooks/useDpBeneficiosPadrao";
import {
  aplicarPadrao, assinaturaPadrao, diferencasPadrao, divergenciasColaboradorVsPadrao,
  extrairPadrao, nivelPadrao, idsAlvoPadrao,
  padraoTemConteudo, padroesIguaisAlgum, resolverPadrao,
  GRUPOS_PADRAO, ROTULOS_GRUPO, gruposComDiferenca, resumoGrupo,
  gruposDivergentesClassificados, gruposAlteracao, quemPerdeBeneficio,
  type GrupoPadrao, type PadraoAlcance, type PadraoEscopo,
} from "@/lib/dp/beneficiosPadrao";
import { compararRiscoCargo, textoRisco, type DivergenciaRisco } from "@/lib/dp/cargos";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";






type Regime = Database["public"]["Enums"]["dp_regime_trabalho"];

// Rótulos do vínculo exibidos no cadastro. O comportamento legal vem sempre do
// regime (VINCULO_TO_REGIME); o rótulo escolhido é guardado em `vinculo_label`
// para que Sócio/PJ voltem corretamente na edição.
const TIPOS_VINCULO: { value: string; label: string }[] = [
  { value: "CLT", label: "CLT efetivo" },
  { value: "Intermitente", label: "CLT intermitente" },
  { value: "Estagiario", label: "Estagiário" },
  { value: "Temporario", label: "Temporário" },
  { value: "PJ", label: "PJ" },
  { value: "Socio", label: "Sócio" },
  { value: "Freelancer", label: "Freelancer (sem registro)" },
];

/** Traduz o erro do backend para uma mensagem sempre visível ao usuário. */
function mensagemErro(e: unknown): string {
  const any = e as any;
  const bruto: string =
    (typeof any?.message === "string" && any.message) ||
    (typeof any?.details === "string" && any.details) ||
    (typeof any?.hint === "string" && any.hint) ||
    (typeof e === "string" ? e : "") ||
    "Não foi possível concluir a gravação. Tente novamente.";
  if (bruto.includes("data de demissão")) {
    return "Este colaborador está inativo sem data de demissão. Informe a data da demissão na aba Dados ou reintegre o colaborador.";
  }
  return bruto;
}


// (Dropdown "Regime de Trabalho" removido: duplicava o Tipo de Vínculo e não era persistido.
//  O regime do banco é derivado de tipo_vinculo via VINCULO_TO_REGIME abaixo.)

// Map UI "Tipo de Vínculo" (rótulos da documentação) para enum do banco (dp_regime_trabalho)
const VINCULO_TO_REGIME: Record<string, Regime> = {
  CLT: "clt",
  Intermitente: "intermitente",
  Socio: "pj",
  Estagiario: "estagio",
  PJ: "pj",
  Temporario: "temporario",
  Freelancer: "freelancer",
};

// Mapa reverso: o banco guarda apenas `regime`, então na edição resolvemos o
// rótulo canônico do vínculo a partir dele (Sócio/PJ/Autônomo compartilham `pj`).
const REGIME_TO_VINCULO: Record<string, string> = {
  clt: "CLT",
  intermitente: "Intermitente",
  estagio: "Estagiario",
  temporario: "Temporario",
  pj: "PJ",
  mei: "PJ",
  freelancer: "Freelancer",
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  colaborador?: DpColaborador | null;
  /** Aba aberta ao exibir o diálogo (ex.: acesso ao portal ou desligamento). */
  abaInicial?: AbaVisivel;
}

const NONE_DESLIG = "__none__";

const blank = {
  nome: "",
  cpf: "",
  matricula: "",
  email: "",
  whatsapp: "",
  cargo_id: "",
  unidade_id: "",
  sindicato_id: "",

  data_admissao: "",
  data_nascimento: "",
  data_desligamento: "",
  motivo_desligamento: NONE_DESLIG,
  elegivel_recontratacao: NONE_DESLIG,
  observacao_desligamento: "",
  tipo_vinculo: "CLT",
  folga_fixa_semana: "none",
  perfil_acesso: "colaborador" as "colaborador" | "gestor" | "admin",
  ativo: true,
  possui_folha_ponto: false,
  optante_adiantamento: false,
};

/** Abas do cadastro, na ordem em que o usuário avança. */
const ABAS = ["dados", "jornada", "remuneracao", "dependentes", "documentos"] as const;
type AbaCadastro = (typeof ABAS)[number];
/** Atalhos externos que caem em abas já existentes. */
type AbaVisivel = AbaCadastro | "desligamento" | "acesso";
type IntencaoSalvar = "stay" | "close";
/** Campo pendente apontado pela validação, usado para focar e destacar. */
type ErroCampo = { campo: string; mensagem: string };


const abaSeguinte = (aba: AbaVisivel): AbaCadastro | null =>
  ABAS[ABAS.indexOf(aba as AbaCadastro) + 1] ?? null;




export function ColaboradorFormDialog({ open, onOpenChange, colaborador, abaInicial = "dados" }: Props) {
  const upsert = useUpsertDpColaborador();
  const unidades = useDpUnidades();
  const cargos = useDpCargos();
  const upsertCargo = useUpsertDpCargo();
  const upsertCargoSalario = useUpsertDpCargoSalario();
  const removerColaborador = useDeleteDpColaborador();
  const [confirmarRemocao, setConfirmarRemocao] = useState(false);
  const queryClient = useQueryClient();

  const { beneficios, atribuicoes, saveAtribuicao } = useDpBeneficios();
  const [form, setForm] = useState(blank);
  const { selectedCompanyId, companies } = useCompanyContext();
  const todosColaboradores = useDpColaboradores();
  /** Benefícios retirados que exigem ciência de isonomia neste salvamento. */
  const [dispensas, setDispensas] = useState<DispensaBeneficio[]>([]);
  const isonomiaConfirmada = useRef(false);
  /** Motivo objetivo registrado ao aceitar a diferença de benefícios. */
  const motivoIsonomia = useRef<MotivoIsonomiaEscolhido | null>(null);
  const [cienciaAberta, setCienciaAberta] = useState(false);
  const [tab, setTab] = useState<AbaVisivel>("dados");
  /** Intenção do botão acionado: continuar na tela, avançar de aba ou sair. */
  const intencaoRef = useRef<IntencaoSalvar>("stay");
  /** Marco do último estado gravado — base para detectar alterações pendentes. */
  const [baseline, setBaseline] = useState<string | null>(null);
  /** Muda a cada carregamento do colaborador para renovar o marco acima. */
  const [resetKey, setResetKey] = useState(0);
  const [confirmarSaida, setConfirmarSaida] = useState(false);
  /** Campo pendente sinalizado no formulário (foco + destaque). */
  const [campoErro, setCampoErro] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  /** Id do colaborador recém-criado — permite salvar a jornada sem sair do cadastro. */
  const [criadoId, setCriadoId] = useState<string | null>(null);
  /** Registro salvo do colaborador em edição — base das abas Acesso e Desligamento. */
  const colaboradorAtual = useMemo(() => {
    const id = colaborador?.id ?? criadoId;
    if (!id) return null;
    return (todosColaboradores.data ?? []).find((c) => c.id === id) ?? colaborador ?? null;
  }, [colaborador, criadoId, todosColaboradores.data]);
  /** Salvamento do horário de trabalho exposto pelo painel da aba. */
  const jornadaSalvarRef = useRef<(() => Promise<SalvarJornadaResultado>) | null>(null);

  /**
   * Dias da semana da configuração vigente — usados para calcular os dias do
   * mês do vale-alimentação diário (fonte única: aba Horário de Trabalho).
   */
  const configTrabalho = useDpColaboradorConfigTrabalho(colaborador?.id ?? criadoId);
  const diasJornada = useMemo(() => {
    const vigente = configTrabalho.vigente ?? configTrabalho.configs[0] ?? null;
    return (vigente?.dias ?? []).map((d) => ({ dow: d.dow, trabalha: d.trabalha }));
  }, [configTrabalho.vigente, configTrabalho.configs]);

  /**
   * Folgas de fim de semana por mês da regra de DSR vigente (exceção da unidade
   * → padrão da empresa) — entram na simulação do vale-alimentação diário.
   */
  const regrasDsr = useDpRegrasColaborador(selectedCompanyId, form.unidade_id || null);
  const folgasFimDeSemanaMes = regrasDsr.config.folgas_fds_por_mes;


  /** Criação de cargo sem sair do cadastro. */
  const [novoCargoOpen, setNovoCargoOpen] = useState(false);
  const [novaUnidadeOpen, setNovaUnidadeOpen] = useState(false);

  /** Conflito entre o salário informado e o salário de referência do cargo. */
  const [conflitoCargo, setConflitoCargo] = useState<
    { salarioCargo: number; salarioInformado: number } | null
  >(null);
  /** Regras de cargo/salário já resolvidas para este salvamento. */
  const cargoResolvido = useRef(false);
  // Ciência do risco jurídico do vínculo sem registro, válida para este salvamento.
  const cienciaConfirmada = useRef<{ justificativa: string } | null>(null);


  const isEdit = !!colaborador?.id;
  // Inativo sem data de demissão também conta como desligado: o banco exige a data.
  const isDesligado = isEdit && (!!colaborador?.data_desligamento || colaborador?.ativo === false);
  // Comportamento da jornada/folga é derivado do contrato, nunca testado inline.
  const policy = contratoPolicy(VINCULO_TO_REGIME[form.tipo_vinculo]);


  const [rem, setRem] = useState<RemuneracaoFormState>(remuneracaoBlank);
  /** Cargo ainda sem salário de referência — decisão feita dentro do sistema. */
  const [cargoSemSalario, setCargoSemSalario] = useState<{ salarioInformado: number } | null>(null);
  const [salvandoPiso, setSalvandoPiso] = useState(false);
  const [adiantamentoOpen, setAdiantamentoOpen] = useState(false);
  const patchRem = (patch: Partial<RemuneracaoFormState>) => setRem((r) => ({ ...r, ...patch }));

  /**
   * Padrão de benefícios da unidade: o primeiro cadastro define e os próximos
   * já nascem preenchidos. Nada é aplicado sobre colaborador já existente.
   */
  const padroesBeneficios = useDpBeneficiosPadroes();
  const salvarPadraoBeneficios = useSalvarDpBeneficiosPadrao();
  const padraoAplicavel = useMemo(
    () => resolverPadrao(padroesBeneficios.data, form.unidade_id || null, form.cargo_id || null),
    [padroesBeneficios.data, form.unidade_id, form.cargo_id],
  );
  /** Escopo cujo padrão já foi aplicado neste cadastro (evita sobrescrever edições). */
  const padraoAplicadoRef = useRef<string | null>(null);
  const [padraoAplicado, setPadraoAplicado] = useState<PadraoEscopo | null>(null);
  /** Pergunta "usar como padrão?" pendente após gravar. */
  const [perguntarPadrao, setPerguntarPadrao] = useState(false);
  /** Pergunta "risco é do cargo ou só desta pessoa?" pendente após gravar. */
  const [perguntarRisco, setPerguntarRisco] = useState(false);
  const riscoRespondidoRef = useRef<Set<string>>(new Set());
  const propagarRiscos = usePropagarRiscosCargo();
  const [escopoPadrao, setEscopoPadrao] = useState<PadraoEscopo>("unidade");
  /** Alcance: só os próximos cadastros ou também quem já está cadastrado. */
  const [alcancePadrao, setAlcancePadrao] = useState<PadraoAlcance>("novos");
  /** Ids escolhidos na mão quando o alcance é "selecionados". */
  const [selecionadosPadrao, setSelecionadosPadrao] = useState<string[]>([]);
  const [buscaSelecao, setBuscaSelecao] = useState("");
  /** Quais grupos de regras o usuário quer replicar neste padrão. */
  const [gruposPadrao, setGruposPadrao] = useState<GrupoPadrao[]>([...GRUPOS_PADRAO]);

  /** Quantos colaboradores ativos seriam atualizados no alcance escolhido. */
  const colaboradoresNoAlcance = useMemo(() => {
    if (escopoPadrao === "colaborador") return 0;
    return (todosColaboradores.data ?? []).filter((c) => {
      if (!c.ativo || c.data_desligamento) return false;
      if (c.id === colaborador?.id) return false;
      if (escopoPadrao !== "empresa" && c.unidade_id !== form.unidade_id) return false;
      if (escopoPadrao === "cargo" && c.cargo_id !== (form.cargo_id || null)) return false;
      return true;
    }).length;
  }, [todosColaboradores.data, escopoPadrao, form.unidade_id, form.cargo_id, colaborador?.id]);

  /**
   * Quantos desses colaboradores estão fora dos valores desta tela. Se existe
   * alguém divergente, "todos" é o alcance que o usuário quase sempre quer.
   */
  const divergentesNoAlcance = useMemo(() => {
    if (escopoPadrao === "colaborador") return 0;
    const payload = extrairPadrao(rem);
    return (todosColaboradores.data ?? []).filter((c) => {
      if (!c.ativo || c.data_desligamento) return false;
      if (c.id === colaborador?.id) return false;
      if (escopoPadrao !== "empresa" && c.unidade_id !== form.unidade_id) return false;
      if (escopoPadrao === "cargo" && c.cargo_id !== (form.cargo_id || null)) return false;
      return divergenciasColaboradorVsPadrao(
        c as unknown as Record<string, unknown>,
        payload,
        gruposPadrao,
      ).length > 0;
    }).length;
  }, [todosColaboradores.data, escopoPadrao, form.unidade_id, form.cargo_id, colaborador?.id, rem, gruposPadrao]);

  /** Grupos que divergem do padrão de referência aplicável. */
  const gruposDiferentes = useMemo(
    () => gruposComDiferenca(extrairPadrao(rem), padraoAplicavel?.payload),
    [rem, padraoAplicavel],
  );

  /**
   * Divergências classificadas: "alteracao" (valores/regras com o benefício
   * ligado) pode virar padrão; "desligamento" é exceção individual e só entra
   * no padrão se o usuário marcar de propósito.
   */
  const divergenciasClassificadas = useMemo(
    () => gruposDivergentesClassificados(extrairPadrao(rem), padraoAplicavel?.payload),
    [rem, padraoAplicavel],
  );
  const tipoDivergencia = (grupo: GrupoPadrao) =>
    divergenciasClassificadas.find((d) => d.grupo === grupo)?.tipo ?? "alteracao";

  /** Colaboradores ativos do alcance escolhido (usado nos avisos de impacto). */
  const colaboradoresDoAlcance = useMemo(() => {
    if (escopoPadrao === "colaborador") return [];
    return (todosColaboradores.data ?? []).filter((c: any) => {
      if (!c.ativo || c.data_desligamento) return false;
      if (c.id === colaborador?.id) return false;
      if (escopoPadrao !== "empresa" && c.unidade_id !== form.unidade_id) return false;
      if (escopoPadrao === "cargo" && c.cargo_id !== (form.cargo_id || null)) return false;
      return true;
    }) as unknown as Record<string, unknown>[];
  }, [todosColaboradores.data, escopoPadrao, form.unidade_id, form.cargo_id, colaborador?.id]);

  /** Ids do alcance que hoje divergem dos grupos marcados — base da pré-seleção. */
  const idsDivergentesNoAlcance = useMemo(() => {
    const payload = extrairPadrao(rem);
    return colaboradoresDoAlcance
      .filter(
        (c) => divergenciasColaboradorVsPadrao(c, payload, gruposPadrao).length > 0,
      )
      .map((c) => String(c.id));
  }, [colaboradoresDoAlcance, rem, gruposPadrao]);

  /** Colaboradores do alcance filtrados pela busca da lista de seleção. */
  const colaboradoresSelecionaveis = useMemo(() => {
    const termo = buscaSelecao.trim().toLowerCase();
    if (!termo) return colaboradoresDoAlcance;
    return colaboradoresDoAlcance.filter((c) =>
      String(c.nome ?? "").toLowerCase().includes(termo),
    );
  }, [colaboradoresDoAlcance, buscaSelecao]);

  /** Selecionados efetivos: sempre dentro do alcance atual. */
  const idsSelecionadosValidos = useMemo(
    () => idsAlvoPadrao(colaboradoresDoAlcance.map((c) => String(c.id)), "selecionados", selecionadosPadrao),
    [colaboradoresDoAlcance, selecionadosPadrao],
  );

  const alternarSelecionado = (id: string, marcado: boolean) =>
    setSelecionadosPadrao((atual) =>
      marcado ? Array.from(new Set([...atual, id])) : atual.filter((x) => x !== id),
    );

  /** Aviso de divergência do cadastro já existente em relação ao padrão vigente. */
  const [avisoPadraoDispensado, setAvisoPadraoDispensado] = useState(false);
  const diferencasDoPadrao = useMemo(() => {
    if (!isEdit || !colaborador || avisoPadraoDispensado) return [];
    return divergenciasColaboradorVsPadrao(
      colaborador as unknown as Record<string, unknown>,
      padraoAplicavel?.payload,
    );
  }, [isEdit, colaborador, padraoAplicavel, avisoPadraoDispensado]);
  const origemPadrao = () => {
    const nivel = nivelPadrao(padraoAplicavel);
    if (nivel === "cargo") {
      return `de ${cargoSelecionado?.nome ?? "cargo"} em ${unidadeSelecionada?.nome ?? "unidade"}`;
    }
    if (nivel === "unidade") return `de ${unidadeSelecionada?.nome ?? "unidade"}`;
    return "da empresa";
  };



  const rotulosGruposSelecionados = useMemo(
    () =>
      GRUPOS_PADRAO.filter((g) => gruposPadrao.includes(g))
        .map((g) => ROTULOS_GRUPO[g].toLowerCase())
        .join(", ") || "nenhum item",
    [gruposPadrao],
  );

  /** Assinaturas de benefícios já decididas nesta abertura da ficha. */
  const padraoRespondidoRef = useRef<Set<string>>(new Set());
  const naoPerguntarKey = `dp:beneficios-padrao:nao-perguntar:${selectedCompanyId ?? "sem-empresa"}`;

  useEffect(() => {
    if (!open) {
      padraoAplicadoRef.current = null;
      padraoRespondidoRef.current = new Set();
      riscoRespondidoRef.current = new Set();
      setPadraoAplicado(null);
      setAvisoPadraoDispensado(false);
      return;
    }

    if (isEdit) return;
    const unidade = form.unidade_id || null;
    if (!unidade) return;
    const chave = `${unidade}:${form.cargo_id || ""}`;
    if (padraoAplicadoRef.current === chave) return;
    const padrao = resolverPadrao(padroesBeneficios.data, unidade, form.cargo_id || null);
    padraoAplicadoRef.current = chave;
    if (!padrao || !padraoTemConteudo(padrao.payload)) { setPadraoAplicado(null); return; }
    setRem((r) => aplicarPadrao(r, padrao.payload));
    setPadraoAplicado(nivelPadrao(padrao));
  }, [open, form.unidade_id, form.cargo_id, padroesBeneficios.data]);


  useEffect(() => {
    if (!open) return;
    cienciaConfirmada.current = null;
    // Acesso e desligamento agora vivem na aba Dados: o atalho abre Dados e
    // rola até a âncora do bloco correspondente.
    const ancora = abaInicial === "acesso" ? "acesso-portal" : abaInicial === "desligamento" ? "desligamento" : null;
    setTab(ancora ? "dados" : (abaInicial as AbaVisivel));
    if (ancora) {
      window.setTimeout(() => {
        contentRef.current
          ?.querySelector<HTMLElement>(`#${ancora}`)
          ?.scrollIntoView({ block: "start", behavior: "smooth" });
      }, 250);
    }
    setCriadoId(null);

    const c = (colaborador ?? {}) as any;
    const regime = c.regime ? String(c.regime) : "clt";
    setRem({
      ...remuneracaoBlank,
      // Dados legados incompatíveis (ex.: intermitente mensalista) são ajustados
      // para a primeira forma admitida pelo contrato.
      forma_pagamento: ajustarFormaPagamento(
        regime,
        c.forma_pagamento ?? formaPagamentoPadrao(regime),
      ) as FormaPagamento,
      salario_base: c.salario_base != null ? String(c.salario_base).replace(".", ",") : "",
      valor_hora: c.valor_hora != null ? String(c.valor_hora).replace(".", ",") : "",
      dependentes_irrf: String(c.dependentes_irrf ?? 0),
      adicional_percentual: String(c.adicional_percentual ?? 0).replace(".", ","),
      insalubridade_percentual: String((c as any).insalubridade_percentual ?? 0).replace(".", ","),
      periculosidade_percentual: String((c as any).periculosidade_percentual ?? 0).replace(".", ","),
      vale_transporte: !!c.vale_transporte,
      vale_transporte_valor_dia:
        c.vale_transporte_valor_dia != null ? String(c.vale_transporte_valor_dia).replace(".", ",") : "",
      // Novo colaborador herda os benefícios que a empresa já concede ao time.
      beneficios: c.id
        ? Object.fromEntries(
            (atribuicoes ?? [])
              .filter((a: any) => a.colaborador_id === c.id && a.ativo)
              .map((a: any) => [a.beneficio_id, true]),
          )
        : Object.fromEntries(
            Array.from(
              new Set(
                (atribuicoes ?? [])
                  .filter((a: any) => a.ativo)
                  .map((a: any) => a.beneficio_id as string),
              ),
            ).map((id) => [id, true]),
          ),
      base_salarial: c.base_salarial != null ? String(c.base_salarial).replace(".", ",") : "",
      base_horas_mes: String(c.base_horas_mes ?? BASE_HORAS_MES_PADRAO),
      base_dias_mes: String(c.base_dias_mes ?? BASE_DIAS_MES_PADRAO),
      valor_hora_manual: !!c.valor_hora_manual,
      premio_assiduidade: !!c.premio_assiduidade,
      premio_assiduidade_valor:
        c.premio_assiduidade_valor != null ? String(c.premio_assiduidade_valor).replace(".", ",") : "",
      assiduidade_criterio: (c.assiduidade_criterio ?? "sem_faltas_sem_atrasos") as AssiduidadeCriterio,
      assiduidade_tolerancia_min: String(c.assiduidade_tolerancia_min ?? 10),
      assiduidade_max_atrasos: String(c.assiduidade_max_atrasos ?? 2),
      assiduidade_considera_atestado: (c as any).assiduidade_considera_atestado ?? true,
      assiduidade_max_atestados: String((c as any).assiduidade_max_atestados ?? 0),
      premio_assiduidade_tipo: (c.premio_assiduidade_tipo ?? "valor") as "valor" | "percentual",
      vale_alimentacao: !!c.vale_alimentacao,
      vale_alimentacao_valor:
        c.vale_alimentacao_valor != null ? String(c.vale_alimentacao_valor).replace(".", ",") : "",
      vale_alimentacao_periodicidade: (c.vale_alimentacao_periodicidade ?? "mensal") as "diario" | "mensal",
      vale_alimentacao_dias_base: String(c.vale_alimentacao_dias_base ?? 22),
      vale_alimentacao_dias_origem:
        ((c as any).vale_alimentacao_dias_origem ?? "jornada") as "jornada" | "fixo",
      vale_alimentacao_desconto_tipo:
        (c.vale_alimentacao_desconto_tipo ?? "percentual") as "nenhum" | "percentual" | "valor",
      vale_alimentacao_desconto_valor:
        c.vale_alimentacao_desconto_valor != null
          ? String(c.vale_alimentacao_desconto_valor).replace(".", ",")
          : "1",
      vale_alimentacao_dia_pagamento: String((c as any).vale_alimentacao_dia_pagamento ?? DIA_PAGAMENTO_PADRAO),
      vale_alimentacao_dias_corte: String((c as any).vale_alimentacao_dias_corte ?? DIAS_CORTE_PADRAO),
      vale_alimentacao_desconta_falta:
        (c as any).vale_alimentacao_desconta_falta ?? REGRAS_DESCONTO_PADRAO.falta,
      vale_alimentacao_desconta_folga_extra:
        (c as any).vale_alimentacao_desconta_folga_extra ?? REGRAS_DESCONTO_PADRAO.folga_extra,
      vale_alimentacao_desconta_atestado:
        (c as any).vale_alimentacao_desconta_atestado ?? REGRAS_DESCONTO_PADRAO.atestado,
      vale_alimentacao_desconta_ferias:
        (c as any).vale_alimentacao_desconta_ferias ?? REGRAS_DESCONTO_PADRAO.ferias,
      vale_transporte_dia_pagamento: String((c as any).vale_transporte_dia_pagamento ?? DIA_PAGAMENTO_PADRAO),
      vale_transporte_dias_corte: String((c as any).vale_transporte_dias_corte ?? DIAS_CORTE_PADRAO),
      vale_transporte_desconta_falta:
        (c as any).vale_transporte_desconta_falta ?? REGRAS_DESCONTO_PADRAO.falta,
      vale_transporte_desconta_folga_extra:
        (c as any).vale_transporte_desconta_folga_extra ?? REGRAS_DESCONTO_PADRAO.folga_extra,
      vale_transporte_desconta_atestado:
        (c as any).vale_transporte_desconta_atestado ?? REGRAS_DESCONTO_PADRAO.atestado,
      vale_transporte_desconta_ferias:
        (c as any).vale_transporte_desconta_ferias ?? REGRAS_DESCONTO_PADRAO.ferias,
    });

    setForm({

      nome: c.nome ?? "",
      cpf: c.cpf ? maskCpf(c.cpf) : "",
      matricula: c.matricula ?? "",
      email: c.email ?? "",
      whatsapp: c.whatsapp ?? "",
      cargo_id: c.cargo_id ?? "",
      unidade_id: c.unidade_id ?? "",
      sindicato_id: (c as any).sindicato_id ?? "",

      data_admissao: c.data_admissao ?? "",
      data_nascimento: c.data_nascimento ?? "",
      data_desligamento: c.data_desligamento ?? "",
      motivo_desligamento: c.motivo_desligamento ?? NONE_DESLIG,
      elegivel_recontratacao: c.elegivel_recontratacao ?? NONE_DESLIG,
      observacao_desligamento: c.observacao_desligamento ?? "",
      
      tipo_vinculo:
        (c.vinculo_label && TIPOS_VINCULO.some((t) => t.value === c.vinculo_label)
          ? String(c.vinculo_label)
          : c.regime
            ? REGIME_TO_VINCULO[String(c.regime)] ?? "CLT"
            : "CLT"),
      folga_fixa_semana: c.folga_fixa_semana != null ? String(c.folga_fixa_semana) : "none",
      perfil_acesso: c.perfil_acesso ?? "colaborador",
      ativo: c.ativo ?? true,
      possui_folha_ponto: c.possui_folha_ponto ?? false,
      optante_adiantamento: c.optante_adiantamento ?? false,
    });
    setResetKey((k) => k + 1);
  }, [open, colaborador, atribuicoes]);

  useEffect(() => {
    if (!open) { setDispensas([]); isonomiaConfirmada.current = false; }
  }, [open]);

  const regimeSelecionado = VINCULO_TO_REGIME[form.tipo_vinculo] ?? "clt";

  // Orientação jurídica: vínculos sem previsão legal (freelancer), de risco de
  // pejotização (PJ/MEI) ou de sócio sem gestão ganham faixa de alerta.
  // O rótulo do vínculo entra na conta porque PJ, Sócio e Autônomo compartilham
  // o mesmo regime `pj` no banco e a orientação de cada um é diferente.
  const risco = useMemo(
    () => regimeRisco({
      regime: regimeSelecionado,
      vinculo: form.tipo_vinculo,
      temHorarioDefinido: true,
    }),
    [regimeSelecionado, form.tipo_vinculo],
  );
  const [riscoOpen, setRiscoOpen] = useState(false);


  // Mudar o vínculo pode invalidar a forma de pagamento (ex.: intermitente não
  // é mensalista): reconciliamos sempre pela política do contrato.
  useEffect(() => {
    cienciaConfirmada.current = null;
    setRem((r) => {
      const ajustada = ajustarFormaPagamento(regimeSelecionado, r.forma_pagamento) as FormaPagamento;
      return ajustada === r.forma_pagamento ? r : { ...r, forma_pagamento: ajustada };
    });
  }, [regimeSelecionado]);

  const unidadeSelecionada = (unidades.data ?? []).find((u) => u.id === form.unidade_id) as any;
  const cargoSelecionado = (cargos.data ?? []).find((c) => c.id === form.cargo_id) as any;

  // O piso é negociado pelo sindicato patronal, que é vinculado à unidade:
  // unidades com o mesmo patronal compartilham o piso; ajustes por unidade só
  // valem acima dele. Sem patronal ou sem piso, a referência fica pendente.
  const pisosCargo = useDpCargoSalarios(form.cargo_id || null);
  // Pisos de todos os cargos: alimentam o rótulo de salário na lista de cargos.
  const todosPisos = useDpCargoSalarios();
  const pisosPorCargo = useMemo(
    () => agruparPisosPorCargo((todosPisos.data ?? []) as any[]),
    [todosPisos.data],
  );
  const patronalPorUnidade = useDpPatronalPorUnidade();
  const sindicatos = useDpSindicatos();
  const patronalUnidade = form.unidade_id
    ? patronalPorUnidade.data?.[form.unidade_id] ?? null
    : null;
  const refSalario = useMemo(
    () =>
      salarioCargoNaUnidade(
        (pisosCargo.data ?? []) as any,
        form.unidade_id || null,
        patronalUnidade?.id ?? null,
        form.data_admissao || undefined,
        // Piso já negociado com vigência posterior à admissão continua sendo a
        // referência do cargo — não faz sentido pedir novo cadastro.
        { aceitarFuturo: true },
      ),
    [pisosCargo.data, form.unidade_id, patronalUnidade?.id, form.data_admissao],
  );
  const salarioCargo = refSalario.valor;
  const cargoParaComparacao = cargoSelecionado
    ? { ...cargoSelecionado, salario_base: salarioCargo }
    : cargoSelecionado;



  // Trocar o cargo ou o salário exige revalidar a regra "um cargo = um salário".
  useEffect(() => {
    cargoResolvido.current = false;
  }, [form.cargo_id, rem.salario_base, rem.base_salarial, rem.forma_pagamento]);

  /** Base mensal usada para comparar com o salário de referência do cargo. */
  const baseSalarialInformada = () => {
    const usaBase = rem.forma_pagamento === "horista" || rem.forma_pagamento === "diarista";
    return usaBase ? numeroBR(rem.base_salarial) : numeroBR(rem.salario_base);
  };

  /** Vincula o cargo criado/escolhido pelos diálogos auxiliares. */
  const selecionarCargo = (cargo: DpCargo) => {
    setForm((f) => ({ ...f, cargo_id: cargo.id }));
    cargoResolvido.current = true;
  };



  // Adiantamento depende do contrato e da forma de pagamento (intermitente não tem).
  const permiteAdiantamento =
    policy.permiteAdiantamento &&
    permiteAdiantamentoRemuneracao(VINCULO_TO_REGIME[form.tipo_vinculo], rem.forma_pagamento);

  useEffect(() => {
    if (!permiteAdiantamento) {
      setForm((f) => (f.optante_adiantamento ? { ...f, optante_adiantamento: false } : f));
      return;
    }
    if (unidadeSelecionada?.tem_adiantamento && !isEdit) {
      setForm((f) => (f.optante_adiantamento ? f : { ...f, optante_adiantamento: true }));
    }
  }, [unidadeSelecionada?.tem_adiantamento, isEdit, permiteAdiantamento]);



  /** Registra a ciência do risco jurídico em dp_regras_historico. */
  const registrarCiencia = async (justificativa: string) => {
    if (!selectedCompanyId) return;
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user?.id) return;
      await supabase.from("dp_regras_historico").insert({
        company_id: selectedCompanyId,
        usuario_id: auth.user.id,
        tabela: "dp_colaboradores",
        registro_id: colaborador?.id ?? null,
        valor_antigo: null as never,
        valor_novo: {
          vinculo: form.tipo_vinculo,
          regime: regimeSelecionado,
          nome: form.nome.trim(),
          cpf: form.cpf.replace(/\D/g, ""),
        } as never,
        justificativa: justificativa || null,
        ciencia_confirmada: true,
      });
    } catch { /* o cadastro não deve falhar por causa do log */ }
  };

  /**
   * Divergências de benefício deste cadastro contra o grupo equivalente.
   *
   * O grupo forte é o sindical (laboral + patronal da unidade); sem sindicato,
   * cai para unidade + cargo. Vale para cadastro novo e para quem nunca teve o
   * benefício — não apenas para quem teve o benefício retirado.
   */
  const divergenciasIso = useMemo<DivergenciaIsonomia[]>(() => {
    const patronal = patronalPorUnidade.data ?? {};
    const colegas = (todosColaboradores.data ?? [])
      .filter((c: any) => c.id !== colaborador?.id && c.ativo !== false && !c.data_desligamento)
      .map((c: any) =>
        snapshotColegaBeneficios(
          c,
          c.unidade_id ? patronal[c.unidade_id]?.id ?? null : null,
          atribuicoes as any[],
        ),
      );

    // Estado atual do formulário no mesmo formato do motor.
    const alvoLinha = {
      id: colaborador?.id ?? "novo",
      nome: form.nome,
      cargo_id: form.cargo_id || null,
      unidade_id: form.unidade_id || null,
      sindicato_id: form.sindicato_id || null,
      salario_base: numeroBR(rem.salario_base),
      base_salarial: numeroBR(rem.base_salarial),
      vale_alimentacao: rem.vale_alimentacao,
      vale_alimentacao_valor: numeroBR(rem.vale_alimentacao_valor),
      vale_alimentacao_periodicidade: rem.vale_alimentacao_periodicidade,
      vale_alimentacao_dias_base: numeroBR(rem.vale_alimentacao_dias_base),
      vale_transporte: rem.vale_transporte,
      vale_transporte_valor_dia: numeroBR(rem.vale_transporte_valor_dia),
      premio_assiduidade: rem.premio_assiduidade,
      premio_assiduidade_valor: numeroBR(rem.premio_assiduidade_valor),
      premio_assiduidade_tipo: rem.premio_assiduidade_tipo,
    };

    const itens = [
      ...itensIsonomiaDoCadastro(alvoLinha),
      // Benefícios do catálogo marcados na ficha do colaborador.
      ...beneficios.map((b) => ({
        chave: b.id,
        nome: b.nome,
        ativo: !!rem.beneficios[b.id],
      })),
    ];

    return divergenciasIsonomia(itens, colegas, {
      cargo_id: form.cargo_id || null,
      unidade_id: form.unidade_id || null,
      sindicato_id: form.sindicato_id || null,
      patronal_id: patronalUnidade?.id ?? null,
    }, {
      sindicatoNome: (sindicatos.data ?? []).find((s) => s.id === form.sindicato_id)?.nome ?? null,
    });
  }, [
    todosColaboradores.data, atribuicoes, patronalPorUnidade.data, patronalUnidade?.id,
    beneficios, sindicatos.data, colaborador?.id, form.nome, form.cargo_id, form.unidade_id,
    form.sindicato_id, rem,
  ]);

  /** Divergências que exigem ciência com motivo objetivo neste salvamento. */
  const dispensasPendentes = (): DispensaBeneficio[] =>
    divergenciasIso.map((d) => ({
      beneficio_id: d.chave,
      beneficio_nome: d.beneficio_nome,
      divergencia: d,
    }));

  /** Iguala o benefício divergente ao padrão praticado no grupo. */
  const aplicarPadraoIsonomia = (d: DivergenciaIsonomia) => {
    const emBR = (v: number) => (v > 0 ? v.toFixed(2).replace(".", ",") : "");
    if (d.chave === "vale_alimentacao") {
      // Copia a configuração nativa do grupo (ex.: R$ 24,00 por dia); só usa o
      // equivalente mensal quando o grupo não tem periodicidade conhecida.
      const periodicidade = d.padrao_periodicidade ?? "mensal";
      const valor = d.padrao_unitario ?? d.valor_padrao ?? 0;
      patchRem({
        vale_alimentacao: true,
        vale_alimentacao_periodicidade: periodicidade,
        vale_alimentacao_valor: emBR(valor),
      });
      return;
    }
    if (d.chave === "vale_transporte") {
      const dia = d.padrao_periodicidade === "diario"
        ? d.padrao_unitario ?? 0
        : (d.valor_padrao ?? 0) / DIAS_BASE_PADRAO;
      patchRem({ vale_transporte: true, vale_transporte_valor_dia: emBR(dia) });
      return;
    }
    if (d.chave === "premio_assiduidade") {
      patchRem({ premio_assiduidade: true });
      return;
    }
    patchRem({ beneficios: { ...rem.beneficios, [d.chave]: true } });
  };


  /** Estado atual das abas, usado para detectar alterações não salvas. */
  const snapshot = JSON.stringify({ form, rem });
  const dirty = baseline !== null && snapshot !== baseline;

  /** Pendências resumidas por aba, exibidas como indicador nos TabsTrigger. */
  const dadosPendente =
    !form.nome.trim() ||
    form.cpf.replace(/\D/g, "").length !== 11 ||
    !form.cargo_id ||
    !form.unidade_id ||
    !form.data_admissao ||
    !form.data_nascimento ||
    (isDesligado && !form.data_desligamento);
  const remPendente = !!remuneracaoPendente({
    forma_pagamento: rem.forma_pagamento,
    salario_base: numeroBR(rem.salario_base) || null,
    valor_hora: numeroBR(rem.valor_hora) || null,
    salario_cargo: salarioCargo,
  });

  /** Sincroniza o marco de "sem alterações" após carregar o colaborador. */
  useEffect(() => {
    setBaseline(JSON.stringify({ form, rem }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  /** Leva o usuário até o campo pendente: rola, foca e mantém o destaque. */
  useEffect(() => {
    if (!campoErro) return;
    const t = window.setTimeout(() => {
      const alvo = contentRef.current?.querySelector<HTMLElement>(`[data-field="${campoErro}"]`);
      if (!alvo) return;
      alvo.scrollIntoView({ block: "center", behavior: "smooth" });
      alvo.focus({ preventScroll: true });
    }, 120);
    return () => window.clearTimeout(t);
  }, [campoErro, tab]);

  /** Qualquer edição limpa o destaque de pendência. */
  useEffect(() => {
    setCampoErro((atual) => (atual ? null : atual));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

  /** Atributos do campo pendente: âncora para foco e destaque em vermelho. */
  const marca = (campo: string, extraClass?: string) => ({
    "data-field": campo,
    "aria-invalid": campoErro === campo ? true : undefined,
    className: [extraClass, campoErro === campo ? "border-destructive ring-1 ring-destructive" : ""]
      .filter(Boolean)
      .join(" ") || undefined,
  });




  /** Fecha o diálogo conferindo alterações pendentes. */
  const tentarFechar = () => {
    if (dirty) { setConfirmarSaida(true); return; }
    onOpenChange(false);
  };

  /** Aplica a intenção do botão que disparou o salvamento. */
  const finalizar = () => {
    const intencao = intencaoRef.current;
    intencaoRef.current = "stay";
    if (intencao === "close") { onOpenChange(false); return; }
    // "Salvar e continuar": avança para a aba seguinte, se houver.
    const proxima = abaSeguinte(tab);
    if (proxima) setTab(proxima);
  };

  /**
   * Vale perguntar se a remuneração deste colaborador vira o padrão da unidade?
   * Só quando há conteúdo, a unidade está definida e existe ao menos um grupo
   * divergente do tipo "alteracao" — benefício desligado em uma pessoa é
   * exceção individual e não deve abrir a pergunta sozinho.
   */
  const devePerguntarPadrao = () => {
    if (!form.unidade_id) return false;
    if (localStorage.getItem(naoPerguntarKey) === "1") return false;
    const atual = extrairPadrao(rem);
    if (!padraoTemConteudo(atual)) return false;
    // Igual a qualquer padrão vigente (cargo, unidade ou empresa) → nada a perguntar.
    if (
      padroesIguaisAlgum(atual, padroesBeneficios.data, {
        unidadeId: form.unidade_id || null,
        cargoId: form.cargo_id || null,
      })
    ) {
      return false;
    }
    // Existe padrão de referência e o único desvio é um desligamento? Não pergunta.
    if (padraoAplicavel && !gruposAlteracao(atual, padraoAplicavel.payload).length) return false;

    // Mesmo conjunto já decidido nesta abertura da ficha → não repete.
    return !padraoRespondidoRef.current.has(assinaturaPadrao(atual));
  };

  /**
   * Adicionais de risco: a ficha divergiu do cargo? Nesse caso perguntamos se
   * aquilo é regra do cargo (e propaga) ou exceção individual.
   */
  const divergenciaRisco: DivergenciaRisco = useMemo(
    () =>
      compararRiscoCargo(
        {
          insalubridade: numeroBR(rem.insalubridade_percentual),
          periculosidade: numeroBR(rem.periculosidade_percentual),
        },
        cargoSelecionado
          ? {
              insalubridade: Number(cargoSelecionado.insalubridade_percentual ?? 0) || 0,
              periculosidade: Number(cargoSelecionado.periculosidade_percentual ?? 0) || 0,
            }
          : null,
      ),
    [rem.insalubridade_percentual, rem.periculosidade_percentual, cargoSelecionado],
  );

  const devePerguntarRisco = () =>
    !!form.cargo_id &&
    !!cargoSelecionado &&
    divergenciaRisco.tipo !== "igual" &&
    !riscoRespondidoRef.current.has(
      `${rem.insalubridade_percentual}|${rem.periculosidade_percentual}|${form.cargo_id}`,
    );

  /** Encerra o salvamento: pergunta pelo padrão da unidade antes de sair da tela. */
  const concluir = (perguntar: boolean) => {
    if (perguntar) {
      const escopoInicial = nivelPadrao(padraoAplicavel) ?? "unidade";
      setEscopoPadrao(escopoInicial);
      // Já existe gente fora do padrão? Então "todos" é o alcance esperado.
      setAlcancePadrao(divergentesNoAlcance > 0 ? "todos" : "novos");
      // Pré-seleciona apenas os grupos cuja divergência é de valores/regras.
      const alteracoes = padraoAplicavel
        ? gruposAlteracao(extrairPadrao(rem), padraoAplicavel.payload)
        : [...GRUPOS_PADRAO];
      setGruposPadrao(alteracoes);
      setBuscaSelecao("");
      setSelecionadosPadrao(idsDivergentesNoAlcance);
      setPerguntarPadrao(true);
      return;

    }
    if (devePerguntarRisco()) { setPerguntarRisco(true); return; }
    finalizar();
  };

  /** Resposta da pergunta dos adicionais de risco (cargo x colaborador). */
  const responderRisco = async (acao: "colaborador" | "cargo" | "cargo_todos") => {
    setPerguntarRisco(false);
    riscoRespondidoRef.current.add(
      `${rem.insalubridade_percentual}|${rem.periculosidade_percentual}|${form.cargo_id}`,
    );
    if (acao !== "colaborador" && form.cargo_id && divergenciaRisco.tipo !== "igual") {
      const insal = divergenciaRisco.ficha.insalubridade;
      const peric = divergenciaRisco.ficha.periculosidade;
      try {
        await upsertCargo.mutateAsync({
          id: form.cargo_id,
          nome: cargoSelecionado?.nome ?? "",
          insalubre: insal > 0,
          perigoso: peric > 0,
          insalubre_periculoso: insal > 0 || peric > 0,
          insalubridade_percentual: insal,
          periculosidade_percentual: peric,
        } as any);
        if (acao === "cargo_todos") {
          await propagarRiscos.mutateAsync({
            cargoId: form.cargo_id,
            insalubridade_percentual: insal,
            periculosidade_percentual: peric,
          });
        }
        toast.success("Adicionais de risco do cargo atualizados", {
          description:
            acao === "cargo_todos"
              ? `Aplicados também aos colaboradores ativos de ${cargoSelecionado?.nome ?? "este cargo"}.`
              : "Os próximos cadastros deste cargo já vêm com estes percentuais.",
        });
      } catch (e) {
        toast.error("Não foi possível atualizar o cargo", { description: mensagemErro(e) });
      }
    }
    finalizar();
  };


  /** Resposta da pergunta do padrão — depois segue a intenção original do botão. */
  const responderPadrao = async (escopo: PadraoEscopo | null, naoPerguntarMais = false) => {
    setPerguntarPadrao(false);
    if (naoPerguntarMais) localStorage.setItem(naoPerguntarKey, "1");
    const payload = extrairPadrao(rem);
    // Registra a decisão para não repetir a pergunta no mesmo conjunto de valores.
    padraoRespondidoRef.current.add(assinaturaPadrao(payload));
    if (escopo && escopo !== "colaborador") {
      try {
        const resultado = await salvarPadraoBeneficios.mutateAsync({
          unidade_id: escopo === "empresa" ? null : form.unidade_id,
          cargo_id: escopo === "cargo" ? form.cargo_id || null : null,
          payload,
          limparEscoposMaisEspecificos: escopo !== "cargo" && alcancePadrao === "todos",
          alcance: alcancePadrao,
          colaboradorIds: alcancePadrao === "selecionados" ? idsSelecionadosValidos : null,
          grupos: gruposPadrao,
          ignorarColaboradorId: colaborador?.id ?? null,
        });

        toast.success(
          escopo === "empresa"
            ? "Padrão de remuneração da empresa atualizado"
            : escopo === "cargo"
              ? "Padrão de remuneração do cargo atualizado"
              : "Padrão de remuneração da unidade atualizado",
          {
            description:
              alcancePadrao === "novos"
                ? "Os próximos cadastros deste alcance já vêm preenchidos."
                : resultado.atualizados > 0
                  ? `${resultado.atualizados} colaborador(es) atualizado(s) com este padrão.`
                  : "Nenhum colaborador foi alterado — não havia ninguém ativo neste alcance.",
          },
        );
      } catch (e) {
        toast.error("Não foi possível salvar o padrão", { description: mensagemErro(e) });
      }
    }
    // Encadeia a pergunta dos adicionais de risco, que é decisão do cargo.
    if (devePerguntarRisco()) { setPerguntarRisco(true); return; }
    finalizar();
  };




  const submit = async (intencao?: IntencaoSalvar) => {
    if (intencao) intencaoRef.current = intencao;
    const alvo = intencaoRef.current;
    setCampoErro(null);

    // "Salvar e continuar" é um checkpoint: valida somente a aba aberta.
    // "Concluir" fecha o cadastro: valida todas as abas.
    const validaDados = alvo === "close" || tab === "dados";
    const validaRem = alvo === "close" || tab === "remuneracao";

    const cpfDigits = form.cpf.replace(/\D/g, "");
    const cargoNome = (cargos.data ?? []).find((c) => c.id === form.cargo_id)?.nome ?? null;
    const salarioNum = numeroBR(rem.salario_base);
    const valorHoraNum = numeroBR(rem.valor_hora);
    const insalubridadeNum = numeroBR(rem.insalubridade_percentual);
    const periculosidadeNum = numeroBR(rem.periculosidade_percentual);
    // Não cumulam: gravamos o mais favorável no campo único que a folha consome.
    const adicionalNum = percentualAdicionalVigente(insalubridadeNum, periculosidadeNum);
    const vtDiaNum = numeroBR(rem.vale_transporte_valor_dia);
    const premioNum = numeroBR(rem.premio_assiduidade_valor);
    // Base de cálculo só se aplica a horista/diarista.
    const usaBaseCalculo = rem.forma_pagamento === "horista" || rem.forma_pagamento === "diarista";
    const pendencia = remuneracaoPendente({
      forma_pagamento: rem.forma_pagamento,
      salario_base: salarioNum || null,
      valor_hora: valorHoraNum || null,
      salario_cargo: salarioCargo,
    });

    const erro = (campo: string, mensagem: string): ErroCampo => ({ campo, mensagem });

    /** Erros da aba Dados; devolve o primeiro campo pendente. */
    const erroDados = async (): Promise<ErroCampo | null> => {
      if (!form.nome.trim()) return erro("nome", "Nome é obrigatório");
      if (!form.cpf.trim()) return erro("cpf", "CPF é obrigatório");
      if (cpfDigits.length !== 11) return erro("cpf", "CPF deve ter 11 dígitos");
      if (!isValidCpf(cpfDigits)) return erro("cpf", "CPF inválido");
      if (!form.cargo_id) return erro("cargo_id", "Cargo é obrigatório");
      if (!form.unidade_id) return erro("unidade_id", "Unidade é obrigatória");
      if (!form.data_admissao) return erro("data_admissao", "Data de admissão é obrigatória");
      if (!form.data_nascimento) return erro("data_nascimento", "Data de nascimento é obrigatória");

      const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
      const nascimento = new Date(form.data_nascimento + "T00:00:00");
      const admissao = new Date(form.data_admissao + "T00:00:00");
      if (nascimento >= hoje) return erro("data_nascimento", "Data de nascimento deve ser no passado");

      const idade = (admissao.getTime() - nascimento.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      if (idade < 14) return erro("data_nascimento", "Colaborador deve ter no mínimo 14 anos na admissão");
      if (idade > 100) return erro("data_nascimento", "Data de nascimento inconsistente com a admissão");

      if (admissao > hoje) {
        // permite admissão futura até 90 dias
        const diffDias = (admissao.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDias > 90) {
          return erro("data_admissao", "Data de admissão muito distante no futuro (máx. 90 dias)");
        }
      }

      if (isDesligado && !form.data_desligamento) {
        return erro("data_desligamento", "Informe a data da demissão");
      }
      if (form.observacao_desligamento.length > 2000) {
        return erro("observacao_desligamento", "Observação do desligamento muito longa (máx. 2000 caracteres)");
      }

      // Duplicidade de CPF na empresa
      try {
        const { data: dup } = await (await import("@/integrations/supabase/client")).supabase
          .from("dp_colaboradores")
          .select("id")
          .eq("cpf", cpfDigits)
          .maybeSingle();
        if (dup && dup.id !== colaborador?.id) {
          return erro("cpf", "Já existe um colaborador com este CPF nesta empresa");
        }
      } catch { /* silencioso — o banco tem constraint de reserva */ }

      return null;
    };

    /** Erros da aba Remuneração. */
    const erroRemuneracao = (): ErroCampo | null => {
      // Remuneração é pré-requisito da folha: bloqueia o cadastro novo sem valor.
      // Editando um colaborador existente, a falta não trava — avisamos após gravar.
      if (pendencia && !isEdit && !criadoId) {
        return erro(rem.forma_pagamento === "horista" ? "valor_hora" : "salario_base", pendencia);
      }
      if (insalubridadeNum < 0 || insalubridadeNum > 100) {
        return erro("insalubridade_percentual", "Insalubridade deve estar entre 0% e 100%");
      }
      if (periculosidadeNum < 0 || periculosidadeNum > 100) {
        return erro("periculosidade_percentual", "Periculosidade deve estar entre 0% e 100%");
      }
      if (rem.vale_transporte && vtDiaNum <= 0) {
        return erro("vale_transporte_valor_dia", "Informe o valor diário do vale-transporte");
      }
      if (rem.premio_assiduidade && premioNum <= 0) {
        return erro(
          "premio_assiduidade_valor",
          rem.premio_assiduidade_tipo === "percentual"
            ? "Informe o percentual do prêmio de assiduidade"
            : "Informe o valor do prêmio de assiduidade",
        );
      }
      if (rem.premio_assiduidade && rem.premio_assiduidade_tipo === "percentual" && premioNum > 100) {
        return erro("premio_assiduidade_valor", "O percentual do prêmio de assiduidade não pode passar de 100%");
      }
      if (rem.vale_alimentacao && numeroBR(rem.vale_alimentacao_valor) <= 0) {
        return erro("vale_alimentacao_valor", "Informe o valor do vale-alimentação");
      }
      return null;
    };

    if (validaDados) {
      const e = await erroDados();
      if (e) { toast.error(e.mensagem); setTab("dados"); setCampoErro(e.campo); return; }
    }

    if (validaRem) {
      const e = erroRemuneracao();
      if (e) { toast.error(e.mensagem); setTab("remuneracao"); setCampoErro(e.campo); return; }

      // Benefícios desmarcados exigem ciência de isonomia.
      if (!isonomiaConfirmada.current) {
        const pendentes = dispensasPendentes();
        if (pendentes.length > 0) { setTab("remuneracao"); setDispensas(pendentes); return; }
      }

      // Mensalista com cargo remunerado: o salário vem travado do cargo, sem conflito possível.
      const salarioTravadoNoCargo =
        rem.forma_pagamento === "mensalista" && !!salarioCargo && salarioCargo > 0;
      if (salarioTravadoNoCargo) cargoResolvido.current = true;

      // Um cargo = um salário: reconcilia o cargo antes de gravar o colaborador.
      if (!cargoResolvido.current) {
        const comparacao = compararSalarioCargo(cargoParaComparacao, baseSalarialInformada());
        if (comparacao.status === "cargo_sem_salario") {
          setTab("remuneracao");
          setCargoSemSalario({ salarioInformado: comparacao.salarioInformado });
          return;
        } else if (comparacao.status === "divergente") {
          setTab("remuneracao");
          setConflitoCargo({
            salarioCargo: comparacao.salarioCargo,
            salarioInformado: comparacao.salarioInformado,
          });
          return;
        } else {
          cargoResolvido.current = true;
        }
      }
    }

    if (validaDados) {
      // Vínculo sem registro em carteira exige ciência formal do risco jurídico.
      if (policy.exigeCienciaLegal && !cienciaConfirmada.current) {
        setCienciaAberta(true);
        return;
      }
    }




    try {
      const colaboradorId = await upsert.mutateAsync({
        id: colaborador?.id ?? criadoId ?? undefined,
        nome: form.nome.trim(),
        cpf: form.cpf.replace(/\D/g, "") || null,
        matricula: form.matricula.trim() || null,
        cargo: cargoNome,
        cargo_id: form.cargo_id,
        unidade_id: form.unidade_id,
        sindicato_id: form.sindicato_id || null,

        regime: regimeSelecionado,
        vinculo_label: form.tipo_vinculo,
        data_admissao: form.data_admissao || null,
        data_nascimento: form.data_nascimento || null,
        email: form.email.trim() || null,
        whatsapp: form.whatsapp.trim() || null,

        perfil_acesso: form.perfil_acesso,
        folga_fixa_semana:
          policy.exigeFolgaSemanal && form.folga_fixa_semana !== "none"
            ? Number(form.folga_fixa_semana)
            : null,

        possui_folha_ponto: form.possui_folha_ponto,
        optante_adiantamento: permiteAdiantamento ? form.optante_adiantamento : false,

        forma_pagamento: rem.forma_pagamento,
        salario_base: rem.forma_pagamento === "horista" ? null : salarioNum || null,
        valor_hora: rem.forma_pagamento === "horista" ? valorHoraNum || null : null,
        dependentes_irrf: Math.max(0, Math.trunc(numeroBR(rem.dependentes_irrf))),
        adicional_percentual: adicionalNum,
        insalubridade_percentual: insalubridadeNum,
        periculosidade_percentual: periculosidadeNum,
        vale_transporte: rem.vale_transporte,
        vale_transporte_valor_dia: rem.vale_transporte ? vtDiaNum : null,
        vale_transporte_dia_pagamento: rem.vale_transporte
          ? Math.min(31, Math.max(1, Math.trunc(numeroBR(rem.vale_transporte_dia_pagamento)) || DIA_PAGAMENTO_PADRAO))
          : null,
        vale_transporte_dias_corte: rem.vale_transporte
          ? Math.min(20, Math.max(0, Math.trunc(numeroBR(rem.vale_transporte_dias_corte))))
          : null,
        vale_transporte_desconta_falta: rem.vale_transporte ? rem.vale_transporte_desconta_falta : null,
        vale_transporte_desconta_folga_extra: rem.vale_transporte
          ? rem.vale_transporte_desconta_folga_extra
          : null,
        vale_transporte_desconta_atestado: rem.vale_transporte ? rem.vale_transporte_desconta_atestado : null,
        vale_transporte_desconta_ferias: rem.vale_transporte ? rem.vale_transporte_desconta_ferias : null,

        // Base de cálculo do valor da hora/dia
        base_salarial: usaBaseCalculo ? numeroBR(rem.base_salarial) || null : null,
        base_horas_mes: numeroBR(rem.base_horas_mes) || BASE_HORAS_MES_PADRAO,
        base_dias_mes: numeroBR(rem.base_dias_mes) || BASE_DIAS_MES_PADRAO,
        valor_hora_manual: usaBaseCalculo ? rem.valor_hora_manual : false,

        // Assiduidade e pontualidade
        premio_assiduidade: rem.premio_assiduidade,
        premio_assiduidade_valor: rem.premio_assiduidade ? premioNum || null : null,
        assiduidade_criterio: rem.premio_assiduidade ? rem.assiduidade_criterio : null,
        assiduidade_tolerancia_min: Math.max(0, Math.trunc(numeroBR(rem.assiduidade_tolerancia_min))),
        assiduidade_considera_atestado: rem.premio_assiduidade
          ? rem.assiduidade_considera_atestado
          : true,
        assiduidade_max_atestados: rem.premio_assiduidade && rem.assiduidade_considera_atestado
          ? Math.max(0, Math.trunc(numeroBR(rem.assiduidade_max_atestados)))
          : null,
        assiduidade_max_atrasos: rem.premio_assiduidade
          ? Math.max(0, Math.trunc(numeroBR(rem.assiduidade_max_atrasos)))
          : null,
        premio_assiduidade_tipo: rem.premio_assiduidade ? rem.premio_assiduidade_tipo : "valor",

        // Vale-alimentação / refeição
        vale_alimentacao: rem.vale_alimentacao,
        vale_alimentacao_valor: rem.vale_alimentacao ? numeroBR(rem.vale_alimentacao_valor) || null : null,
        vale_alimentacao_periodicidade: rem.vale_alimentacao_periodicidade,
        vale_alimentacao_dias_base: Math.max(0, Math.trunc(numeroBR(rem.vale_alimentacao_dias_base))) || 22,
        vale_alimentacao_dias_origem: rem.vale_alimentacao_dias_origem,
        vale_alimentacao_desconto_tipo: rem.vale_alimentacao_desconto_tipo,
        vale_alimentacao_desconto_valor: rem.vale_alimentacao_desconto_tipo === "nenhum"
          ? 0
          : numeroBR(rem.vale_alimentacao_desconto_valor),
        vale_alimentacao_dia_pagamento: rem.vale_alimentacao
          ? Math.min(31, Math.max(1, Math.trunc(numeroBR(rem.vale_alimentacao_dia_pagamento)) || DIA_PAGAMENTO_PADRAO))
          : null,
        vale_alimentacao_dias_corte: rem.vale_alimentacao
          ? Math.min(20, Math.max(0, Math.trunc(numeroBR(rem.vale_alimentacao_dias_corte))))
          : null,
        vale_alimentacao_desconta_falta: rem.vale_alimentacao ? rem.vale_alimentacao_desconta_falta : null,
        vale_alimentacao_desconta_folga_extra: rem.vale_alimentacao
          ? rem.vale_alimentacao_desconta_folga_extra
          : null,
        vale_alimentacao_desconta_atestado: rem.vale_alimentacao ? rem.vale_alimentacao_desconta_atestado : null,
        vale_alimentacao_desconta_ferias: rem.vale_alimentacao ? rem.vale_alimentacao_desconta_ferias : null,
        ...(isDesligado
          ? {
              data_desligamento: form.data_desligamento,
              motivo_desligamento:
                form.motivo_desligamento === NONE_DESLIG ? null : form.motivo_desligamento,
              elegivel_recontratacao:
                form.elegivel_recontratacao === NONE_DESLIG ? null : form.elegivel_recontratacao,
              observacao_desligamento: form.observacao_desligamento.trim() || null,
            }
          : {}),
      } as any);


      // Sincroniza a ficha de benefícios marcada no cadastro.
      const hoje = new Date().toISOString().slice(0, 10);
      for (const b of beneficios) {
        const marcado = !!rem.beneficios[b.id];
        const atual = (atribuicoes ?? []).find(
          (a: any) => a.colaborador_id === colaboradorId && a.beneficio_id === b.id,
        ) as any;
        if (!marcado && !atual) continue;
        if (!!atual?.ativo === marcado) continue;
        await saveAtribuicao.mutateAsync({
          id: atual?.id,
          colaborador_id: colaboradorId,
          beneficio_id: b.id,
          valor: Number(atual?.valor ?? b.valor_padrao ?? 0),
          desconto_valor: Number(atual?.desconto_valor ?? 0),
          data_inicio: atual?.data_inicio ?? hoje,
          data_fim: atual?.data_fim ?? null,
          ativo: marcado,
          observacao: atual?.observacao ?? null,
        });
      }

      // A pergunta do padrão só cabe quando a aba de remuneração foi validada.
      const perguntar = validaRem && devePerguntarPadrao();

      if (isEdit || criadoId) {
        // Botão único: grava também o horário de trabalho quando houve mudança.
        const salvarJornada = jornadaSalvarRef.current;
        const resultado = salvarJornada ? await salvarJornada() : "nada";
        // Ciência legal cancelada: para sem erro, mantendo a tela aberta na aba.
        if (resultado === "cancelado" || resultado === "pendente_ciencia") {
          setTab("jornada");
          return;
        }
        if (resultado === "erro") { setTab("jornada"); return; }
        toast.success(
          alvo === "close"
            ? "Colaborador atualizado"
            : tab === "jornada"
              ? "Horário de trabalho salvo"
              : tab === "remuneracao"
                ? "Remuneração salva"
                : "Dados salvos",
        );
        // O aviso de remuneração só cabe quando essa aba foi validada.
        if (pendencia && validaRem) {
          toast.warning("Falta completar a remuneração", {
            description: `${pendencia} A folha só é gerada depois disso.`,
          });
        }
        setBaseline(snapshot);
        concluir(perguntar);
        return;
      }


      // Cadastro novo: o registro passa a existir. Se a intenção for concluir,
      // fechamos o diálogo; caso contrário, levamos o administrador para a
      // próxima aba para completar turno e jornada.
      setCriadoId(colaboradorId);
      setBaseline(snapshot);
      toast.success("Colaborador cadastrado");

      if (intencaoRef.current !== "close" && tab === "dados") {
        toast("Defina o turno e a jornada");
      }
      concluir(perguntar);



    } catch (e) {
      toast.error("Erro ao salvar", { description: mensagemErro(e) });
    }
  };


  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { tentarFechar(); return; } onOpenChange(true); }}>
      <DialogContent
        ref={contentRef}
        className="flex max-h-[92vh] w-full max-w-4xl flex-col gap-0 overflow-hidden p-0"
      >
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as typeof tab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          {/* Cabeçalho e abas fixos: só o conteúdo do formulário rola. */}
          <div className="shrink-0 space-y-3 border-b border-border bg-background p-6 pb-3">
            <DialogHeader className="space-y-0 text-left">
              <div className="flex items-start justify-between gap-2">
                <DialogTitle>
                  {isEdit
                    ? `Editar: ${toProperName(form.nome.trim()) || "Colaborador"}`
                    : `Cadastrar: ${toProperName(form.nome.trim()) || "Novo Colaborador"}`}
                </DialogTitle>
                {(isEdit || criadoId) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mr-8 h-8 w-8 text-destructive hover:text-destructive"
                    aria-label="Excluir cadastro"
                    title="Excluir cadastro"
                    onClick={() => setConfirmarRemocao(true)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}

              </div>
            </DialogHeader>
            <TabsList className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="dados" className="gap-2">
                Dados
                {dadosPendente && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-destructive"
                        aria-label="Falta preencher campos obrigatórios"
                      />
                    </TooltipTrigger>
                    <TooltipContent>Falta preencher campos obrigatórios</TooltipContent>
                  </Tooltip>
                )}
              </TabsTrigger>
              <TabsTrigger value="jornada">Horário de Trabalho</TabsTrigger>
              <TabsTrigger value="remuneracao" className="gap-2">
                Remuneração
                {remPendente && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-destructive"
                        aria-label="Falta preencher campos obrigatórios"
                      />
                    </TooltipTrigger>
                    <TooltipContent>Falta preencher campos obrigatórios</TooltipContent>
                  </Tooltip>
                )}
                {!remPendente && divergenciasIso.length === 0 && diferencasDoPadrao.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-amber-500"
                        aria-label="Cadastro fora do padrão de remuneração"
                      />
                    </TooltipTrigger>
                    <TooltipContent>Cadastro fora do padrão de remuneração</TooltipContent>
                  </Tooltip>
                )}
                {!remPendente && divergenciasIso.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-amber-500"
                        aria-label="Divergência de benefícios em relação aos colegas"
                      />
                    </TooltipTrigger>
                    <TooltipContent>Divergência de benefícios em relação aos colegas</TooltipContent>
                  </Tooltip>
                )}

              </TabsTrigger>
              <TabsTrigger value="dependentes">Dependentes</TabsTrigger>
              <TabsTrigger value="documentos">Documentos</TabsTrigger>

            </TabsList>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
          <TabsContent value="dados" className="mt-0">



        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
          {/* Nome */}
          <div className="col-span-2 space-y-2">
            <Label>Nome Completo *</Label>
            <Input
              value={form.nome}
              {...marca("nome")}

              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex: João da Silva"
            />
          </div>

          {/* CPF / Matrícula */}
          <div className="space-y-2">
            <Label>CPF *</Label>
            <Input
              value={form.cpf}
              {...marca("cpf")}

              onChange={(e) => setForm({ ...form, cpf: maskCpf(e.target.value) })}
              placeholder="000.000.000-00"
              maxLength={14}
            />
          </div>
          <div className="space-y-2">
            <Label>Matrícula</Label>
            <Input
              value={form.matricula}
              onChange={(e) => setForm({ ...form, matricula: e.target.value })}
              placeholder="Ex: 1234"
            />
          </div>

          {/* Email / WhatsApp */}
          <div className="space-y-2">
            <Label>E-mail</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="email@exemplo.com"
            />
          </div>
          <div className="space-y-2">
            <Label>WhatsApp</Label>
            <Input
              value={form.whatsapp}
              onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
              placeholder="(62) 99999-9999"
            />
          </div>

          {/* Cargo / Unidade */}
          <div className="space-y-2">
            <Label>Cargo *</Label>
            <div className="flex gap-2">
              <Select value={form.cargo_id} onValueChange={(v) => setForm({ ...form, cargo_id: v })}>
                <SelectTrigger {...marca("cargo_id", "flex-1")}><SelectValue placeholder="Selecione o cargo" /></SelectTrigger>
                <SelectContent>
                  {(cargos.data ?? []).map((c) => {
                    const rot = rotuloSalarioCargo(
                      (pisosPorCargo.get(c.id) ?? []) as any,
                      {
                        unidadeId: form.unidade_id || null,
                        patronalId: patronalUnidade?.id ?? null,
                        data: form.data_admissao || undefined,
                      },
                    );
                    return (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome} — {rot.texto}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" className="shrink-0" onClick={() => setNovoCargoOpen(true)}>
                Novo cargo
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Cada cargo tem um único salário de referência. Cargos criados aqui já entram na tela de Cargos.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Unidade *</Label>
            <div className="flex items-center gap-2">
              <Select value={form.unidade_id} onValueChange={(v) => setForm({ ...form, unidade_id: v })}>
                <SelectTrigger {...marca("unidade_id")}><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                <SelectContent>
                  {(unidades.data ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" className="shrink-0" onClick={() => setNovaUnidadeOpen(true)}>
                Nova unidade
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Esta é a unidade usada também no horário de trabalho. Unidades criadas aqui já entram na tela de Unidades.
            </p>
          </div>


          <SindicatoEnquadramentoField
            cargoId={form.cargo_id}
            cargoNome={cargoSelecionado?.nome ?? null}
            unidadeId={form.unidade_id}
            value={form.sindicato_id}
            onChange={(id) => setForm((f) => ({ ...f, sindicato_id: id }))}
            onBeforeNavigate={() => onOpenChange(false)}
          />



          {/* Datas */}
          <div className="space-y-2">
            <Label>Data de Admissão *</Label>
            <Input
              type="date"
              value={form.data_admissao}
              {...marca("data_admissao")}

              onChange={(e) => setForm({ ...form, data_admissao: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Data de Nascimento *</Label>
            <Input
              type="date"
              value={form.data_nascimento}
              {...marca("data_nascimento")}

              onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })}
            />
          </div>

          {/* Tipo de Vínculo (o regime do banco é derivado deste campo) */}
          <div className="space-y-2">
            <Label>Tipo de Vínculo</Label>
            <Select
              value={form.tipo_vinculo}
              onValueChange={(v) => setForm({ ...form, tipo_vinculo: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS_VINCULO.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {risco && (
              <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    <strong className="block text-foreground">{risco.titulo}</strong>
                    {risco.mensagem}
                    {risco.reforco && <span className="mt-1 block font-medium">{risco.reforco}</span>}
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {risco.atalhos.map((a) => (
                    <Button
                      key={a.regime} type="button" size="sm" variant="outline" className="h-7 text-xs"
                      onClick={() => setForm({
                        ...form,
                        tipo_vinculo: a.regime === "clt" ? "CLT" : "Intermitente",
                      })}
                    >
                      {a.label}
                    </Button>
                  ))}
                  {risco.verMaisLabel && (
                    <Button
                      type="button" size="sm" variant="link" className="h-7 p-0 text-xs"
                      onClick={() => setRiscoOpen(true)}
                    >
                      {risco.verMaisLabel}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>


          {/* A folga fixa semanal é definida na aba Horário de Trabalho, junto
              com os dias da semana — evita dois lugares com a mesma informação. */}

          <div className="space-y-2">
            <Label>Perfil de Acesso</Label>
            <Select
              value={form.perfil_acesso}
              onValueChange={(v: any) => setForm({ ...form, perfil_acesso: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="colaborador">Colaborador</SelectItem>
                <SelectItem value="gestor">Gestor</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
              </SelectContent>
            </Select>
          </div>


          {/* Folha de ponto (condicional) */}
          {unidadeSelecionada?.possui_relogio_ponto && (
            <div className="col-span-2 flex items-center gap-3 rounded-xl border border-border p-3">
              <Switch
                id="possui_folha_ponto"
                checked={form.possui_folha_ponto}
                onCheckedChange={(v) => setForm({ ...form, possui_folha_ponto: v })}
              />
              <Label htmlFor="possui_folha_ponto" className="cursor-pointer">Possui Folha de Ponto</Label>
            </div>
          )}


          {/* Senha Inicial */}
          {!isEdit && (
            <div className="col-span-2 space-y-2">
              <Label>Senha Inicial</Label>
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground font-mono">
                Padrão: 6 últimos dígitos do CPF
              </div>
            </div>
          )}

          {/* Acesso ao portal e desligamento moram aqui: sem abas separadas. */}
          {(isEdit || criadoId) && (
            <div className="col-span-2 space-y-4">
              <div id="acesso-portal" className="scroll-mt-4">
                <ColaboradorAcessoPanel colaborador={colaboradorAtual} />
              </div>
              <div id="desligamento" className="scroll-mt-4">
                <ColaboradorDesligamentoPanel colaborador={colaboradorAtual} />
              </div>
            </div>
          )}
            </div>
          </TabsContent>


          {/* forceMount: mantém o horário digitado ao alternar de aba, para que o
              botão único do rodapé grave também esta aba. */}
          <TabsContent value="jornada" className="mt-4 data-[state=inactive]:hidden" forceMount>
            <ColaboradorJornadaPanel
              colaborador={{
                id: colaborador?.id ?? criadoId ?? null,
                nome: form.nome,
                regime: regimeSelecionado,
                unidade_id: form.unidade_id || null,
                cargo_id: form.cargo_id || null,
                data_admissao: form.data_admissao || null,
                data_nascimento: form.data_nascimento || null,
              }}
              active={tab === "jornada"}
              showSaveButton={false}
              onRegistrarSalvar={(fn) => { jornadaSalvarRef.current = fn; }}
            />
          </TabsContent>



          <TabsContent value="remuneracao" className="mt-4">
            {diferencasDoPadrao.length > 0 && (
              <PadraoDivergenciaAviso
                origem={origemPadrao()}
                diferencas={diferencasDoPadrao.map((d) => ({
                  rotulo: d.rotulo,
                  padrao: d.padrao,
                  atual: d.atual,
                }))}
                onAplicar={() => {
                  setRem((r) => aplicarPadrao(r, padraoAplicavel?.payload));
                  setAvisoPadraoDispensado(true);
                  toast.success("Padrão aplicado ao formulário", {
                    description: "Confira os valores e salve para gravar.",
                  });
                }}
                onDispensar={() => setAvisoPadraoDispensado(true)}
              />
            )}

            {padraoAplicado && !isEdit && (
              <div className="mb-4 rounded-xl border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                Benefícios sugeridos pelo padrão{" "}
                {padraoAplicado === "cargo"
                  ? `de ${cargoSelecionado?.nome ?? "cargo"} em ${unidadeSelecionada?.nome ?? "unidade"}`
                  : padraoAplicado === "unidade"
                    ? `de ${unidadeSelecionada?.nome ?? "unidade"}`
                    : "da empresa"}{" "}
                — pode ajustar.
              </div>
            )}


            {/* Enquadramento salarial: laboral pelo cargo, piso pelo patronal da unidade. */}
            {cargoSelecionado && form.unidade_id && (
              <div className="mb-4 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                {refSalario.semPatronalVinculado ? (
                  <>
                    <span className="font-medium text-foreground">
                      {unidadeSelecionada?.nome ?? "Esta unidade"} não tem sindicato patronal vinculado.
                    </span>{" "}
                    Vincule o patronal da unidade para o sistema saber qual piso aplicar a {cargoSelecionado.nome}.
                  </>
                ) : refSalario.origem === "pendente" ? (
                  <>
                    <span className="font-medium text-foreground">
                      {cargoSelecionado.nome} ainda não tem piso cadastrado no sindicato patronal
                      {patronalUnidade?.nome ? ` ${patronalUnidade.nome}` : ""}.
                    </span>{" "}
                    Cada convenção patronal negocia seu próprio piso, então o valor precisa ser cadastrado
                    para este patronal — ele passa a valer para todas as unidades que o utilizam.
                  </>
                ) : (
                  <>
                    Referência salarial de {cargoSelecionado.nome}
                    {refSalario.origem === "unidade"
                      ? ` (ajuste da unidade ${unidadeSelecionada?.nome ?? ""})`
                      : ` (piso do patronal${patronalUnidade?.nome ? ` ${patronalUnidade.nome}` : ""})`}
                    : <span className="font-medium text-foreground">{moedaBR(Number(refSalario.valor ?? 0))}</span>.
                    {refSalario.origem === "unidade" && refSalario.pisoPatronal != null
                      ? ` Piso do patronal: ${moedaBR(refSalario.pisoPatronal)}.`
                      : ""}
                  </>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Remuneração e benefícios — base da folha de pagamento */}

              <RemuneracaoFields
                value={rem}
                onChange={patchRem}
                campoErro={campoErro}
                isonomia={divergenciasIso}
                onAplicarPadraoIsonomia={aplicarPadraoIsonomia}
                salarioCargo={salarioCargo}
                cargoNome={cargoSelecionado?.nome ?? null}
                onBeforeNavigate={() => onOpenChange(false)}
                cargoInsalubre={!!cargoSelecionado?.insalubre || !!cargoSelecionado?.insalubre_periculoso}
                cargoPerigoso={!!cargoSelecionado?.perigoso}
                regime={regimeSelecionado}
                beneficios={beneficios}
                diasJornada={diasJornada}
                folgasFimDeSemanaMes={folgasFimDeSemanaMes}

              />

              {/* Regra coletiva de anuênio/triênio aplicável a este colaborador */}
              <AdicionalTempoServicoCard
                admissao={form.data_admissao || null}
                cargoId={form.cargo_id || null}
                unidadeId={form.unidade_id || null}
                sindicatoId={form.sindicato_id || null}
                base={baseSalarialInformada()}
                pisoCargo={salarioCargo ?? null}
                onBeforeNavigate={() => onOpenChange(false)}
              />




              {/* Adiantamento — apenas para contratos com salário mensal em folha */}
              {permiteAdiantamento ? (
                <div className="col-span-2 flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
                  <Switch
                    id="optante_adiantamento"
                    checked={form.optante_adiantamento}
                    onCheckedChange={(v) => setForm({ ...form, optante_adiantamento: v })}
                  />
                  <Label htmlFor="optante_adiantamento" className="cursor-pointer">Opta por Adiantamento Salarial</Label>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {unidadeSelecionada?.tem_adiantamento && unidadeSelecionada?.dia_adiantamento
                      ? `Dia do adiantamento: ${unidadeSelecionada.dia_adiantamento}`
                      : "Adiantamento não configurado"}
                  </span>
                  {unidadeSelecionada && <Button type="button" size="sm" variant="outline" onClick={() => setAdiantamentoOpen(true)}>
                    Editar regra da unidade
                  </Button>}
                </div>
              ) : (
                <p className="col-span-2 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                  <strong className="text-foreground">Adiantamento salarial não se aplica.</strong>{" "}
                  {policy.adiantamentoHint}
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="dependentes" className="mt-4">
            <DependentesPanel
              colaboradorId={colaborador?.id ?? criadoId ?? null}
              remuneracaoMensal={baseSalarialInformada()}
            />
          </TabsContent>

          <TabsContent value="documentos" className="mt-4">
            <ColaboradorDocumentosPanel colaboradorId={colaborador?.id ?? criadoId ?? null} />
          </TabsContent>



          </div>
        </Tabs>

        <DialogFooter className="shrink-0 gap-2 border-t border-border p-4 sm:justify-between">

          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={tentarFechar} disabled={upsert.isPending}>
              Fechar
            </Button>
            <span className="text-xs text-muted-foreground">
              {`Etapa ${ABAS.indexOf(tab as AbaCadastro) + 1} de ${ABAS.length}`}
              {dirty ? " · alterações não salvas" : ""}
            </span>

          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => void submit("stay")}
              disabled={upsert.isPending}
            >
              {upsert.isPending
                ? "Salvando..."
                : abaSeguinte(tab)
                  ? "Salvar e continuar"
                  : "Salvar"}
            </Button>
            <Button onClick={() => void submit("close")} disabled={upsert.isPending}>
              Concluir
            </Button>
          </div>
        </DialogFooter>


      </DialogContent>

      <CienciaLegalDialog
        open={cienciaAberta}
        titulo="Vínculo sem registro em carteira"
        alertas={
          policy.cienciaLegalMensagem
            ? [{ campo: "vinculo", mensagem: policy.cienciaLegalMensagem }]
            : []
        }
        onCancel={() => setCienciaAberta(false)}
        onConfirm={async (justificativa) => {
          cienciaConfirmada.current = { justificativa };
          setCienciaAberta(false);
          await registrarCiencia(justificativa);
          await submit();
        }}
      />

      <BeneficioDispensaDialog
        open={dispensas.length > 0}
        onOpenChange={(o) => {
          if (!o) {
            // "Conceder o benefício": iguala tudo ao padrão do grupo.
            dispensas.forEach((d) => aplicarPadraoIsonomia(d.divergencia));
            setDispensas([]);
          }
        }}
        colaborador={{
          nome: form.nome.trim() || "Colaborador",
          cpf: form.cpf,
          cargo: cargos.data?.find((c) => c.id === form.cargo_id)?.nome ?? null,
        }}
        empresa={{
          nome: companies.find((c) => c.id === selectedCompanyId)?.name ?? "Empresa",
          cnpj: null,
          cidade: null,
        }}
        itens={dispensas}
        onConfirmar={async (motivo: MotivoIsonomiaEscolhido) => {
          isonomiaConfirmada.current = true;
          motivoIsonomia.current = motivo;
          setDispensas([]);
          await submit();
        }}
      />

      <CargoQuickCreateDialog
        open={novoCargoOpen}
        onOpenChange={setNovoCargoOpen}
        salarioInicial={baseSalarialInformada() || null}
        onCreated={selecionarCargo}
      />

      <UnidadeFormDialog
        open={novaUnidadeOpen}
        onOpenChange={setNovaUnidadeOpen}
        onSaved={(u) => setForm((f) => ({ ...f, unidade_id: u.id }))}
      />


      <AlertDialog open={confirmarRemocao} onOpenChange={setConfirmarRemocao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover este cadastro?</AlertDialogTitle>
            <AlertDialogDescription>
              O cadastro de <strong>{form.nome || "colaborador"}</strong> será apagado definitivamente.
              Para encerrar um vínculo mantendo o histórico, use a aba <strong>Desligamento</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                const id = colaborador?.id ?? criadoId;
                if (!id) return;
                try {
                  await removerColaborador.mutateAsync(id);
                  toast.success("Cadastro removido");
                  setConfirmarRemocao(false);
                  onOpenChange(false);
                } catch (e) {
                  toast.error("Erro ao remover cadastro", {
                    description: e instanceof Error ? e.message : String(e),
                  });
                }
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {conflitoCargo && (
        <CargoSalarioConflitoDialog
          open
          onOpenChange={(v) => { if (!v) setConflitoCargo(null); }}
          cargoNome={cargoSelecionado?.nome ?? ""}
          salarioCargo={conflitoCargo.salarioCargo}
          salarioInformado={conflitoCargo.salarioInformado}
          nomeSugerido={sugerirNomeVariacao(cargoSelecionado?.nome ?? "", (cargos.data ?? []) as any)}
          saving={upsertCargo.isPending}
          onCriarVariacao={async (nome) => {
            try {
              const cargo = await upsertCargo.mutateAsync({
                nome,
                cbo: cargoSelecionado?.cbo ?? null,
                insalubre_periculoso:
                  !!cargoSelecionado?.insalubre_periculoso ||
                  !!cargoSelecionado?.insalubre ||
                  !!cargoSelecionado?.perigoso,
                salario_base: conflitoCargo.salarioInformado,
              } as Parameters<typeof upsertCargo.mutateAsync>[0]);
              selecionarCargo(cargo);
              setConflitoCargo(null);
              toast.success("Cargo criado e vinculado. Salve para concluir.");
            } catch (e) {
              toast.error("Não foi possível criar a variação do cargo", {
                description: e instanceof Error ? e.message : String(e),
              });
            }
          }}
          onUsarSalarioDoCargo={() => {
            const valor = conflitoCargo.salarioCargo;
            const texto = valor.toFixed(2).replace(".", ",");
            const usaBase = rem.forma_pagamento === "horista" || rem.forma_pagamento === "diarista";
            patchRem(usaBase ? { base_salarial: texto } : { salario_base: texto });
            cargoResolvido.current = true;
            setConflitoCargo(null);
            toast.info("Salário ajustado para o valor do cargo. Salve para concluir.");
          }}
        />
      )}

      <AlertDialog open={!!cargoSemSalario} onOpenChange={(v) => { if (!v) setCargoSemSalario(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cadastrar o piso salarial deste cargo?</AlertDialogTitle>
            <AlertDialogDescription>
              O cargo {cargoSelecionado?.nome ?? ""} ainda não tem piso cadastrado
              {patronalUnidade?.nome
                ? ` no sindicato patronal ${patronalUnidade.nome}`
                : ` para ${unidadeSelecionada?.nome ?? "esta unidade"}`}
              . Quer usar {moedaBR(cargoSemSalario?.salarioInformado ?? 0)} como piso, valendo para
              todas as unidades com esse mesmo patronal?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                cargoResolvido.current = true;
                setCargoSemSalario(null);
                void submit();
              }}
            >
              Só para este colaborador
            </AlertDialogCancel>
            {/* O piso é do sindicato patronal: unidades com o mesmo patronal compartilham. */}
            {patronalUnidade?.id && (
              <AlertDialogAction
                disabled={salvandoPiso || upsertCargoSalario.isPending}
                onClick={async (e) => {
                  e.preventDefault();
                  if (!cargoSemSalario || !form.cargo_id || salvandoPiso) return;
                  const pendente = cargoSemSalario;
                  setSalvandoPiso(true);
                  setCargoSemSalario(null);
                  try {
                    await upsertCargoSalario.mutateAsync({
                      cargo_id: form.cargo_id,
                      unidade_id: null,
                      sindicato_patronal_id: patronalUnidade.id,
                      salario_base: pendente.salarioInformado,
                      vigencia_inicio: form.data_admissao || new Date().toISOString().slice(0, 10),
                    });
                    await queryClient.refetchQueries({ queryKey: ["dp_cargo_salarios"] });
                  } catch (err) {
                    setCargoSemSalario(pendente);
                    toast.error("Não foi possível gravar o piso do sindicato patronal", {
                      description: `${mensagemErroPiso(err)} Você pode usar “Só para este colaborador” para salvar o cadastro agora.`,
                    });
                    setSalvandoPiso(false);
                    return;
                  }
                  cargoResolvido.current = true;
                  setSalvandoPiso(false);
                  await submit();
                }}
              >
                {salvandoPiso ? "Salvando..." : "Definir piso do patronal"}
              </AlertDialogAction>
            )}

          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UnidadeAdiantamentoDialog
        unidade={unidadeSelecionada ?? null}
        open={adiantamentoOpen}
        onOpenChange={setAdiantamentoOpen}
      />

      {/* Saída com alterações não salvas — sem window.confirm. */}
      <AlertDialog open={confirmarSaida} onOpenChange={setConfirmarSaida}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair sem salvar?</AlertDialogTitle>
            <AlertDialogDescription>
              Há alterações que ainda não foram gravadas neste cadastro.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmarSaida(false)}>
              Continuar editando
            </AlertDialogCancel>
            <Button
              variant="ghost"
              onClick={() => { setConfirmarSaida(false); onOpenChange(false); }}
            >
              Sair sem salvar
            </Button>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setConfirmarSaida(false);
                void submit("close");
              }}
            >
              Salvar e sair
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>



      {/* Alcance do padrão de remuneração: perguntado só quando há diferença real. */}
      <AlertDialog open={perguntarPadrao} onOpenChange={(o) => { if (!o) void responderPadrao(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Onde salvar este padrão de remuneração?</AlertDialogTitle>
            <AlertDialogDescription>
              Assiduidade, tolerância, vale-alimentação, vale-transporte e a ficha de benefícios podem
              virar padrão de remuneração para os próximos cadastros. Escolha o alcance.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {padraoAplicavel && (
            <div className="rounded-xl border bg-muted/40 p-3 text-xs">
              <p className="font-medium text-foreground">
                Diferenças em relação ao padrão{" "}
                {nivelPadrao(padraoAplicavel) === "cargo"
                  ? "do cargo"
                  : nivelPadrao(padraoAplicavel) === "unidade"
                    ? "da unidade"
                    : "da empresa"}
              </p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {diferencasPadrao(extrairPadrao(rem), padraoAplicavel.payload)
                  .slice(0, 6)
                  .map((d) => (
                    <li key={d.campo}>
                      {d.rotulo}: {d.padrao} → <span className="text-foreground">{d.atual}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}



          <RadioGroup
            value={escopoPadrao}
            onValueChange={(v) => setEscopoPadrao(v as PadraoEscopo)}
            className="gap-3 py-2 text-sm"
          >
            {form.cargo_id && form.unidade_id && (
              <label className="flex cursor-pointer items-start gap-3">
                <RadioGroupItem value="cargo" className="mt-0.5" />
                <span>
                  <span className="font-medium">Padrão do cargo</span>
                  <span className="block text-xs text-muted-foreground">
                    {cargoSelecionado?.nome ?? "Cargo"} em {unidadeSelecionada?.nome ?? "esta unidade"}
                  </span>
                </span>
              </label>
            )}
            {form.unidade_id && (
              <label className="flex cursor-pointer items-start gap-3">
                <RadioGroupItem value="unidade" className="mt-0.5" />
                <span>
                  <span className="font-medium">Padrão da unidade</span>
                  <span className="block text-xs text-muted-foreground">
                    Todos os cargos de {unidadeSelecionada?.nome ?? "esta unidade"}
                  </span>
                </span>
              </label>
            )}
            <label className="flex cursor-pointer items-start gap-3">
              <RadioGroupItem value="empresa" className="mt-0.5" />
              <span>
                <span className="font-medium">Padrão da empresa</span>
                <span className="block text-xs text-muted-foreground">
                  Vale para as unidades sem padrão próprio
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <RadioGroupItem value="colaborador" className="mt-0.5" />
              <span>
                <span className="font-medium">Somente deste colaborador</span>
                <span className="block text-xs text-muted-foreground">
                  Não altera nenhum padrão
                </span>
              </span>
            </label>
          </RadioGroup>

          {escopoPadrao === "colaborador" && (
            <div className="rounded-xl border border-dashed border-amber-500/50 bg-amber-500/10 p-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Princípio da equidade:</span> benefícios
              diferentes para um colaborador que exerce a mesma função, na mesma unidade, precisam de
              justificativa objetiva (tempo de casa, produtividade, acordo coletivo). Diferenças sem
              critério podem ser questionadas como quebra de isonomia salarial.
            </div>
          )}

          {escopoPadrao !== "colaborador" && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">O que replicar?</p>
              <div className="space-y-2">
                {/* Só o que divergiu do padrão vigente: sobre o resto não há o que decidir. */}
                {(gruposDiferentes.length ? gruposDiferentes : [...GRUPOS_PADRAO]).map((grupo) => {
                  const marcado = gruposPadrao.includes(grupo);
                  const ehDesligamento = tipoDivergencia(grupo) === "desligamento";
                  const alvosImpacto =
                    alcancePadrao === "selecionados"
                      ? colaboradoresDoAlcance.filter((c) =>
                          idsSelecionadosValidos.includes(String(c.id)),
                        )
                      : colaboradoresDoAlcance;
                  const perdem = ehDesligamento ? quemPerdeBeneficio(alvosImpacto, grupo) : 0;
                  return (
                    <label
                      key={grupo}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-xs"
                    >
                      <Checkbox
                        checked={marcado}
                        onCheckedChange={(v) =>
                          setGruposPadrao((atual) =>
                            v === true
                              ? GRUPOS_PADRAO.filter((g) => g === grupo || atual.includes(g))
                              : atual.filter((g) => g !== grupo),
                          )
                        }
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-foreground">
                            {ROTULOS_GRUPO[grupo]}
                          </span>
                          {ehDesligamento ? (
                            <Badge variant="destructive" className="text-[10px]">
                              desligado neste cadastro
                            </Badge>
                          ) : (
                            gruposDiferentes.includes(grupo) && (
                              <Badge variant="outline" className="text-[10px]">
                                diferente do padrão atual
                              </Badge>
                            )
                          )}
                        </span>
                        <span className="block text-muted-foreground">
                          {ehDesligamento
                            ? `Marcar remove ${ROTULOS_GRUPO[grupo].toLowerCase()} do padrão e de quem estiver no alcance.`
                            : resumoGrupo(extrairPadrao(rem), grupo)}
                        </span>
                        {ehDesligamento && marcado && alcancePadrao !== "novos" && (
                          <span className="mt-1 block rounded-lg bg-destructive/10 p-2 text-destructive">
                            {perdem > 0
                              ? `${perdem} colaborador(es) ativo(s) perderão ${ROTULOS_GRUPO[grupo].toLowerCase()}.`
                              : "Nenhum colaborador ativo do alcance tem este benefício hoje."}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
              {!gruposPadrao.length && (
                <p className="text-xs text-destructive">
                  Marque ao menos um item para salvar como padrão de remuneração.
                </p>
              )}
            </div>
          )}


          {escopoPadrao !== "colaborador" && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">Aplicar a quem?</p>
              <RadioGroup
                value={alcancePadrao}
                onValueChange={(v) => setAlcancePadrao(v as PadraoAlcance)}
                className="gap-2"
              >
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-xs">
                  <RadioGroupItem value="novos" className="mt-0.5" />
                  <span>
                    <span className="font-medium text-foreground">Somente novos cadastros</span>
                    <span className="block text-muted-foreground">
                      Ninguém já cadastrado é alterado; os próximos nascem preenchidos.
                      {divergentesNoAlcance > 0
                        ? ` Atenção: ${divergentesNoAlcance} colaborador(es) ativo(s) continuam fora destes valores.`
                        : ""}
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-xs">
                  <RadioGroupItem value="todos" className="mt-0.5" />
                  <span>
                    <span className="font-medium text-foreground">
                      Todos os colaboradores deste alcance
                      {colaboradoresNoAlcance > 0 ? ` (${colaboradoresNoAlcance})` : ""}
                      {divergentesNoAlcance > 0 ? ` — ${divergentesNoAlcance} fora do padrão` : ""}
                    </span>

                    <span className="block text-muted-foreground">
                      Sobrescreve {rotulosGruposSelecionados} de quem já está cadastrado e ativo
                      {escopoPadrao !== "cargo"
                        ? ", e apaga os padrões mais específicos que estejam em conflito."
                        : "."}
                      {divergentesNoAlcance > 0
                        ? ` ${divergentesNoAlcance} está(ão) hoje fora destes valores.`
                        : ""}
                    </span>
                  </span>
                 </label>

                {/* Meio-termo: escolher na mão quem recebe o padrão. */}
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-xs">
                  <RadioGroupItem value="selecionados" className="mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-foreground">
                      Colaboradores escolhidos
                      {alcancePadrao === "selecionados"
                        ? ` (${idsSelecionadosValidos.length} de ${colaboradoresDoAlcance.length} selecionados)`
                        : ""}
                    </span>
                    <span className="block text-muted-foreground">
                      Sobrescreve {rotulosGruposSelecionados} apenas de quem você marcar. Os
                      padrões mais específicos são preservados.
                    </span>
                  </span>
                </label>
              </RadioGroup>

              {alcancePadrao === "selecionados" && (
                <div className="space-y-2 rounded-xl border p-3">
                  <Input
                    value={buscaSelecao}
                    onChange={(e) => setBuscaSelecao(e.target.value)}
                    placeholder="Buscar por nome"
                    className="h-8 text-xs"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() =>
                        setSelecionadosPadrao(colaboradoresDoAlcance.map((c) => String(c.id)))
                      }
                    >
                      Selecionar todos
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => setSelecionadosPadrao(idsDivergentesNoAlcance)}
                    >
                      Só os fora do padrão ({idsDivergentesNoAlcance.length})
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => setSelecionadosPadrao([])}
                    >
                      Limpar
                    </Button>
                  </div>
                  <ScrollArea className="h-52 pr-3">
                    <div className="space-y-1">
                      {colaboradoresSelecionaveis.map((c) => {
                        const id = String(c.id);
                        const fora = idsDivergentesNoAlcance.includes(id);
                        return (
                          <label
                            key={id}
                            className="flex cursor-pointer items-start gap-2 rounded-lg p-2 hover:bg-muted/50"
                          >
                            <Checkbox
                              checked={selecionadosPadrao.includes(id)}
                              onCheckedChange={(v) => alternarSelecionado(id, v === true)}
                              className="mt-0.5"
                            />
                            <span className="min-w-0">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-foreground">
                                  {String(c.nome ?? "Sem nome")}
                                </span>
                                {fora && (
                                  <Badge variant="outline" className="text-[10px]">
                                    fora do padrão
                                  </Badge>
                                )}
                              </span>
                              <span className="block text-muted-foreground">
                                {[
                                  (c as any).dp_cargos?.nome ?? c.cargo ?? null,
                                  (c as any).dp_unidades?.nome ?? null,
                                ]
                                  .filter(Boolean)
                                  .join(" • ") || "Sem cargo definido"}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                      {!colaboradoresSelecionaveis.length && (
                        <p className="p-2 text-xs text-muted-foreground">
                          Nenhum colaborador ativo encontrado neste alcance.
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                  {!idsSelecionadosValidos.length && (
                    <p className="text-xs text-destructive">
                      Marque ao menos um colaborador para aplicar o padrão.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}


          <AlertDialogFooter>
            <Button variant="ghost" onClick={() => void responderPadrao(null, true)}>
              Não perguntar de novo
            </Button>
            <AlertDialogCancel onClick={() => void responderPadrao(null)}>Agora não</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                salvarPadraoBeneficios.isPending ||
                (escopoPadrao !== "colaborador" && !gruposPadrao.length) ||
                (escopoPadrao !== "colaborador" &&
                  alcancePadrao === "selecionados" &&
                  !idsSelecionadosValidos.length)
              }
              onClick={(e) => { e.preventDefault(); void responderPadrao(escopoPadrao); }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Adicionais de risco: característica do cargo, não da unidade. */}
      <AlertDialog
        open={perguntarRisco}
        onOpenChange={(o) => { if (!o) void responderRisco("colaborador"); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Este adicional de risco é do cargo?</AlertDialogTitle>
            <AlertDialogDescription>
              Insalubridade e periculosidade são características da função. Os percentuais desta
              ficha estão diferentes dos cadastrados em {cargoSelecionado?.nome ?? "cargo"}.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {divergenciaRisco.tipo !== "igual" && (
            <div className="rounded-xl border bg-muted/40 p-3 text-xs">
              <p className="text-muted-foreground">
                No cargo: <span className="text-foreground">{textoRisco(divergenciaRisco.cargo)}</span>
              </p>
              <p className="text-muted-foreground">
                Nesta ficha: <span className="text-foreground">{textoRisco(divergenciaRisco.ficha)}</span>
              </p>
            </div>
          )}

          {divergenciaRisco.tipo === "reducao" && (
            <div className="rounded-xl border border-dashed border-amber-500/50 bg-amber-500/10 p-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Atenção:</span> esta ficha reduz ou zera um
              adicional previsto para o cargo. Aplicar ao cargo retira o adicional dos colegas que
              exercem a mesma função — só faça isso se o risco realmente deixou de existir.
            </div>
          )}

          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction
              className="w-full"
              disabled={upsertCargo.isPending || propagarRiscos.isPending}
              onClick={(e) => { e.preventDefault(); void responderRisco("cargo_todos"); }}
            >
              Aplicar ao cargo e aos {cargoSelecionado?.colaboradores_count ?? 0} colaborador(es)
            </AlertDialogAction>
            <Button
              variant="outline"
              className="w-full"
              disabled={upsertCargo.isPending}
              onClick={() => void responderRisco("cargo")}
            >
              Aplicar só ao cargo {cargoSelecionado?.nome ?? ""}
            </Button>
            <AlertDialogCancel className="mt-0 w-full" onClick={() => void responderRisco("colaborador")}>
              Só este colaborador
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>




      {risco && risco.verMaisLabel && (

        <RegimeRiscoDialog
          open={riscoOpen}
          onOpenChange={setRiscoOpen}
          tipo={risco.tipo}
          onEscolher={(regime) => {
            setForm({ ...form, tipo_vinculo: regime === "clt" ? "CLT" : "Intermitente" });
            setRiscoOpen(false);
          }}
        />
      )}
    </Dialog>


  );
}
