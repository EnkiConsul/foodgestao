import { useEffect, useMemo, useRef, useState } from "react";
import { abrirNoApp } from "@/lib/visualizadorGlobal";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, ChevronUp, FileText, Loader2, Plus, Send, Upload, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmarAcaoDialog } from "@/components/dp/ConfirmarAcaoDialog";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { FichaRevisaoCard } from "@/components/dp/ficha-registro/FichaRevisaoCard";
import { FranquiaColaboradoresAviso, useEstadoFranquia } from "@/components/billing/FranquiaColaboradoresAviso";
import { FichaHistoricoPainel } from "@/components/dp/ficha-registro/FichaHistoricoPainel";
import { ColaboradorFormDialog } from "@/components/dp/ColaboradorFormDialog";
import { ConferenciaFichaGaveta } from "@/components/dp/ficha-registro/lote/ConferenciaFichaGaveta";
import { FichaLoteEtapas, type EtapaLote } from "@/components/dp/ficha-registro/lote/FichaLoteEtapas";
import { FichaLoteUnidade } from "@/components/dp/ficha-registro/lote/FichaLoteUnidade";
import { FichaLoteCargos } from "@/components/dp/ficha-registro/lote/FichaLoteCargos";
import { FichaLoteLista } from "@/components/dp/ficha-registro/lote/FichaLoteLista";
import { NotificarResponsavelDialog } from "@/components/dp/ficha-registro/lote/NotificarResponsavelDialog";
import { EfetivarLoteDialog } from "@/components/dp/ficha-registro/lote/EfetivarLoteDialog";
import { CienciaIntervaloLoteCard } from "@/components/dp/ficha-registro/lote/CienciaIntervaloLoteCard";
import { inconformidadesJornada, jornadaDosDadosDaFicha } from "@/lib/dp/ficha-registro/jornada-parse";
import { registrarCienciaRegra } from "@/lib/dp/regras-oficial";
import { planejarLote } from "@/lib/dp/ficha-registro/efetivacao-lote";
import { useDpSalarioCargoResolver } from "@/hooks/useDpSalarioCargoResolver";
import {
  FichaLotePadroesCard, type AberturaPadroes,
} from "@/components/dp/ficha-registro/lote/FichaLotePadroesCard";
import { ContatosLoteDialog, type LinhaContatoLote } from "@/components/dp/ficha-registro/lote/ContatosLoteDialog";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  agruparCargosLote, ajustesEmGrupo, dadosDaFichaLote, escolhaDaFicha, montarContatosLote, resumoRepasse, rotuloSetor, semDadosAcesso,
  vinculoOrganizado, type ContatoEditado, type EscolhasLote, type OrganizacaoLote,
} from "@/lib/dp/ficha-registro/organizacao-lote";
import { useDpCargos, useDpSindicatos, useDpUnidades } from "@/hooks/useDpCadastros";
import { useDpSindicatosCatalogo } from "@/hooks/useDpSindicatosCatalogo";
import { laboralPadraoDaUnidade } from "@/lib/dp/sindicatos-catalogo";
import { useDpSetores } from "@/hooks/useDpSetores";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { useDpTurnos } from "@/hooks/useDpTurnos";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import {
  useDpFichaImportacoes, useDpFichaItens, useEnviarFichaPdf,
  useCancelarLeituraFicha, useTentarNovamenteFicha, MOTIVO_CANCELADA, useOrganizarLoteFicha,
  useAjustarLoteFicha, jornadaDaFicha, useDpFichaResumoEnvios, useReativarFicha,
} from "@/hooks/useDpFichaImportacao";
import { envioEmAndamento, envioParaAbrir, situacaoEnvio } from "@/lib/dp/ficha-registro/lote-andamento";
import { notifyError } from "@/lib/notifyError";
import { divergenciaLote } from "@/lib/dp/ficha-registro/lote-empresa";
import { leituraTravada } from "@/lib/dp/ficha-registro/leituraTravada";
import { digitsCnpj, formatCnpj, matchUnidade } from "@/lib/dp/ficha-registro/unidade-match";
import { cn } from "@/lib/utils";

/** Vínculos do cadastro (enum dp_regime_trabalho) — igual ao card de conferência. */
const REGIMES: Array<{ value: string; label: string }> = [
  { value: "clt", label: "CLT efetivo" },
  { value: "intermitente", label: "CLT intermitente" },
  { value: "estagio", label: "Estagiário" },
  { value: "temporario", label: "Temporário" },
  { value: "pj", label: "PJ / Sócio" },
  { value: "mei", label: "MEI" },
  { value: "freelancer", label: "Freelancer (sem registro)" },
];


export default function DpFichaRegistroImportar() {
  const { selectedCompanyId, companies, setContext } = useCompanyContext();
  /** Quando a conferência é a da ficha oficial de uma Pré-Admissão. */
  const [params] = useSearchParams();
  const preadmissaoId = params.get("preadmissao");
  /** Promoção de folguista / pessoa em teste por ficha de registro. */
  const pessoaApoioId = params.get("apoio");
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [verTodosEnvios, setVerTodosEnvios] = useState(false);
  /** `?lote=` vem do aviso enviado ao responsável: abre direto aquele envio. */
  const loteParam = params.get("lote");
  const [importacaoId, setImportacaoId] = useState<string | null>(() => loteParam);

  /**
   * O aviso do sino pode chegar com outra empresa aberta: descobrimos de quem é
   * o lote e trocamos de empresa uma única vez antes de mostrar as fichas.
   */
  const { data: empresaDoLoteId = null } = useQuery({
    queryKey: ["dp_ficha_importacao_empresa", loteParam],
    enabled: !!loteParam,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_ficha_importacoes").select("company_id").eq("id", loteParam!).maybeSingle();
      if (error) throw error;
      return (data?.company_id as string | null) ?? null;
    },
  });
  const loteResolvido = useRef(false);
  useEffect(() => {
    if (!loteParam || !empresaDoLoteId || loteResolvido.current) return;
    loteResolvido.current = true;
    if (empresaDoLoteId === selectedCompanyId) return;
    const destino = companies.find((c) => c.id === empresaDoLoteId);
    if (!destino) return;
    setContext("pj", destino.id);
    setImportacaoId(loteParam);
    toast.info(`Abrimos a empresa ${destino.trade_name || destino.name} para mostrar este lote.`);
  }, [loteParam, empresaDoLoteId, selectedCompanyId, companies, setContext]);

  const { data: importacoes = [] } = useDpFichaImportacoes();
  const enviar = useEnviarFichaPdf();
  const cancelar = useCancelarLeituraFicha();
  const repetir = useTentarNovamenteFicha();

  /** Quantas fichas cada envio ainda tem para conferir (decide qual abrir e o texto da lista). */
  const idsEnvios = useMemo(() => importacoes.map((i) => i.id), [importacoes]);
  const resumoEnviosQ = useDpFichaResumoEnvios(idsEnvios);
  const resumoEnvios = useMemo(() => resumoEnviosQ.data ?? {}, [resumoEnviosQ.data]);
  const resumoPronto = idsEnvios.length === 0 || resumoEnviosQ.isFetched || resumoEnviosQ.isError;
  /**
   * Sem escolha da pessoa, abre o envio com trabalho pela metade (fichas a
   * conferir ou em leitura) — não o mais recente —, para quem volta à tela
   * continuar o que começou em vez de reenviar o PDF.
   */
  const envioPadrao = useMemo(() => envioParaAbrir(importacoes, resumoEnvios), [importacoes, resumoEnvios]);
  const atual = useMemo(
    () => importacoes.find((i) => i.id === importacaoId) ?? (resumoPronto ? envioPadrao : null),
    [importacoes, importacaoId, resumoPronto, envioPadrao],
  );
  const processando = atual?.status === "processing";
  const aguardandoFichas = atual?.status === "ready" && (atual?.fichas_identificadas ?? 0) > 0;
  const { data: itens = [] } = useDpFichaItens(atual?.id, processando, aguardandoFichas);

  const { data: cargos = [] } = useDpCargos();
  const { data: unidades = [] } = useDpUnidades();
  const { turnos = [] } = useDpTurnos();
  const unidadesDaEmpresa = useMemo(
    () => unidades
      .filter((u) => u.company_id === selectedCompanyId)
      .map((u) => ({
        id: u.id,
        nome: u.nome,
        cnpj: (u as { cnpj?: string | null }).cnpj ?? null,
        possui_relogio_ponto: (u as { possui_relogio_ponto?: boolean | null }).possui_relogio_ponto ?? false,
      })),
    [unidades, selectedCompanyId],
  );
  const { data: empresaCnpj = null } = useQuery({
    queryKey: ["company_cnpj", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies").select("cnpj").eq("id", selectedCompanyId!).maybeSingle();
      if (error) throw error;
      return (data?.cnpj as string | null) ?? null;
    },
  });
  const { setores: setoresEmpresa } = useDpSetores();
  const setoresAtivos = useMemo(
    () => setoresEmpresa
      .filter((s) => s.ativo !== false)
      .map((s) => ({ id: s.id, nome: s.nome, unidade_id: s.unidade_id })),
    [setoresEmpresa],
  );

  // Setor e vínculo aplicados a todas as fichas (cargo, unidade e horário seguem ficha por ficha).
  const [setorPadraoId, setSetorPadraoId] = useState<string | null>(null);
  const [regimePadrao, setRegimePadrao] = useState<string | null>(null);
  /** No lote, o envio de arquivo e o histórico ficam recolhidos para a esteira subir. */
  const [envioAberto, setEnvioAberto] = useState(false);

  const { data: colaboradores = [] } = useDpColaboradores();
  const [cadastroAbertoId, setCadastroAbertoId] = useState<string | null>(null);
  const colaboradorAberto = useMemo(
    () => colaboradores.find((c) => c.id === cadastroAbertoId) ?? null,
    [colaboradores, cadastroAbertoId],
  );

  useEffect(() => {
    if (!importacaoId && resumoPronto && envioPadrao) setImportacaoId(envioPadrao.id);
  }, [importacaoId, resumoPronto, envioPadrao]);
  /** Outros envios que também esperam conferência (aparecem no cartão do topo). */
  const outrosEmAndamento = useMemo(
    () => importacoes.filter((i) => i.id !== atual?.id && envioEmAndamento(i, resumoEnvios[i.id])),
    [importacoes, atual?.id, resumoEnvios],
  );

  const pendentes = itens.filter((i) => ["pendente", "revisar", "duplicado"].includes(i.status));
  const prontos = itens.filter((i) => ["criado", "atualizado"].includes(i.status));
  const ignoradas = itens.filter((i) => i.status === "ignorado");
  // Avisa no início do lote quantos cadastros novos cabem na franquia.
  const novasFichas = pendentes.filter((i) => !i.colaborador_existente_id).length;
  const estadoFranquiaLote = useEstadoFranquia(novasFichas > 0 ? pendentes[0]?.company_id : null, novasFichas);

  /** Relógio de tela: usado só para perceber leitura que parou de responder. */
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (!processando) return;
    const t = window.setInterval(() => setAgora(Date.now()), 10000);
    return () => window.clearInterval(t);
  }, [processando]);
  const travada = !!atual && leituraTravada(atual, agora);

  /** O arquivo é de outro CNPJ? Avisamos antes de conferir ficha por ficha. */
  const divergencia = useMemo(
    () => divergenciaLote(itens, unidadesDaEmpresa, empresaCnpj),
    [itens, unidadesDaEmpresa, empresaCnpj],
  );
  const empresaAtual = companies.find((c) => c.id === selectedCompanyId) ?? null;
  const empresaDoArquivo = useMemo(() => {
    const alvo = divergencia.cnpjs[0];
    if (!alvo) return null;
    return companies.find((c) => digitsCnpj(c.cnpj) === alvo) ?? null;
  }, [companies, divergencia.cnpjs]);
  const [conferirMesmoAssim, setConferirMesmoAssim] = useState(false);
  const bloqueadoPorEmpresa = divergencia.divergente && !conferirMesmoAssim;

  // ── Lote guiado: unidade → cargos e setores → conferência ficha a ficha ──
  const { isSuperAdmin } = useSuperAdmin();
  const isMobile = useIsMobile();
  const organizar = useOrganizarLoteFicha();
  const organizacao = ((atual as { organizacao?: unknown } | null)?.organizacao ?? null) as OrganizacaoLote | null;
  const modoLote = !preadmissaoId && !pessoaApoioId && atual?.status === "ready" && itens.length > 1;
  const cargosLista = useMemo(() => cargos.map((c) => ({ id: c.id, nome: c.nome, cbo: c.cbo })), [cargos]);
  const grupos = useMemo(() => agruparCargosLote(itens, cargosLista), [itens, cargosLista]);
  const [etapa, setEtapa] = useState<EtapaLote | null>(null);
  const [unidadeLote, setUnidadeLote] = useState<string | null>(null);
  const [sindicatoLote, setSindicatoLote] = useState<string | null | undefined>(undefined);
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [notificarAberto, setNotificarAberto] = useState(false);
  useEffect(() => {
    setEtapa(null);
    setUnidadeLote(null);
    setSindicatoLote(undefined);
    setAbertoId(null);
  }, [atual?.id]);
  const etapaAtual: EtapaLote = etapa ?? (organizacao?.organizado_em ? 3 : 1);
  const unidadeLida = useMemo(
    () => (itens[0] ? matchUnidade(itens[0].dados_extraidos as Record<string, unknown>, unidadesDaEmpresa, empresaCnpj) : null),
    [itens, unidadesDaEmpresa, empresaCnpj],
  );
  const unidadeLoteId =
    unidadeLote ?? organizacao?.unidade_id ?? unidadeLida?.unidade_id ?? unidadesDaEmpresa[0]?.id ?? null;
  const unidadeDoLote = unidades.find((u) => u.id === unidadeLoteId) as
    | { tem_adiantamento?: boolean | null; possui_relogio_ponto?: boolean | null }
    | undefined;
  const unidadeSemAdiantamento = unidadeDoLote?.tem_adiantamento === false;
  /**
   * Padrões salvos no lote. Adiantamento sem escolha entra como não optante (o
   * mesmo que o servidor grava) e pode ser mudado depois no cadastro.
   */
  const padroesSalvos = organizacao?.padroes ?? {};
  const adiantamentoPadrao: boolean = padroesSalvos.adiantamento ?? false;
  const padroesEmVigor: EscolhasLote = {
    regime: padroesSalvos.regime ?? null,
    forma_pagamento: padroesSalvos.forma_pagamento ?? null,
    adiantamento: adiantamentoPadrao,
    turno_id: padroesSalvos.turno_id ?? null,
  };
  /** Ciência única do lote para intervalo de 30 a 59 min (CLT art. 71 e 611-A, III). */
  const cienciaIntervalo = padroesSalvos.intervalo_reduzido_ciencia ?? null;
  const padroesLote = useMemo(
    () => ({
      regime: padroesSalvos.regime ?? null,
      adiantamento: adiantamentoPadrao,
      unidadeTemPonto: !!unidadeDoLote?.possui_relogio_ponto,
      intervaloReduzidoAceito: !!cienciaIntervalo,
    }),
    [padroesSalvos.regime, adiantamentoPadrao, unidadeDoLote?.possui_relogio_ponto, cienciaIntervalo],
  );
  const ajustar = useAjustarLoteFicha();
  const fichasIntervaloReduzido = useMemo(
    () => pendentes.filter((i) =>
      inconformidadesJornada(jornadaDosDadosDaFicha(dadosDaFichaLote(i, organizacao))).some((x) => x.codigo === "intervalo_reduzido"),
    ).length,
    [pendentes, organizacao],
  );
  const salvarCienciaIntervalo = async (justificativa: string | null) => {
    try {
      await ajustar.mutateAsync({
        importacaoId: atual!.id,
        padroes: { intervalo_reduzido_ciencia: justificativa ? { justificativa, ciente: true } : null },
      });
      if (justificativa && selectedCompanyId) {
        try {
          await registrarCienciaRegra({
            companyId: selectedCompanyId,
            tabela: "dp_ficha_importacoes",
            registroId: atual!.id,
            valorNovo: { tipo: "intervalo_reduzido_lote", fichas: fichasIntervaloReduzido },
            justificativa,
            ciencia: true,
          });
        } catch { /* a ciência fica gravada no lote e em cada colaborador criado */ }
      }
      toast.success(justificativa ? "Ciência do intervalo de 30 min registrada no lote." : "Ciência do lote desfeita.");
    } catch (e) {
      toast.error((e as Error).message);
      throw e;
    }
  };
  const salvarPadroes = async (p: EscolhasLote) => {
    try {
      await ajustar.mutateAsync({ importacaoId: atual!.id, padroes: p });
      toast.success("Padrões do lote salvos.");
    } catch (e) {
      toast.error((e as Error).message);
      throw e;
    }
  };
  const aplicarGrupo = async (ids: string[], escolhas: EscolhasLote) => {
    const temHorario = (id: string) => {
      const it = itens.find((i) => i.id === id);
      return !!it && !jornadaDaFicha((it.dados_extraidos ?? {}) as Record<string, unknown>).vazia;
    };
    const { itens: porItem, turnoMantido } = ajustesEmGrupo(ids, escolhas, temHorario);
    const n = Object.keys(porItem).length;
    if (n === 0) {
      toast.info("Nada mudou: essas fichas já têm o horário lido no PDF.");
      return;
    }
    try {
      await ajustar.mutateAsync({ importacaoId: atual!.id, itens: porItem });
      toast.success(
        `Aplicado a ${n} ficha(s).${turnoMantido ? ` ${turnoMantido} mantiveram o horário lido na ficha.` : ""}`,
      );
    } catch (e) {
      toast.error((e as Error).message);
      throw e;
    }
  };
  const salvarContatos = async (edicoes: Record<string, ContatoEditado>) => {
    const { itens: porItem, invalidos } = montarContatosLote(edicoes, (id) => ({
      anterior: organizacao?.ajustes?.[id]?.dados ?? {},
      lidos: (itens.find((i) => i.id === id)?.dados_extraidos ?? {}) as Record<string, unknown>,
    }));
    const n = Object.keys(porItem).length;
    if (invalidos.length > 0) {
      toast.error("Corrija os números ou e-mails destacados antes de salvar.");
      throw new Error("contato inválido");
    }
    if (n === 0) {
      toast.info("Preencha o WhatsApp ou o e-mail de pelo menos uma pessoa.");
      throw new Error("nada a salvar");
    }
    try {
      await ajustar.mutateAsync({ importacaoId: atual!.id, itens: porItem });
      toast.success(`${n} ${n === 1 ? "contato salvo" : "contatos salvos"} nas fichas.`);
    } catch (e) {
      toast.error((e as Error).message);
      throw e;
    }
  };
  const [padroesAbertura, setPadroesAbertura] = useState<AberturaPadroes | null>(null);
  const [contatosFoco, setContatosFoco] = useState<{ foco: string | null } | null>(null);
  /** Fichas pendentes com nome, cargo e setor do lote (para escolher pessoas e preencher contatos). */
  const fichasPendentesLote = useMemo(
    () =>
      itens
        .filter((i) => ["pendente", "revisar", "duplicado"].includes(i.status))
        .map((i) => {
          const d = dadosDaFichaLote(i, organizacao);
          const v = vinculoOrganizado(i, organizacao);
          const setor = setoresAtivos.find((s) => s.id === v?.setorId) ?? null;
          return {
            id: i.id,
            nome: String(d.nome ?? i.nome_extraido ?? "Ficha sem nome"),
            cargo: cargosLista.find((c) => c.id === v?.cargoId)?.nome ?? (d.cargo_nome ? String(d.cargo_nome) : null),
            setorId: setor?.id ?? null,
            setorNome: setor?.nome ?? "Sem setor",
            dados: d,
          };
        }),
    [itens, organizacao, setoresAtivos, cargosLista],
  );
  const linhasContato: LinhaContatoLote[] = useMemo(
    () =>
      fichasPendentesLote
        .filter((f) => semDadosAcesso(f.dados))
        .map((f) => ({
          id: f.id,
          nome: f.nome,
          detalhe: [f.cargo, f.setorId ? rotuloSetor(f.setorNome) : null].filter(Boolean).join(" · ") || null,
          whatsapp: "",
          email: "",
        })),
    [fichasPendentesLote],
  );
  const { data: sindicatosEmpresa = [] } = useDpSindicatos();
  const { data: catalogoSindicatos = [] } = useDpSindicatosCatalogo();
  // Lote ainda não organizado: o laboral da empresa que atende a cidade da
  // unidade já vem marcado, para os cargos nascerem enquadrados. "Definir
  // depois" continua valendo como escolha explícita.
  const laboralSugeridoLote = useMemo(() => {
    if (organizacao?.organizado_em || !unidadeLoteId) return null;
    const u = unidades.find((x) => x.id === unidadeLoteId);
    return laboralPadraoDaUnidade({
      sindicatos: sindicatosEmpresa,
      catalogo: catalogoSindicatos,
      local: { cidade: u?.cidade ?? null, uf: u?.uf ?? null },
    });
  }, [organizacao?.organizado_em, unidadeLoteId, unidades, sindicatosEmpresa, catalogoSindicatos]);
  const sindicatoLoteId = sindicatoLote === undefined
    ? organizacao?.sindicato_laboral_id ?? laboralSugeridoLote
    : sindicatoLote;
  const itemAberto = itens.find((i) => i.id === abertoId) ?? null;
  const nomeDaFicha = (i: (typeof itens)[number]) =>
    String(dadosDaFichaLote(i, organizacao).nome ?? i.nome_extraido ?? "Ficha sem nome");
  const reativar = useReativarFicha();
  /** Ficha ignorada: avança e oferece "Desfazer" (reativa e reabre a mesma ficha). */
  const aoIgnorar = (itemId: string, nome: string, abrirProxima: boolean) => {
    const prox = abrirProxima ? proximaPendente(itemId) : null;
    if (abrirProxima) setAbertoId(prox?.id ?? null);
    toast(`Ficha de ${nome} ignorada.`, {
      description: prox ? "Abrimos a próxima ficha." : "Ela fica em Ignoradas e pode ser reativada.",
      duration: 8000,
      action: {
        label: "Desfazer",
        onClick: () =>
          reativar.mutate(itemId, {
            onSuccess: () => {
              toast.success(`Ficha de ${nome} reativada.`);
              if (abrirProxima) setAbertoId(itemId);
            },
            onError: (e: Error) => notifyError(e, { surface: "Pessoas 360°", action: "reativar a ficha" }),
          }),
      },
    });
  };
  const reativarDaLista = (itemId: string) =>
    reativar.mutate(itemId, {
      onSuccess: () => toast.success("Ficha reativada: ela volta para a conferência."),
      onError: (e: Error) => notifyError(e, { surface: "Pessoas 360°", action: "reativar a ficha" }),
    });
  /**
   * Com trabalho em andamento (lote, leitura ou fichas a conferir), o envio de
   * arquivo fica recolhido e o topo mostra o que falta — quem volta à tela vê
   * o lote, não um campo de envio em branco.
   */
  const fluxoLivre = !preadmissaoId && !pessoaApoioId;
  const emAndamento = fluxoLivre && !!atual && (processando || atual.status === "pending" || pendentes.length > 0);
  const compacto = (modoLote || emAndamento) && !envioAberto;
  const conferidas = prontos.length + ignoradas.length;
  const continuarConferencia = () => {
    if (modoLote) {
      if (etapaAtual === 3) {
        const prox = proximaPendente();
        if (prox) { setAbertoId(prox.id); return; }
      }
      document.getElementById("lote-esteira")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const primeira = pendentes[0];
    if (primeira) document.getElementById(`ficha-item-${primeira.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const turnosDoLote = useMemo(
    () => turnos.filter((t) => t.ativo !== false && (!t.unidade_id || t.unidade_id === unidadeLoteId)),
    [turnos, unidadeLoteId],
  );
  /** Fichas que já podem virar cadastro de uma vez (mesmas regras da ficha individual). */
  const salarioCargoDe = useDpSalarioCargoResolver();
  const [efetivarAberto, setEfetivarAberto] = useState(false);
  const planoEfetivacao = useMemo(
    () => planejarLote(itens, organizacao, {
      unidadeId: unidadeLoteId,
      unidades: unidadesDaEmpresa,
      empresaCnpj,
      cargos: cargosLista,
      turnos,
      padroes: padroesLote,
      exigirSetor: setoresAtivos.length > 0,
      salarioCargo: (cargoId) => salarioCargoDe(cargoId, unidadeLoteId),
    }),
    [itens, organizacao, unidadeLoteId, unidadesDaEmpresa, empresaCnpj, cargosLista, turnos, padroesLote, setoresAtivos.length, salarioCargoDe],
  );
  const proximaPendente = (depoisDe?: string | null) => {
    const idx = depoisDe ? itens.findIndex((i) => i.id === depoisDe) : -1;
    const ordem = [...itens.slice(idx + 1), ...itens.slice(0, Math.max(idx, 0))];
    return ordem.find((i) => ["pendente", "revisar", "duplicado"].includes(i.status) && i.id !== depoisDe) ?? null;
  };




  /** Abre o PDF original de um envio anterior por link temporário. */
  const abrirArquivo = async (path: string) => {
    const { data, error } = await supabase.storage.from("dp-bulk-import").createSignedUrl(path, 60);
    if (error || !data) {
      toast.error("Não foi possível abrir o arquivo");
      return;
    }
    abrirNoApp({ url: data.signedUrl, titulo: "Ficha de registro" }) || window.open(data.signedUrl, "_blank", "noopener");
  };

  const enviarArquivo = () => {
    if (!file) return;
    enviar.mutate(file, {
      onSuccess: ({ importacaoId: id }) => {
        setImportacaoId(id);
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
        toast.success("Ficha enviada — estamos lendo os dados");
      },
      onError: (e: Error) =>
        notifyError(e, {
          surface: "Importar ficha de registro",
          action: "importar a ficha de registro",
          fallback: e?.message && !/row-level|violates|pg_|relation "/i.test(e.message) ? e.message : undefined,
        }),
    });
  };

  /** Progresso da leitura do PDF (aparece no cartão do lote e no envio aberto). */
  const blocoLeitura = processando && atual ? (
<div className="space-y-1">
                <Progress
                  value={atual!.total_paginas ? (atual!.paginas_processadas / atual!.total_paginas) * 100 : 8}
                />
                {travada ? (
                  <p className="text-xs text-destructive">
                    A leitura parou de responder na página {atual!.paginas_processadas} de{" "}
                    {atual!.total_paginas || "…"}. Tente novamente — não é preciso reenviar o PDF.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Lendo página {atual!.paginas_processadas} de {atual!.total_paginas || "…"}
                    {" · "}
                    {atual!.fichas_identificadas ?? 0} ficha(s) encontrada(s) até aqui — pode deixar a tela aberta.
                  </p>
                )}
                <div className="flex flex-wrap justify-end gap-2">
                  {travada && (
                    <Button
                      size="sm"
                      className="h-8"
                      disabled={repetir.isPending}
                      onClick={() =>
                        repetir.mutate(atual!, {
                          onSuccess: () => toast.success("Leitura reiniciada."),
                          onError: (e) => toast.error((e as Error).message),
                        })
                      }
                    >
                      {repetir.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                      Tentar novamente
                    </Button>
                  )}
                  <ConfirmarAcaoDialog
                    titulo="Cancelar a leitura?"
                    descricao="A leitura deste arquivo será interrompida. Depois você pode tentar novamente sem reenviar o PDF."
                    confirmar="Cancelar leitura"
                    onConfirm={() =>
                      cancelar.mutate(atual!.id, {
                        onSuccess: () => toast.success("Leitura cancelada."),
                        onError: (e) => toast.error((e as Error).message),
                      })
                    }
                    disabled={cancelar.isPending}
                  >
                    <Button variant="outline" size="sm" className="h-8" disabled={cancelar.isPending}>
                      Cancelar leitura
                    </Button>
                  </ConfirmarAcaoDialog>
                </div>
              </div>
  ) : null;

  return (
    <DpPage>
      <DpPageHeader
        icon={FileText}
        title="Importar ficha de registro"
        description="Envie a ficha de registro em PDF e confira os dados antes de gerar o cadastro."
        actions={
          <Button variant="outline" size="sm" className="h-10 rounded-full" asChild>
            <Link to="/dp/colaboradores">
              <ArrowLeft className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Colaboradores</span>
            </Link>
          </Button>
        }
      />

      {preadmissaoId && (
        <Card className="border-primary/40">
          <CardContent className="py-4 text-sm">
            <p className="font-semibold">Conferência da ficha oficial de uma pré-admissão</p>
            <p className="text-muted-foreground">
              Envie a ficha que a contabilidade devolveu e confira os dados. Ao criar o cadastro, a pré-admissão é
              concluída na mesma operação, com os familiares e os documentos que o candidato já enviou.
            </p>
          </CardContent>
        </Card>
      )}

      {compacto && atual && (
        <Card className={cn(pendentes.length > 0 && "border-primary/40 bg-primary/5")} aria-label="Lote em andamento">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-muted-foreground">
                  {processando || atual.status === "pending"
                    ? "Lendo o arquivo que você enviou"
                    : pendentes.length > 0
                      ? "Lote em conferência"
                      : "Último lote"}
                </p>
                <p className="break-words text-sm font-semibold">{atual.arquivo_nome}</p>
                <p className="text-xs text-muted-foreground">
                  Enviado em{" "}
                  {new Date(atual.created_at).toLocaleString("pt-BR", {
                    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
                  })}
                </p>
              </div>
            </div>

            {blocoLeitura}

            {!processando && itens.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm tabular-nums">
                  <strong>{conferidas} de {itens.length}</strong> fichas conferidas
                  {pendentes.length > 0 && (
                    <span className="text-muted-foreground">
                      {" · "}{pendentes.length} aguardando você
                    </span>
                  )}
                </p>
                <Progress value={(conferidas / itens.length) * 100} className="h-1.5" />
              </div>
            )}

            {outrosEmAndamento.length > 0 && (
              <div className="space-y-1 rounded-lg border bg-card p-2">
                <p className="text-xs text-muted-foreground">
                  {outrosEmAndamento.length === 1 ? "Outro envio também espera conferência:" : "Outros envios também esperam conferência:"}
                </p>
                {outrosEmAndamento.slice(0, 3).map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setImportacaoId(o.id)}
                    className="flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-muted"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{o.arquivo_nome}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{situacaoEnvio(o, resumoEnvios[o.id])}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              {pendentes.length > 0 && !bloqueadoPorEmpresa && (
                <Button className="h-11 w-full sm:w-auto" onClick={continuarConferencia}>
                  Continuar conferência <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              )}
              <Button
                variant="outline"
                className="h-11 w-full sm:w-auto"
                onClick={() => setEnvioAberto(true)}
              >
                <Plus className="mr-1 h-4 w-4" /> Enviar outro arquivo
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!compacto && (
      <>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Enviar ficha em PDF</CardTitle>
          {(modoLote || emAndamento) && (
            <Button variant="ghost" size="sm" className="h-9" onClick={() => setEnvioAberto(false)}>
              <ChevronUp className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Recolher</span>
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Pode ser a ficha de uma pessoa ou um arquivo com as fichas de toda a equipe — separamos uma a uma.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              className="h-10"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={enviar.isPending}
            />
            <Button className="h-10" onClick={enviarArquivo} disabled={!file || enviar.isPending}>
              {enviar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Enviar e ler
            </Button>
          </div>
        </CardContent>
      </Card>

      {importacoes.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Fichas enviadas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 p-4 pt-0">
            <p className="pb-2 text-sm text-muted-foreground">
              Toque em um envio para rever as fichas dele e abrir o arquivo original.
            </p>
            {(verTodosEnvios ? importacoes : importacoes.slice(0, 3)).map((imp) => (
              <div
                key={imp.id}
                className={cn(
                  "flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm",
                  imp.id === atual?.id ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                <button
                  type="button"
                  onClick={() => setImportacaoId(imp.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate font-medium">{imp.arquivo_nome}</span>
                  <span className="block text-xs text-muted-foreground">
                    {new Date(imp.created_at).toLocaleString("pt-BR", {
                      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                    {" · "}
                    {situacaoEnvio(imp, resumoEnvios[imp.id])}
                  </span>
                </button>
                {imp.arquivo_path ? (
                  <Button variant="outline" size="sm" className="h-8" onClick={() => abrirArquivo(imp.arquivo_path!)}>
                    Abrir PDF
                  </Button>
                ) : null}
              </div>
            ))}
            {importacoes.length > 3 && (
              <Button variant="ghost" size="sm" className="h-9 w-full" onClick={() => setVerTodosEnvios((v) => !v)}>
                {verTodosEnvios ? "Mostrar menos" : `Ver todos os envios (${importacoes.length})`}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {atual && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm font-medium">{atual.arquivo_nome}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {Math.max(itens.length, atual.fichas_identificadas ?? 0)} ficha(s)
                </Badge>
                {prontos.length > 0 && <Badge className="bg-emerald-600 text-white">{prontos.length} no cadastro</Badge>}
              </div>
            </div>

            {blocoLeitura}

            {atual.status === "ready" && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed p-3">
                <p className="text-xs text-muted-foreground">
                  Leia o mesmo arquivo de novo com a leitura atualizada (familiares, eSocial e FGTS). Quem já foi
                  cadastrado não é alterado: a ficha volta como "Já cadastrado" para você conferir e aprovar só o que
                  for novo.
                </p>
                <ConfirmarAcaoDialog
                  titulo="Ler o Arquivo Novamente?"
                  descricao="Os cadastros já concluídos ficam como estão. As fichas ainda não aprovadas serão lidas de novo, e as de quem já está cadastrado voltam para conferência das informações novas."
                  confirmar="Ler Novamente"
                  onConfirm={() =>
                    repetir.mutate(atual, {
                      onSuccess: () => toast.success("Leitura reiniciada. As fichas voltam para conferência ao terminar."),
                      onError: (e) => toast.error((e as Error).message),
                    })
                  }
                  disabled={repetir.isPending}
                >
                  <Button size="sm" variant="outline" className="h-8" disabled={repetir.isPending}>
                    {repetir.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                    Ler o Arquivo Novamente
                  </Button>
                </ConfirmarAcaoDialog>
              </div>
            )}

            {atual.status === "failed" && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={cn("text-sm", atual.erro_mensagem === MOTIVO_CANCELADA ? "text-muted-foreground" : "text-destructive")}>
                  {atual.erro_mensagem === MOTIVO_CANCELADA
                    ? MOTIVO_CANCELADA
                    : `Não conseguimos ler este arquivo${atual.erro_mensagem ? `: ${atual.erro_mensagem}` : "."}`}
                </p>
                <Button
                  size="sm"
                  className="h-8"
                  disabled={repetir.isPending}
                  onClick={() =>
                    repetir.mutate(atual, {
                      onSuccess: () => toast.success("Leitura reiniciada."),
                      onError: (e) => toast.error((e as Error).message),
                    })
                  }
                >
                  {repetir.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  Tentar novamente
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      </>
      )}

      {divergencia.divergente && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="space-y-3 p-4">
            <p className="text-sm font-semibold text-destructive">
              Este arquivo é de outro CNPJ
            </p>
            <p className="text-sm text-muted-foreground">
              As fichas trazem o CNPJ {divergencia.cnpjs.map((c) => formatCnpj(c)).join(", ")}
              {divergencia.empregadores.length > 0 ? ` (${divergencia.empregadores.join(", ")})` : ""}, mas você está
              trabalhando na empresa {empresaAtual ? (empresaAtual.trade_name || empresaAtual.name) : "selecionada"}
              {empresaAtual?.cnpj ? ` — ${formatCnpj(empresaAtual.cnpj)}` : ""}. Troque de empresa antes de conferir,
              para os cadastros não nascerem no lugar errado.
            </p>
            <div className="flex flex-wrap gap-2">
              {empresaDoArquivo && (
                <Button
                  size="sm"
                  className="h-9"
                  onClick={() => {
                    setContext("pj", empresaDoArquivo.id);
                    setImportacaoId(null);
                    setConferirMesmoAssim(false);
                    toast.success(
                      `Empresa alterada para ${empresaDoArquivo.trade_name || empresaDoArquivo.name}. Envie o PDF novamente aqui.`,
                    );
                  }}
                >
                  Trocar para {empresaDoArquivo.trade_name || empresaDoArquivo.name}
                </Button>
              )}
              {processando && (
                <ConfirmarAcaoDialog
                  titulo="Cancelar a leitura?"
                  descricao="A leitura deste arquivo será interrompida e nenhuma ficha será cadastrada."
                  confirmar="Cancelar leitura"
                  onConfirm={() =>
                    cancelar.mutate(atual!.id, {
                      onSuccess: () => toast.success("Leitura cancelada."),
                      onError: (e) => toast.error((e as Error).message),
                    })
                  }
                  disabled={cancelar.isPending}
                >
                  <Button variant="outline" size="sm" className="h-9" disabled={cancelar.isPending}>
                    Cancelar leitura
                  </Button>
                </ConfirmarAcaoDialog>
              )}
              {bloqueadoPorEmpresa && (
                <Button variant="ghost" size="sm" className="h-9" onClick={() => setConferirMesmoAssim(true)}>
                  Conferir mesmo assim
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {itens.length > 0 && pendentes.length === 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Todas as Fichas Foram Cadastradas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              As {itens.length} fichas deste lote já viraram colaboradores. Próximos passos sugeridos:
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Confira a lista de colaboradores e complete o que ficou marcado como incompleto.</li>
              <li>Revise os cargos e salários de cada função.</li>
              <li>Envie novas fichas, se ainda houver pessoas para cadastrar.</li>
            </ol>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild><Link to="/dp/colaboradores">Ver Colaboradores</Link></Button>
              <Button asChild variant="outline"><Link to="/dp/cadastros/cargos">Revisar Cargos</Link></Button>
              <Button variant="ghost" onClick={() => { setEnvioAberto(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                Enviar Novas Fichas
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {modoLote && !bloqueadoPorEmpresa && (
        <section id="lote-esteira" className="scroll-mt-20 space-y-3" aria-label="Organizar o lote">
          <FichaLoteEtapas
            atual={etapaAtual}
            concluidas={[...(unidadeLoteId ? [1 as EtapaLote] : []), ...(organizacao?.organizado_em ? [2 as EtapaLote] : [])]}
            onIr={setEtapa}
          />

          {etapaAtual === 1 && (
            <FichaLoteUnidade
              companyId={selectedCompanyId}
              unidades={unidadesDaEmpresa}
              unidadeId={unidadeLoteId}
              identificadaPeloCnpj={!!unidadeLida?.unidade_id && unidadeLida.unidade_id === unidadeLoteId}
              onUnidade={setUnidadeLote}
              sindicatoId={sindicatoLoteId}
              onSindicato={(v) => setSindicatoLote(v)}
              cnpjLido={unidadeLida?.cnpj_lido ?? null}
              empregadorLido={unidadeLida?.empregador_lido ?? null}
              totalFichas={itens.length}
              onContinuar={() => setEtapa(2)}
            />
          )}

          {etapaAtual === 2 && unidadeLoteId && grupos.length > 0 && (
            <FichaLoteCargos
              key={`${atual?.id}-${unidadeLoteId}`}
              grupos={grupos}
              cargos={cargosLista}
              setores={setoresAtivos}
              unidadeId={unidadeLoteId}
              organizacao={organizacao}
              salvando={organizar.isPending}
              onVoltar={() => setEtapa(1)}
              onSalvar={(gs) =>
                organizar.mutate(
                  { importacaoId: atual!.id, unidadeId: unidadeLoteId, sindicatoLaboralId: sindicatoLoteId, grupos: gs },
                  {
                    onSuccess: (r) => {
                      toast.success(
                        `Lote organizado: ${r.cargos_criados} cargo(s) e ${r.setores_criados} setor(es) criados. Agora confira as fichas.`,
                      );
                      setEtapa(3);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    },
                    onError: (e) => toast.error((e as Error).message),
                  },
                )
              }
            />
          )}
          {etapaAtual === 2 && grupos.length === 0 && (
            <p className="text-sm text-muted-foreground">Todas as fichas deste lote já foram concluídas.</p>
          )}
          {etapaAtual === 2 && !unidadeLoteId && (
            <p className="text-sm text-muted-foreground">Escolha a unidade na etapa 1 para organizar os cargos.</p>
          )}

          {etapaAtual === 3 && (
            <>
              {novasFichas > 0 && <FranquiaColaboradoresAviso estado={estadoFranquiaLote} novos={novasFichas} />}
              {!organizacao?.organizado_em && pendentes.length > 0 && (
                <Card className="border-warning/50 bg-warning/10">
                  <CardContent className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <p>Organize cargos e setores primeiro: as fichas já chegam preenchidas e sobra bem menos para ajustar.</p>
                    <Button size="sm" className="h-10 shrink-0" onClick={() => setEtapa(2)}>
                      Organizar cargos <ArrowRight className="ml-1 h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              )}
              {pendentes.length > 0 && (
                <FichaLotePadroesCard
                  key={atual?.id}
                  padroes={padroesEmVigor}
                  turnos={turnosDoLote}
                  unidadeSemAdiantamento={unidadeSemAdiantamento}
                  unidadeTemPonto={!!unidadeDoLote?.possui_relogio_ponto}
                  abertura={padroesAbertura}
                  onAbertura={setPadroesAbertura}
                  salvando={ajustar.isPending}
                  onSalvar={salvarPadroes}
                  onAplicarGrupo={aplicarGrupo}
                />
              )}
              {pendentes.length > 0 && (
                <CienciaIntervaloLoteCard
                  quantidade={fichasIntervaloReduzido}
                  ciencia={cienciaIntervalo}
                  salvando={ajustar.isPending}
                  onSalvar={(j) => salvarCienciaIntervalo(j)}
                  onDesfazer={() => salvarCienciaIntervalo(null).catch(() => undefined)}
                />
              )}
              <FichaLoteLista
                itens={itens}
                organizacao={organizacao}
                cargos={cargosLista}
                setores={setoresAtivos}
                padroes={padroesLote}
                unidadeId={unidadeLoteId}
                onAbrir={setAbertoId}
                onAplicarMarcadas={(ids, titulo) => setPadroesAbertura({ escopo: "grupo", ids, titulo })}
                onPreencherContatos={(foco) => setContatosFoco({ foco })}
                onAssinaturaPapel={(ids, papel) => aplicarGrupo(ids, { assinatura_papel: papel }).catch(() => undefined)}
                onReativar={reativarDaLista}
                reativandoId={reativar.isPending ? reativar.variables ?? null : null}
              />
              <ContatosLoteDialog
                open={!!contatosFoco}
                onOpenChange={(o) => !o && setContatosFoco(null)}
                linhas={linhasContato}
                focoId={contatosFoco?.foco ?? null}
                salvando={ajustar.isPending}
                onSalvar={salvarContatos}
              />
              <div className="sticky bottom-[calc(76px+env(safe-area-inset-bottom)+0.5rem)] z-10 flex items-center gap-2 rounded-xl border bg-card p-2 shadow-lg md:bottom-4">
                <div className="min-w-0 flex-1 space-y-1 px-1">
                  <p className="truncate text-sm font-medium tabular-nums">
                    {prontos.length} de {itens.length} no cadastro
                  </p>
                  <Progress value={itens.length ? (prontos.length / itens.length) * 100 : 0} className="h-1.5" />
                  {organizacao?.notificacao?.em && (
                    <p className="truncate text-[11px] text-muted-foreground">
                      Responsável avisado em {resumoRepasse(organizacao.notificacao)}
                    </p>
                  )}
                </div>
                {pendentes.length > 0 && (
                  <Button
                    variant={planoEfetivacao.aptas.length > 0 ? "outline" : "default"}
                    className="h-11 shrink-0"
                    onClick={() => setAbertoId(proximaPendente()?.id ?? null)}
                  >
                    <span className="sm:hidden">Próxima</span>
                    <span className="hidden sm:inline">Conferir próxima</span>
                  </Button>
                )}
                {planoEfetivacao.aptas.length > 0 && (
                  <Button
                    className="h-11 shrink-0"
                    aria-label={`Finalizar implantação: criar ${planoEfetivacao.aptas.length} cadastros`}
                    onClick={() => setEfetivarAberto(true)}
                  >
                    <UserPlus className="h-4 w-4 sm:mr-2" />
                    <span className="ml-1 sm:ml-0">
                      <span className="hidden sm:inline">Finalizar implantação </span>
                      <span className="tabular-nums">({planoEfetivacao.aptas.length})</span>
                    </span>
                  </Button>
                )}
                {isSuperAdmin && pendentes.length > 0 && (
                  <Button
                    variant="outline"
                    className="h-11 shrink-0"
                    aria-label="Salvar e notificar responsável"
                    onClick={() => setNotificarAberto(true)}
                  >
                    <Send className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Salvar e notificar</span>
                  </Button>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {!modoLote && pendentes.length > 0 && !bloqueadoPorEmpresa && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Conferir e cadastrar ({pendentes.length})</h2>

          {novasFichas > 0 && <FranquiaColaboradoresAviso estado={estadoFranquiaLote} novos={novasFichas} />}


          <Card className="bg-muted/20">
            <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <p className="text-sm font-medium">Aplicar a todas as fichas</p>
                <p className="text-xs text-muted-foreground">
                  Vale para as fichas em que você não escolher outro valor. Cargo, unidade e horário continuam ficha por ficha.
                </p>
              </div>
              {setoresAtivos.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">Setor</Label>
                  <Select
                    value={setorPadraoId ?? "__none"}
                    onValueChange={(v) => setSetorPadraoId(v === "__none" ? null : v)}
                  >
                    <SelectTrigger className="h-9"><SelectValue placeholder="Escolher" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Não aplicar</SelectItem>
                      {setoresAtivos.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Vínculo</Label>
                <Select
                  value={regimePadrao ?? "__none"}
                  onValueChange={(v) => setRegimePadrao(v === "__none" ? null : v)}
                >
                  <SelectTrigger className="h-9"><SelectValue placeholder="Escolher" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Não aplicar</SelectItem>
                    {REGIMES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {pendentes.map((item, idx) => (
            <div key={item.id} id={`ficha-item-${item.id}`} className="scroll-mt-20">
            <FichaRevisaoCard
              avisoFranquia={false}
              posicao={itens.findIndex((i) => i.id === item.id) + 1}
              total={itens.length}
              emFoco={idx === 0}
              onConcluido={(itemId, nome) => {
                const proximo = pendentes.find((p) => p.id !== itemId);
                if (proximo) {
                  const pos = itens.findIndex((i) => i.id === proximo.id) + 1;
                  const nomeProx = String((proximo.dados_extraidos as Record<string, unknown> | null)?.nome ?? proximo.nome_extraido ?? "Ficha sem nome");
                  toast.info(`${nome} concluído. Próximo: ${nomeProx} (Ficha ${pos} de ${itens.length})`, { duration: 6000 });
                  setTimeout(() => {
                    document.getElementById(`ficha-item-${proximo.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }, 400);
                } else {
                  toast.success("Todas as fichas deste lote foram conferidas.");
                }
              }}
              onIgnorado={fluxoLivre ? (itemId, nome) => aoIgnorar(itemId, nome, false) : undefined}
              item={item}
              cargos={cargos.map((c) => ({ id: c.id, nome: c.nome, cbo: c.cbo }))}
              turnos={turnos}
              unidades={unidadesDaEmpresa}
              setores={setoresAtivos}
              unidadePadraoId={unidadesDaEmpresa[0]?.id ?? null}
              empresaCnpj={empresaCnpj}
              setorPadraoId={setorPadraoId}
              regimePadrao={regimePadrao}
              onAbrirCadastro={setCadastroAbertoId}
              preadmissaoId={preadmissaoId}
              pessoaApoioId={pessoaApoioId}
            />
            </div>
          ))}
        </div>
      )}

      {!modoLote && fluxoLivre && ignoradas.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Ignoradas ({ignoradas.length})</h2>
          {ignoradas.map((item) => (
            <FichaRevisaoCard
              key={item.id}
              item={item}
              cargos={cargosLista}
              unidades={unidadesDaEmpresa}
              unidadePadraoId={null}
              empresaCnpj={empresaCnpj}
            />
          ))}
        </div>
      )}

      {atual?.status === "ready" && !preadmissaoId && (
        <FichaHistoricoPainel importacaoId={atual.id} itens={itens} />
      )}

      {!modoLote && prontos.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Já no cadastro ({prontos.length})</h2>
          {prontos.map((item) => (
            <FichaRevisaoCard
              key={item.id}
              item={item}
              cargos={cargos.map((c) => ({ id: c.id, nome: c.nome, cbo: c.cbo }))}
              turnos={turnos}
              unidades={unidadesDaEmpresa}
              setores={setoresAtivos}
              unidadePadraoId={null}
              empresaCnpj={empresaCnpj}
              onAbrirCadastro={setCadastroAbertoId}
              preadmissaoId={preadmissaoId}
              pessoaApoioId={pessoaApoioId}
            />
          ))}
        </div>
      )}

      {modoLote && (
        <ConferenciaFichaGaveta
          fichaId={itemAberto?.id ?? null}
          nome={itemAberto ? nomeDaFicha(itemAberto) : "Ficha"}
          posicao={itemAberto ? itens.findIndex((i) => i.id === itemAberto.id) + 1 : 0}
          total={itens.length}
          onFechar={() => setAbertoId(null)}
        >
          {(rodapeFichaEl) => itemAberto && (
                <FichaRevisaoCard
                  key={itemAberto.id}
                  avisoFranquia={false}
                  item={itemAberto}
                  cargos={cargosLista}
                  turnos={turnos}
                  unidades={unidadesDaEmpresa}
                  setores={setoresAtivos}
                  unidadePadraoId={unidadeLoteId}
                  empresaCnpj={empresaCnpj}
                  regimePadrao={escolhaDaFicha(itemAberto, organizacao, "regime") ?? null}
                  formaPagamentoPadrao={escolhaDaFicha(itemAberto, organizacao, "forma_pagamento") ?? null}
                  adiantamentoPadrao={(() => {
                    const aj = organizacao?.ajustes?.[itemAberto.id];
                    return aj && typeof aj.adiantamento === "boolean" ? aj.adiantamento : adiantamentoPadrao;
                  })()}
                  turnoPadraoId={escolhaDaFicha(itemAberto, organizacao, "turno_id") ?? null}
                  folhaPontoPadrao={escolhaDaFicha(itemAberto, organizacao, "folha_ponto") ?? null}
                  justificativaPontoPadrao={escolhaDaFicha(itemAberto, organizacao, "folha_ponto_justificativa") ?? null}
                  rascunho={organizacao?.ajustes?.[itemAberto.id] ?? null}
                  cienciaIntervaloLote={cienciaIntervalo?.justificativa ?? null}
                  onSalvarRascunho={async (aj) => {
                    await ajustar.mutateAsync({ importacaoId: atual!.id, itens: { [itemAberto.id]: aj } });
                    const prox = proximaPendente(itemAberto.id);
                    toast.success(prox ? "Ficha salva. Abrindo a próxima." : "Ficha salva.");
                    setAbertoId(prox?.id ?? null);
                  }}
                  destacarPendencias
                  rodapeFixo
                  rodapeContainer={rodapeFichaEl}
                  vinculoLote={vinculoOrganizado(itemAberto, organizacao)}
                  onAbrirCadastro={setCadastroAbertoId}
                  onIgnorado={(itemId, nome) => aoIgnorar(itemId, nome, true)}
                  onConcluido={(itemId, nome) => {
                    const prox = proximaPendente(itemId);
                    if (prox) {
                      toast.success(`${nome} concluído. Abrindo a próxima ficha.`);
                      setAbertoId(prox.id);
                    } else {
                      toast.success("Todas as fichas deste lote foram conferidas.");
                      setAbertoId(null);
                    }
                  }}
                />
          )}
        </ConferenciaFichaGaveta>
      )}

      {modoLote && (
        <EfetivarLoteDialog
          open={efetivarAberto}
          onOpenChange={setEfetivarAberto}
          companyId={selectedCompanyId}
          itens={itens}
          plano={planoEfetivacao}
          cienciaIntervaloLote={cienciaIntervalo?.justificativa ?? null}
        />
      )}

      {modoLote && isSuperAdmin && atual && (
        <NotificarResponsavelDialog
          open={notificarAberto}
          onOpenChange={setNotificarAberto}
          importacaoId={atual.id}
          empresaNome={empresaAtual ? (empresaAtual.trade_name || empresaAtual.name) : "a empresa"}
          pendentes={pendentes.length}
        />
      )}

      {colaboradorAberto && (
        <ColaboradorFormDialog
          open={!!colaboradorAberto}
          onOpenChange={(o) => !o && setCadastroAbertoId(null)}
          colaborador={colaboradorAberto}
        />
      )}

      {atual && !processando && itens.length === 0 && atual.status !== "failed" && (
        aguardandoFichas ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando as fichas lidas…
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhuma ficha foi reconhecida neste arquivo. Confira se o PDF é a ficha de registro de empregado.
          </p>
        )
      )}

    </DpPage>
  );
}
