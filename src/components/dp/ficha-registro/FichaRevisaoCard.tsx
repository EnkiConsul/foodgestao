import { useMemo, useState } from "react";
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
import { FichaComparacaoDialog } from "./FichaComparacaoDialog";
import {
  jornadaDaFicha, useAplicarFicha, useIgnorarFicha, type FichaItem,
} from "@/hooks/useDpFichaImportacao";
import { notifyError } from "@/lib/notifyError";
import { anexarSomenteFicha, useDpPreadmissao } from "@/hooks/dp/useDpPreadmissoes";
import {
  dadosParaCadastro, divergenciasAdmin, divergenciasAdminSemEscolha, divergenciasFicha,
  divergenciasSemEscolha, resolverPorNome, type EscolhaDivergencia,
} from "@/lib/dp/preadmissao/comparacaoFicha";



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
}

export function FichaRevisaoCard({
  item, cargos, unidades, setores = [], turnos = [], unidadePadraoId, empresaCnpj,
  setorPadraoId = null, regimePadrao = null, onAbrirCadastro, preadmissaoId = null,
}: Props) {
  const extraidos = (item.dados_extraidos ?? {}) as Record<string, unknown>;
  const confianca = (item.confianca_campos ?? {}) as Record<string, string>;

  const [dados, setDados] = useState<Record<string, unknown>>(() => ({ ...extraidos }));
  const cargoSugerido = useMemo(
    () => matchCargo({ cargo_nome: (dados.cargo_nome as string) ?? null, cbo: (dados.cbo as string) ?? null }, cargos),
    [dados.cargo_nome, dados.cbo, cargos],
  );
  const unidadeSugerida = useMemo(() => matchUnidade(dados, unidades, empresaCnpj), [dados, unidades, empresaCnpj]);
  const [cargoId, setCargoId] = useState<string | null>(cargoSugerido.cargo_id);
  const [unidadeId, setUnidadeId] = useState<string | null>(
    unidadeSugerida.unidade_id ?? unidadePadraoId ?? unidades[0]?.id ?? null,
  );
  const [setorEscolhido, setSetorEscolhido] = useState<string | null>(null);
  const [regimeEscolhido, setRegimeEscolhido] = useState<string | null>(null);
  const setorId = setorEscolhido ?? setorPadraoId ?? null;
  const regime = regimeEscolhido ?? regimePadrao ?? null;
  const [completarAberto, setCompletarAberto] = useState(false);
  const [usarJornada, setUsarJornada] = useState(true);
  const [atualizar, setAtualizar] = useState(!!item.colaborador_existente_id);
  const [anexarFicha, setAnexarFicha] = useState(true);
  const [formaPagamento, setFormaPagamento] = useState<string | null>(null);
  const [possuiFolhaPonto, setPossuiFolhaPonto] = useState<boolean | null>(null);
  const [optanteAdiantamento, setOptanteAdiantamento] = useState<boolean | null>(null);
  const [trechos, setTrechos] = useState<Record<string, boolean>>({});
  const [verTexto, setVerTexto] = useState(false);
  const [cargoDialog, setCargoDialog] = useState(false);
  const [comparacao, setComparacao] = useState(false);
  const [confirmouEmpresa, setConfirmouEmpresa] = useState(false);
  const [whatsappEditado, setWhatsappEditado] = useState(false);
  const empresaDivergente = unidadeSugerida.empresaConfere === "nao";
  const bloqueadoPorEmpresa = empresaDivergente && !confirmouEmpresa;

  const setoresDaUnidade = useMemo(
    () => (unidadeId ? setores.filter((s) => !s.unidade_id || s.unidade_id === unidadeId) : setores),
    [setores, unidadeId],
  );

  const jornada = useMemo(() => jornadaDaFicha(dados), [dados]);
  const turnoSugerido = useMemo(() => matchTurno(jornada, turnos, unidadeId), [jornada, turnos, unidadeId]);
  const [turnoId, setTurnoId] = useState<string | null>(null);
  const turnoEscolhido = turnoId ?? turnoSugerido.turno_id;
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
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const executar = (camposPermitidos: string[] | null) => {
    if (!regime || !formaPagamento || possuiFolhaPonto === null || optanteAdiantamento === null) {
      setCompletarAberto(true);
      toast.error("Confirme vínculo, pagamento, ponto e adiantamento antes de criar o cadastro.");
      return;
    }
    if (preadmissaoId && faltaDecidir > 0) {
      toast.error("Escolha, em cada divergência, qual valor vale antes de concluir.");
      return;
    }
    const decidido = preadmissaoId ? vinculoDecidido() : null;
    const dadosEnvio = preadmissaoId ? dadosParaCadastro(stagingDados, dados, escolhas) : dados;
    aplicar.mutate(
      {
        item,
        dados: dadosEnvio,
        cargoId: decidido?.cargoId ?? cargoId,
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
        onSuccess: () => {
          setComparacao(false);
          toast.success(
            preadmissaoId
              ? "Pré-admissão concluída e cadastro criado"
              : atualizar
              ? "Cadastro atualizado"
              : "Colaborador cadastrado",
          );
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
  const setEndereco = (parte: string, valor: string) =>
    setDados((d) => ({
      ...d,
      endereco: { ...((d.endereco ?? {}) as Record<string, unknown>), [parte]: valor },
    }));

  const campoEndereco = (label: string, parte: string, className?: string) => (
    <div className={cn("space-y-1", className)}>
      <Label className="text-xs">{label}</Label>
      <Input
        className="h-9"
        value={typeof endereco[parte] === "string" ? String(endereco[parte]) : ""}
        onChange={(e) => setEndereco(parte, e.target.value)}
        disabled={aplicado || ignorado}
      />
    </div>
  );


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
    <Card className={cn(aplicado && "border-emerald-500/40")}>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold">{(dados.nome as string) ?? "Ficha sem nome"}</p>
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
            <div className="space-y-1">
              <Label className="text-xs">Cargo cadastrado</Label>
              <Select value={cargoId ?? "__none"} onValueChange={(v) => setCargoId(v === "__none" ? null : v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Escolher" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sem cargo</SelectItem>
                  {cargos.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {cargoSugerido.cargo_id && cargoSugerido.cargo_id === cargoId && (
                <p className="text-[11px] text-muted-foreground">Sugerido pela ficha ({cargoSugerido.motivo === "cbo" ? "pelo código CBO" : "pelo nome"}).</p>
              )}
              {!cargoSugerido.cargo_id && !!dados.cargo_nome && (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    Nenhum cargo parecido com “{String(dados.cargo_nome)}”.
                  </p>
                  <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => setCargoDialog(true)}>
                    <Plus className="mr-1 h-3 w-3" /> Criar este cargo
                  </Button>
                </div>
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
                {faltando.length > 0 ? (
                  <Badge variant="outline" className="border-amber-500/50 text-[11px] text-amber-600 dark:text-amber-400">
                    {faltando.length} campo(s) em branco
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
                    <Label className="text-xs">Vínculo</Label>
                    <Select
                      value={regime ?? "__none"}
                      onValueChange={(v) => setRegimeEscolhido(v === "__none" ? null : v)}
                    >
                      <SelectTrigger className="h-9"><SelectValue placeholder="Escolher" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Não informado</SelectItem>
                        {REGIMES.map((r) => (
                          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Forma de pagamento *</Label>
                    <Select value={formaPagamento ?? "__none"} onValueChange={(v) => setFormaPagamento(v === "__none" ? null : v)}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Confirmar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Confirmar forma</SelectItem>
                        <SelectItem value="mensalista">Mensalista</SelectItem>
                        <SelectItem value="horista">Horista</SelectItem>
                        <SelectItem value="diarista">Diarista</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Folha de ponto *</Label>
                    <Select value={possuiFolhaPonto === null ? "__none" : String(possuiFolhaPonto)} onValueChange={(v) => setPossuiFolhaPonto(v === "__none" ? null : v === "true")}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Confirmar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Confirmar opção</SelectItem>
                        <SelectItem value="true">Ativa</SelectItem>
                        <SelectItem value="false">Não utiliza</SelectItem>
                      </SelectContent>
                    </Select>
                    {unidades.find((u) => u.id === unidadeId)?.possui_relogio_ponto && possuiFolhaPonto === null && (
                      <p className="text-[11px] text-muted-foreground">Sugestão: ativa, pois a unidade possui relógio de ponto.</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Adiantamento salarial *</Label>
                    <Select value={optanteAdiantamento === null ? "__none" : String(optanteAdiantamento)} onValueChange={(v) => setOptanteAdiantamento(v === "__none" ? null : v === "true")}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Confirmar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Confirmar opção</SelectItem>
                        <SelectItem value="true">Optante</SelectItem>
                        <SelectItem value="false">Não optante</SelectItem>
                      </SelectContent>
                    </Select>
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

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                  {campoEndereco("Rua", "logradouro", "lg:col-span-3")}
                  {campoEndereco("Número", "numero")}
                  {campoEndereco("Bairro", "bairro", "lg:col-span-2")}
                  {campoEndereco("Cidade", "cidade", "lg:col-span-3")}
                  {campoEndereco("UF", "uf")}
                  {campoEndereco("CEP", "cep", "lg:col-span-2")}
                </div>

                <p className="text-[11px] text-muted-foreground">
                  Benefícios, dados bancários e jornada detalhada continuam no cadastro completo do colaborador.
                </p>
              </div>
            )}
          </div>
        )}



        {!jornada.vazia && (
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Horário da ficha</p>
              {!aplicado && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Cadastrar</Label>
                  <Switch checked={usarJornada} onCheckedChange={setUsarJornada} />
                </div>
              )}
            </div>
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
            {jornada.vira_meia_noite && (
              <p className="mt-2 text-[11px] text-muted-foreground">A saída acontece no dia seguinte.</p>
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

        {aplicado && item.colaborador_id && onAbrirCadastro && (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => onAbrirCadastro(item.colaborador_id!)}>
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
                aplicar.isPending ||
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
              {aplicar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
              {preadmissaoId
                ? "Concluir admissão com esta ficha"
                : atualizar && item.colaborador_existente_id
                  ? "Comparar e atualizar"
                  : "Criar cadastro"}
            </Button>
          </div>
        )}

        {cargoDialog && (
          <CargoCorrespondenciaDialog
            open={cargoDialog}
            onOpenChange={setCargoDialog}
            cargoNome={String(dados.cargo_nome ?? "")}
            cbo={(dados.cbo as string) ?? null}
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

