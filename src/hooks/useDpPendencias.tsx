import { prazoLegalRescisao, prazoPagamentoRescisao } from "@/lib/dp/desligamento";
import { datasDeFeriados, faltaFeriadoLocal } from "@/lib/dp/feriados";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpPendenciasConfig, type DpPendenciasConfig } from "@/hooks/useDpPendenciasConfig";
import { useDpFeriasConfig } from "@/hooks/useDpFeriasConfig";
import { addDays, differenceInCalendarDays, format } from "date-fns";
import type { LucideIcon } from "lucide-react";
import { ClipboardList, FileCheck2, FileMinus, FileText, Users, Coins, Clock, Scale, Palmtree, UserCog, Baby, AlertTriangle } from "lucide-react";
import { conformidadePonto } from "@/lib/dp/ponto-conformidade";
import { LEMBRETE_RETORNO_DIAS, TIPOS_AFASTAMENTO, TIPOS_LICENCA, afastamentoCobreCompetencia, labelAfastamento, situacaoRetorno } from "@/lib/dp/licencas";
import { resolverChecklist, resumirChecklist, tituloItem } from "@/lib/dp/documentos-requisitos";
import { camposFaltandoObrigatorios, resumoFaltando } from "@/lib/dp/cadastro-completude";
import { agruparPisosPorCargo, salarioCargoNaUnidade } from "@/lib/dp/cargoSalarios";
import { alertaPendenciaFerias, periodosComAcumulo, regimeTemFeriasLegais } from "@/lib/dp/ferias-direito";
import { AVISO_FERIAS_PRAZO_DIAS } from "@/lib/dp/ferias-aviso";
import { compararUrgencia } from "@/lib/dp/pendencias";
import { mesclarConfidencial } from "@/lib/dp/confidencial";
import { confirmacaoVencida } from "@/lib/dp/contatosEmergencia";
import { TIPOS_COM_COMPROVANTE } from "@/lib/dp/documentoTipos";

import { alertasDependentes, tabelaSalarioFamiliaVencida } from "@/lib/dp/salarioFamilia";
import { prazoComprovante, TIPOS_RESCISORIOS } from "@/lib/dp/comprovante-prazo";
import {
  atrasoEmDias,
  competenciaDe,
  competenciaLabel,
  competenciasParaCobrar,
  DOC_TIPOS_RESCISAO,
  REGIMES_COM_AVISO_PREVIO,
  elegivelRescisaoDoVinculo,
  elegivelDocumento,
  intervaloCompetencia,
  limiteMesSeguinte,
  limiteNoMes,
  somarMeses,
  vinculosEncerrados,
  type ColabElegibilidade,
  type DocTipoColaborador,
  type VinculoEncerrado,
  type VinculoHistorico,
} from "@/lib/dp/pendencias-documentos";
import { ativoNaCompetencia } from "@/lib/dp/bulk-coverage";
import { forcarRecargaPendencias } from "@/lib/dp/pendencias-resolver";
import {
  optanteNaCompetencia,
  type AdiantamentoSolicitacao,
} from "@/lib/dp/adiantamento-opcao";
import { ciclosValePendentes, unidadesSemFeriados } from "@/lib/dp/pendencias-vales";
import { dataDoFeriadoNoAno, type FeriadoRegra } from "@/lib/dp/feriados";

export type Pendencia = {
  id: string;
  icon: LucideIcon;
  titulo: string;
  subtitulo: string;
  tipo: string;
  vencimento?: string | null;
  atrasoDias: number;
  /** Pede ação imediata mesmo dentro do prazo (ex.: férias em risco de dobra). */
  urgente?: boolean | null;
  url: string;
  /** Preenchidos somente quando o dado realmente existe na fonte. */
  colaboradorNome?: string | null;
  unidadeNome?: string | null;
  /** Preenchidos em pendências por colaborador/competência (ex.: alerta do intermitente). */
  colaboradorId?: string | null;
  competencia?: string | null;
  /** Metadados de pendências de documento — usados também na tela Importar. */
  docTipo?: DocTipoColaborador | null;
  unidadeId?: string | null;
  escopo?: "unidade" | "pessoa";
  /** Pessoas faltantes quando a pendência cobre o lote inteiro da unidade. */
  pessoas?: Array<{ nome: string; desligamento: string | null }>;
  totalElegiveis?: number;
  /** Retorno de licença: dados da solicitação para confirmar ou prorrogar. */
  licenca?: {
    solicitacaoId: string;
    tipo: string;
    dataInicio: string;
    dataFimPrevista: string;
  } | null;
};


const MES_NOME = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function ymd(d: Date) {
  return format(d, "yyyy-MM-dd");
}

export function useDpPendencias() {
  const { selectedCompanyId } = useCompanyContext();
  const { config, isLoading: isConfigLoading } = useDpPendenciasConfig();
  const { config: feriasConfig, isLoading: isFeriasConfigLoading } = useDpFeriasConfig();
  // Verdadeira apuração em curso (botão manual ou recálculo por estar desatualizado).
  // Reler o resultado já pronto não conta — por isso é separado de isFetching.
  const [isRefreshing, setIsRefreshing] = useState(false);


  const query = useQuery({
    // A identidade do cache depende apenas da empresa. Mudanças de configuração
    // invalidam explicitamente esta chave no hook de configuração.
    queryKey: ["dp_pendencias", selectedCompanyId],
    enabled: !!selectedCompanyId && !isConfigLoading && !isFeriasConfigLoading,
    // Sem repetição periódica no navegador: a rotina diária, as ações do gestor
    // e o botão manual controlam quando uma nova apuração deve acontecer.
    staleTime: Infinity,
    // Mantém as pendências disponíveis durante toda a sessão para que voltar ao
    // painel não descarte os dados e não exiba uma nova tela de carregamento.
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async (): Promise<Pendencia[]> => {
      const cfg: DpPendenciasConfig = config;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diaHoje = today.getDate();
      const mesVigente = today.getMonth() + 1; // 1-12
      const anoVigente = today.getFullYear();
      const mesAnterior = mesVigente === 1 ? 12 : mesVigente - 1;
      const anoAnterior = mesVigente === 1 ? anoVigente - 1 : anoVigente;

      const results: Pendencia[] = [];

      // 1. Solicitações pendentes
      try {
        const { data: sols } = await supabase
          .from("dp_solicitacoes")
          .select("id, tipo, created_at, dp_colaboradores(nome)")
          .is("removido_em", null)
          .eq("company_id", selectedCompanyId!)
          .eq("status", "pendente")
          .order("created_at", { ascending: true })
          .limit(20);
        (sols ?? []).forEach((s: any) => {
          const vencimento = new Date(s.created_at);
          vencimento.setDate(vencimento.getDate() + cfg.alerta_solicitacao_dias);
          const dias = differenceInCalendarDays(today, vencimento);
          results.push({
            id: `sol-${s.id}`,
            icon: ClipboardList,
            titulo: `Solicitação de ${s.tipo}`,
            subtitulo: s.dp_colaboradores?.nome ?? "Colaborador",
            tipo: "Solicitação",
            colaboradorNome: s.dp_colaboradores?.nome ?? null,
            vencimento: ymd(vencimento),
            atrasoDias: dias,
            url: "/dp/folgas?aba=solicitacoes",
          });
        });
      } catch (e) {
        console.warn("pendencias/solicitacoes:", e);
      }

      // 2. Trocas pendentes de gestor
      try {
        const { data: trocas } = await supabase
          .from("dp_trocas")
          .select("id, status, created_at, solicitante:solicitante_id(nome)")
          .eq("company_id", selectedCompanyId!)
          .in("status", ["pendente_gestor"])
          .order("created_at", { ascending: true })
          .limit(10);
        (trocas ?? []).forEach((t: any) => {
          const vencimento = new Date(t.created_at);
          vencimento.setDate(vencimento.getDate() + cfg.alerta_troca_dias);
          const dias = differenceInCalendarDays(today, vencimento);
          results.push({
            id: `troca-${t.id}`,
            icon: Users,
            titulo: "Troca aguardando aprovação",
            subtitulo: t.solicitante?.nome ?? "Colaborador",
            tipo: "Troca",
            colaboradorNome: t.solicitante?.nome ?? null,
            vencimento: ymd(vencimento),
            atrasoDias: dias,
            url: "/dp/folgas?aba=trocas",
          });
        });
      } catch (e) {
        console.warn("pendencias/trocas:", e);
      }

      // 2b. Ocorrências aguardando decisão do gestor
      try {
        const { data: ocs } = await supabase
          .from("dp_ocorrencias")
          .select(
            "id, tipo, estado, analise_status, tratativa_status, tratativa_ponto, data_operacional, created_at, assiduidade_risco, assiduidade_decidido_em, colaborador:colaborador_id(nome)",
          )
          .eq("company_id", selectedCompanyId!)
          .neq("estado", "cancelada")
          .order("created_at", { ascending: true })
          .limit(50);
        (ocs ?? [])
          .filter(
            (o: any) =>
              o.estado === "aguardando_confirmacao" ||
              o.analise_status === "pendente" ||
              (o.tratativa_ponto && o.tratativa_status === "pendente") ||
              (o.assiduidade_risco && !o.assiduidade_decidido_em),
          )
          .forEach((o: any) => {
            const vencimento = new Date(o.created_at);
            vencimento.setHours(vencimento.getHours() + cfg.alerta_ocorrencia_horas);
            const dias = differenceInCalendarDays(today, vencimento);
            const titulo =
              o.assiduidade_risco && !o.assiduidade_decidido_em
                ? "Prêmio de assiduidade aguardando decisão"
                : o.estado === "aguardando_confirmacao"
                  ? "Previsão aguardando confirmação"
                  : o.analise_status === "pendente"
                    ? "Ocorrência aguardando análise"
                    : "Ponto aguardando tratativa";
            results.push({
              id: `ocorrencia-${o.id}`,
              icon: ClipboardList,
              titulo,
              subtitulo: `${o.colaborador?.nome ?? "Colaborador"} · ${format(
                new Date(`${o.data_operacional}T12:00:00`),
                "dd/MM",
              )}`,
              tipo: "Ocorrência",
              colaboradorNome: o.colaborador?.nome ?? null,
              vencimento: ymd(vencimento),
              atrasoDias: dias,
              url: "/dp/ocorrencias",
            });
          });
      } catch (e) {
        console.warn("pendencias/ocorrencias:", e);
      }



      // Carregar unidades ativas (usadas nos blocos 3-6)
      let unidades: Array<{
        id: string;
        nome: string;
        created_at: string;
        possui_relogio_ponto: boolean | null;
        tem_adiantamento: boolean | null;
        dia_adiantamento: number | null;
      }> = [];
      try {
        const { data } = await supabase
          .from("dp_unidades")
          .select("id, nome, created_at, possui_relogio_ponto, tem_adiantamento, dia_adiantamento")
          .eq("company_id", selectedCompanyId!)
          .eq("ativo", true);
        unidades = (data ?? []) as any;
      } catch (e) {
        console.warn("pendencias/unidades:", e);
      }

      // Colaboradores por unidade — 1 query só (evita N+1 por unidade).
      // Inclui desligados: a elegibilidade é por competência (ativoNaCompetencia).
      const unidadeDoColab = new Map<string, string>();
      let colaboradoresDocs: Array<ColabElegibilidade & { nome: string; unidade_id: string | null }> = [];
      try {
        const { data: colabsU } = await supabase
          .from("dp_colaboradores")
          .select(
            "id, nome, unidade_id, ativo, regime, forma_pagamento, vinculo_label, possui_folha_ponto, optante_adiantamento, data_admissao, data_desligamento",
          )
          .eq("company_id", selectedCompanyId!);
        (colabsU ?? []).forEach((c: any) => {
          if (c.unidade_id) unidadeDoColab.set(c.id, c.unidade_id);
        });
        colaboradoresDocs = (colabsU ?? []) as any;
      } catch (e) {
        console.warn("pendencias/colabs-unidade:", e);
      }

      // Histórico de solicitações de adiantamento (ativar/cancelar com data) —
      // decide se a competência estava com adiantamento ativo, não o flag atual.
      const solicitacoesPorColab = new Map<string, AdiantamentoSolicitacao[]>();
      try {
        const { data: sols } = await supabase
          .from("dp_adiantamento_solicitacoes" as any)
          .select("id, colaborador_id, tipo, data_solicitacao, competencia_efeito, origem, created_at")
          .eq("company_id", selectedCompanyId!);
        (sols ?? []).forEach((s: any) => {
          if (!solicitacoesPorColab.has(s.colaborador_id)) solicitacoesPorColab.set(s.colaborador_id, []);
          solicitacoesPorColab.get(s.colaborador_id)!.push(s as AdiantamentoSolicitacao);
        });
      } catch (e) {
        console.warn("pendencias/adiantamento-solicitacoes:", e);
      }

      // Confirmações do gestor sobre o intermitente (trabalhou / não trabalhou).
      const confirmacaoIntermitente = new Map<string, boolean>();
      try {
        const { data: confs } = await supabase
          .from("dp_intermitente_competencia_confirmacoes" as any)
          .select("colaborador_id, competencia, trabalhou")
          .eq("company_id", selectedCompanyId!);
        (confs ?? []).forEach((c: any) => {
          confirmacaoIntermitente.set(`${c.colaborador_id}:${c.competencia}`, c.trabalhou === true);
        });
      } catch (e) {
        console.warn("pendencias/intermitente-confirmacoes:", e);
      }

      const hojeISO = ymd(today);
      const compVigente = competenciaDe(hojeISO);
      const compAnterior = somarMeses(compVigente, -1);

      // Documentos por tipo — 1 query por tipo cobrindo todo o intervalo.
      // Chave por colaborador: `${colaboradorId}:${competencia}`
      const importados = new Map<string, Set<string>>();
      const carregarTipo = async (
        tipo: DocTipoColaborador,
        inicio: string,
        fim: string,
      ): Promise<Set<string>> => {
        const cache = importados.get(tipo);
        if (cache) return cache;
        const set = new Set<string>();
        // A pendência de rescisão é satisfeita por TRCT ou demonstrativo rescisório.
        const tiposDb = tipo === "rescisao" ? [...DOC_TIPOS_RESCISAO] : [tipo];
        try {
          const { data } = await supabase
            .from("dp_documentos")
            .select("colaborador_id, referencia_data")
            .eq("company_id", selectedCompanyId!)
            .in("tipo", tiposDb as any)
            .gte("referencia_data", inicio)
            .lte("referencia_data", fim);
          (data ?? []).forEach((d: any) => {
            if (d.colaborador_id && d.referencia_data) {
              set.add(`${d.colaborador_id}:${String(d.referencia_data).slice(0, 7)}`);
            }
          });
        } catch (e) {
          console.warn(`pendencias/docs-${tipo}:`, e);
        }
        importados.set(tipo, set);
        return set;
      };

      const colabsPorUnidade = new Map<string, typeof colaboradoresDocs>();
      colaboradoresDocs.forEach((c) => {
        if (!c.unidade_id) return;
        if (!colabsPorUnidade.has(c.unidade_id)) colabsPorUnidade.set(c.unidade_id, []);
        colabsPorUnidade.get(c.unidade_id)!.push(c);
      });

      // Preenchido após calcular o intervalo de competências. A função fica
      // estável para ser compartilhada pela elegibilidade e pelos alertas.
      let folhasPontoImportadas = new Set<string>();
      const intermitenteTemEvidencia = (colaboradorId: string, competencia: string) =>
        folhasPontoImportadas.has(`${colaboradorId}:${competencia}`);

      // Afastamentos aprovados (licenças e atestados longos): quando cobrem o
      // mês inteiro, não há ponto a bater e a folha não é exigida da pessoa.
      const afastamentosAprovados: Array<{
        colaborador_id: string;
        data_alvo: string;
        data_fim: string | null;
      }> = [];
      try {
        const { data: afast } = await supabase
          .from("dp_solicitacoes")
          .select("colaborador_id, data_alvo, data_fim")
          .is("removido_em", null)
          .eq("company_id", selectedCompanyId!)
          .in("tipo", [...TIPOS_AFASTAMENTO] as any)
          .eq("status", "aprovada")
          .not("colaborador_id", "is", null);
        (afast ?? []).forEach((a: any) => {
          if (a.colaborador_id && a.data_alvo) {
            afastamentosAprovados.push({
              colaborador_id: a.colaborador_id,
              data_alvo: String(a.data_alvo).slice(0, 10),
              data_fim: a.data_fim ? String(a.data_fim).slice(0, 10) : null,
            });
          }
        });
      } catch (e) {
        console.warn("pendencias/afastamentos:", e);
      }

      const afastadoMesInteiroCache = new Map<string, boolean>();
      const afastadoMesInteiro = (c: ColabElegibilidade, comp: string): boolean => {
        const chave = `${c.id}:${comp}`;
        const cache = afastadoMesInteiroCache.get(chave);
        if (cache !== undefined) return cache;
        const cobre = afastamentosAprovados.some(
          (a) =>
            a.colaborador_id === c.id &&
            afastamentoCobreCompetencia({
              competencia: comp,
              afastamentoInicio: a.data_alvo,
              afastamentoFim: a.data_fim,
              admissao: c.data_admissao ?? null,
              desligamento: c.data_desligamento ?? null,
            }),
        );
        afastadoMesInteiroCache.set(chave, cobre);
        return cobre;
      };

      /**
       * Quem está devendo o documento na unidade/competência.
       * Falta de todos → 1 pendência da unidade; falta parcial → 1 por pessoa.
       */
      const elegibilidadeDe = (
        tipo: DocTipoColaborador,
        c: ColabElegibilidade,
        unidade: { possui_relogio_ponto: boolean | null; dia_adiantamento?: number | null },
        comp: string,
      ) =>
        elegivelDocumento(tipo, c, {
          competencia: comp,
          unidadeTemRelogio: unidade.possui_relogio_ponto === true,
          diaAdiantamento: unidade.dia_adiantamento ?? null,
          exigirContrachequeMesDesligamento: cfg.exigir_contracheque_mes_desligamento,
          optanteNaCompetencia:
            tipo === "adiantamento"
              ? optanteNaCompetencia(solicitacoesPorColab.get(c.id), comp, c.optante_adiantamento)
              : undefined,
          intermitenteSemRegistros: !intermitenteTemEvidencia(c.id, comp),
          intermitenteTrabalho: confirmacaoIntermitente.get(`${c.id}:${comp}`) ?? null,
          afastadoMesInteiro: tipo === "ponto" ? afastadoMesInteiro(c, comp) : false,
        });


      const faltantesDocumento = (
        tipo: DocTipoColaborador,
        docs: Set<string>,
        unidade: { id: string; possui_relogio_ponto: boolean | null; dia_adiantamento?: number | null },
        comp: string,
      ) => {
        const elegiveis = (colabsPorUnidade.get(unidade.id) ?? []).filter(
          (c) => elegibilidadeDe(tipo, c, unidade, comp) && ativoNaCompetencia(c as any, comp),
        );
        const faltantes = elegiveis.filter((c) => !docs.has(`${c.id}:${comp}`));
        // Só é "lote completo" com mais de um elegível; com um só, informar o nome.
        return {
          elegiveis,
          faltantes,
          completo: elegiveis.length > 1 && faltantes.length === elegiveis.length,
        };
      };

      // Competências esperadas por unidade (a partir de 1 mês antes do cadastro)
      const compsPorUnidade = new Map<string, { ateAnterior: string[]; ateVigente: string[] }>();
      unidades.forEach((u) => {
        compsPorUnidade.set(u.id, {
          ateAnterior: competenciasParaCobrar({ cadastroISO: u.created_at, ultima: compAnterior }),
          ateVigente: competenciasParaCobrar({ cadastroISO: u.created_at, ultima: compVigente }),
        });
      });
      const todasComps = Array.from(compsPorUnidade.values()).flatMap((c) => c.ateVigente);
      const menorComp = todasComps.length ? todasComps.slice().sort()[0] : compVigente;
      const rangeInicio = intervaloCompetencia(menorComp).inicio;
      const rangeFim = intervaloCompetencia(compVigente).fim;
      // Uma folha de ponto já importada confirma que o intermitente trabalhou
      // naquela competência, ainda que não haja marcação alguma.
      folhasPontoImportadas = await carregarTipo("ponto", rangeInicio, rangeFim);

      // 3-5. Documentos do colaborador (contracheque, adiantamento, folha de ponto).
      // Falta de todos os elegíveis → 1 pendência da unidade; falta parcial → 1 por pessoa.
      const emitirDocumentos = async (opts: {
        tipo: DocTipoColaborador;
        rotuloTipo: string;
        titulo: string;
        icon: LucideIcon;
        idPrefix: string;
        icludeUnidade: (u: (typeof unidades)[number]) => boolean;
        comps: (u: (typeof unidades)[number]) => string[];
        vencimentoDe: (u: (typeof unidades)[number], comp: string) => string;
      }) => {
        const docs = await carregarTipo(opts.tipo, rangeInicio, rangeFim);
        for (const u of unidades) {
          if (!opts.icludeUnidade(u)) continue;
          for (const comp of opts.comps(u)) {
            const { faltantes, completo } = faltantesDocumento(opts.tipo, docs, u, comp);
            if (faltantes.length === 0) continue;
            const vencimento = opts.vencimentoDe(u, comp);
            const atrasoDias = atrasoEmDias(vencimento, hojeISO);
            const url = `/dp/documentos?tipo=${opts.tipo}&competencia=${comp}&unidade=${u.id}`;
            const compId = `${comp.slice(0, 4)}-${Number(comp.slice(5, 7))}`;
            if (completo) {
              results.push({
                id: `${opts.idPrefix}-${u.id}-${compId}`,
                icon: opts.icon,
                titulo: opts.titulo,
                subtitulo: `${u.nome} — ${competenciaLabel(comp)}`,
                tipo: opts.rotuloTipo,
                unidadeNome: u.nome,
                vencimento,
                atrasoDias,
                url,
                docTipo: opts.tipo,
                unidadeId: u.id,
                competencia: comp,
                escopo: "unidade",
                pessoas: faltantes.map((c) => ({
                  nome: c.nome,
                  desligamento: (c.data_desligamento as string | null) ?? null,
                })),
                totalElegiveis: faltantes.length,
              });
              continue;
            }
            for (const c of faltantes) {
              const desligado = c.data_desligamento
                ? ` · desligado em ${format(new Date(`${String(c.data_desligamento).slice(0, 10)}T12:00:00`), "dd/MM")}`
                : "";
              results.push({
                id: `${opts.idPrefix}-${c.id}-${compId}`,
                icon: opts.icon,
                titulo: opts.titulo,
                subtitulo: `${c.nome} · ${u.nome} — ${competenciaLabel(comp)}${desligado}`,
                tipo: opts.rotuloTipo,
                colaboradorNome: c.nome,
                unidadeNome: u.nome,
                vencimento,
                atrasoDias,
                url,
                docTipo: opts.tipo,
                unidadeId: u.id,
                colaboradorId: c.id,
                competencia: comp,
                escopo: "pessoa",
                pessoas: [
                  {
                    nome: c.nome,
                    desligamento: (c.data_desligamento as string | null) ?? null,
                  },
                ],
                totalElegiveis: 1,
              });
            }
          }
        }
      };

      await emitirDocumentos({
        tipo: "contracheque",
        rotuloTipo: "Contracheque",
        titulo: "Contracheque não importado",
        icon: FileText,
        idPrefix: "contracheque",
        icludeUnidade: () => true,
        comps: (u) => compsPorUnidade.get(u.id)?.ateAnterior ?? [],
        vencimentoDe: (_u, comp) => limiteMesSeguinte(comp, cfg.alerta_contracheque_dia_mes),
      });

      await emitirDocumentos({
        tipo: "adiantamento",
        rotuloTipo: "Adiantamento",
        titulo: "Adiantamento não importado",
        icon: Coins,
        idPrefix: "adiantamento",
        icludeUnidade: (u) => !!u.tem_adiantamento && !!u.dia_adiantamento,
        comps: (u) => compsPorUnidade.get(u.id)?.ateVigente ?? [],
        vencimentoDe: (u, comp) =>
          limiteNoMes(comp, (u.dia_adiantamento ?? 0) + cfg.alerta_adiantamento_offset),
      });

      await emitirDocumentos({
        tipo: "ponto",
        rotuloTipo: "Folha de Ponto",
        titulo: "Folha de ponto não importada",
        icon: Clock,
        idPrefix: "folha_ponto",
        icludeUnidade: (u) => !!u.possui_relogio_ponto,
        comps: (u) => compsPorUnidade.get(u.id)?.ateAnterior ?? [],
        vencimentoDe: (_u, comp) => limiteMesSeguinte(comp, cfg.alerta_folha_ponto_dia_mes),
      });

      // 5a. Intermitente sem nenhum registro na competência: ALERTA (não falta).
      // O gestor responde "trabalhou" (vira cobrança de ponto/contracheque) ou
      // "não trabalhou" (a competência fica quietinha, sem pendência).
      for (const u of unidades) {
        for (const comp of compsPorUnidade.get(u.id)?.ateAnterior ?? []) {
          for (const c of colabsPorUnidade.get(u.id) ?? []) {
            if (String(c.regime ?? "").toLowerCase() !== "intermitente") continue;
            if (!ativoNaCompetencia(c as any, comp)) continue;
             if (intermitenteTemEvidencia(c.id, comp)) continue; // há evidência
            if (confirmacaoIntermitente.has(`${c.id}:${comp}`)) continue; // já respondido
            const cobraria =
              elegibilidadeDe("contracheque", { ...c, regime: "clt" }, u, comp) ||
              elegibilidadeDe("ponto", { ...c, regime: "clt" }, u, comp);
            if (!cobraria) continue;
            const vencimento = limiteMesSeguinte(comp, cfg.alerta_folha_ponto_dia_mes);
            results.push({
              id: `intermitente-${c.id}-${comp.slice(0, 4)}-${Number(comp.slice(5, 7))}`,
              icon: Clock,
              titulo: "Confirmar trabalho de intermitente",
              subtitulo: `${c.nome} · ${u.nome} — ${competenciaLabel(comp)}: nenhum registro de trabalho. Trabalhou no mês?`,
              tipo: "Intermitente",
              colaboradorNome: c.nome,
              colaboradorId: c.id,
              competencia: comp,
              unidadeNome: u.nome,
              vencimento,
              atrasoDias: atrasoEmDias(vencimento, hojeISO),
              url: "/dp/cadastros/pendencias",
            });
          }
        }
      }

      // 5b. Rescisão não importada — vínculo encerrado na competência sem
      // documento de desligamento (TRCT/demonstrativo). Considera também os
      // vínculos do histórico: recontratar não apaga a cobrança do anterior.
      // Prazo legal do acerto: 10 dias corridos após o fim do vínculo.
      {
        const docs = await carregarTipo("rescisao", rangeInicio, rangeFim);
        let historicoVinculos: VinculoHistorico[] = [];
        try {
          const { data } = await supabase
            .from("dp_colaborador_historico_condicoes")
            .select(
              "colaborador_id, vigencia_inicio, vigencia_fim, regime, unidade_id, modo_continuidade",
            )
            .eq("company_id", selectedCompanyId!);
          historicoVinculos = (data ?? []) as unknown as VinculoHistorico[];
        } catch (e) {
          console.warn("pendencias/historico-vinculos:", e);
        }

        const unidadesValidas = new Set(unidades.map((u) => u.id));
        const encerradosPorUnidade = new Map<
          string,
          Array<VinculoEncerrado & { nome: string; recontratado: boolean }>
        >();
        colaboradoresDocs.forEach((c) => {
          for (const v of vinculosEncerrados(historicoVinculos, c, { todosRegimes: true })) {
            const unidadeId =
              v.unidadeId && unidadesValidas.has(v.unidadeId) ? v.unidadeId : c.unidade_id;
            if (!unidadeId) continue;
            const lista = encerradosPorUnidade.get(unidadeId) ?? [];
            lista.push({
              ...v,
              nome: c.nome,
              recontratado: String(c.data_desligamento ?? "").slice(0, 10) !== v.dataFim,
            });
            encerradosPorUnidade.set(unidadeId, lista);
          }
        });

        const feriadosPorUnidade = new Map<string, FeriadoRegra[]>();
        try {
          const { data } = await supabase
            .from("dp_unidade_feriados")
            .select("id, unidade_id, nome, tipo, data, dia, mes, ordinal, dia_semana, ativo")
            .eq("company_id", selectedCompanyId!)
            .eq("ativo", true);
          for (const r of (data ?? []) as any[]) {
            const l = feriadosPorUnidade.get(r.unidade_id) ?? [];
            l.push(r);
            feriadosPorUnidade.set(r.unidade_id, l);
          }
        } catch (e) {
          console.warn("pendencias/feriados-rescisao:", e);
        }

        // Aviso Prévio e Acerto Rescisório: cobrados por colaborador, a partir
        // do desligamento (sem janela de competência — o prazo é curto).
        const avisos = new Set<string>();
        const acertos = new Set<string>();
        try {
          const ids = Array.from(new Set(colaboradoresDocs.map((c) => c.id)));
          if (ids.length) {
            const { data } = await supabase
              .from("dp_documentos")
              .select("id, tipo, colaborador_id, referencia_data, comprovante_file_path, comprovante_modalidade, comprovante_pago_em, arquivado_em")
              .eq("company_id", selectedCompanyId!)
              .in("tipo", ["aviso_previo", "acerto_rescisorio"] as any)
              .gte("referencia_data", rangeInicio);
            const docsAcerto = ((data ?? []) as any[]).filter((d) => d.tipo === "acerto_rescisorio" && !d.arquivado_em);
            const recibos = new Map<string, any>();
            if (docsAcerto.length) {
              const { data: recs } = await supabase
                .from("dp_recibos")
                .select("documento_id, assinado_em, substituido_em")
                .in("documento_id", docsAcerto.map((d) => d.id));
              (recs ?? []).forEach((r: any) => recibos.set(r.documento_id, r));
            }
            for (const d of (data ?? []) as any[]) {
              if (!d.colaborador_id || d.arquivado_em) continue;
              if (d.tipo === "aviso_previo") { avisos.add(d.colaborador_id); continue; }
              const rec = recibos.get(d.id);
              // Recibo do sistema só quita assinado; upload externo (recibo de
              // papelaria assinado ou comprovante bancário) já quita.
              const quitado = !!d.comprovante_file_path || (d.comprovante_modalidade === "especie" && !!d.comprovante_pago_em) || !rec || (!!rec.assinado_em && !rec.substituido_em);
              if (quitado) acertos.add(`${d.colaborador_id}:${String(d.referencia_data).slice(0, 7)}`);
            }
          }
        } catch (e) {
          console.warn("pendencias/rescisao-momentos:", e);
        }

        for (const u of unidades) {
          const comps = new Set(compsPorUnidade.get(u.id)?.ateVigente ?? []);
          for (const v of encerradosPorUnidade.get(u.id) ?? []) {
            if (!comps.has(v.competencia)) continue;
            const anoFim = Number(v.dataFim.slice(0, 4));
            const vencimento = prazoLegalRescisao(v.dataFim);
            const util = prazoPagamentoRescisao(
              v.dataFim,
              datasDeFeriados(feriadosPorUnidade.get(u.id) ?? [], [anoFim, anoFim + 1]),
            );
            const dm = (s: string) => format(new Date(`${s}T12:00:00`), "dd/MM");
            const quando = dm(v.dataFim);
            const comp = v.competencia;
            const sufixo = `${v.colaboradorId}-${comp.slice(0, 4)}-${Number(comp.slice(5, 7))}`;
            const base = {
              tipo: "Rescisão",
              colaboradorNome: v.nome,
              unidadeNome: u.nome,
              competencia: comp,
            };
            const estado = v.recontratado ? "vínculo encerrado" : "desligado";
            const regime = String(v.regime ?? "").toLowerCase();

            // 1. Aviso Prévio — CLT, vence na data do desligamento.
            if (REGIMES_COM_AVISO_PREVIO.has(regime) && !avisos.has(v.colaboradorId)) {
              results.push({
                ...base,
                id: `rescisao-aviso-${sufixo}`,
                icon: FileMinus,
                titulo: "Aviso Prévio Pendente",
                subtitulo: `${v.nome} · ${u.nome} — ${estado} em ${quando} · importar o aviso assinado à mão`,
                vencimento: v.dataFim,
                atrasoDias: atrasoEmDias(v.dataFim, hojeISO),
                url: `/dp/documentos?tipo=aviso_previo&competencia=${comp}&unidade=${u.id}`,
              });
            }

            // 2. Documentos Rescisórios — assalariados (freelancer dispensado).
            if (elegivelRescisaoDoVinculo(v) && !docs.has(`${v.colaboradorId}:${comp}`)) {
              results.push({
                ...base,
                id: `rescisao-docs-${sufixo}`,
                icon: FileMinus,
                titulo: "Documentos Rescisórios A Importar",
                subtitulo: `${v.nome} · ${u.nome} — ${estado} em ${quando} · cálculo da contabilidade até ${dm(vencimento)}`,
                vencimento,
                atrasoDias: atrasoEmDias(vencimento, hojeISO),
                url: `/dp/documentos?tipo=desligamento&competencia=${comp}&unidade=${u.id}`,
              });
            }

            // 3. Acerto Rescisório — todos os vínculos; só baixa com recibo
            // assinado ou comprovante de pagamento.
            if (!acertos.has(`${v.colaboradorId}:${comp}`)) {
              results.push({
                ...base,
                id: `rescisao-${sufixo}`,
                icon: FileMinus,
                titulo: "Acerto Rescisório A Comprovar",
                subtitulo: `${v.nome} · ${u.nome} — ${estado} em ${quando} · pagar até ${dm(vencimento)} (multa Art. 477)${
                  util !== vencimento ? ` · por TED/depósito, até ${dm(util)}` : ""
                } · recibo assinado ou comprovante de pagamento`,
                vencimento,
                atrasoDias: atrasoEmDias(vencimento, hojeISO),
                url: `/dp/documentos?tipo=acerto_rescisorio&competencia=${comp}&unidade=${u.id}`,
              });
            }
          }
        }
      }


      // 6. Negociação coletiva pendente — por unidade + sindicato laboral
      try {
        const { data: sinds } = await supabase
          .from("dp_sindicatos")
          .select("id, nome")
          .eq("company_id", selectedCompanyId!)
          .eq("tipo", "laboral")
          .eq("ativo", true);
        const sindicatoNome = new Map<string, string>(
          (sinds ?? []).map((s: any) => [s.id, s.nome])
        );
        const sindIds = Array.from(sindicatoNome.keys());

        const unidadeIdsAtivas = unidades.map((u) => u.id);
        const parByUnidade = new Map<string, Set<string>>();
        const addPar = (unidadeId: string, sindId: string) => {
          if (!unidadeIdsAtivas.includes(unidadeId)) return;
          if (!sindicatoNome.has(sindId)) return;
          if (!parByUnidade.has(unidadeId)) parByUnidade.set(unidadeId, new Set());
          parByUnidade.get(unidadeId)!.add(sindId);
        };

        if (sindIds.length > 0 && unidadeIdsAtivas.length > 0) {
          const { data: uc } = await supabase
            .from("dp_unidade_cargos")
            .select("unidade_id, cargo_id")
            .in("unidade_id", unidadeIdsAtivas);
          const cargoIds = Array.from(new Set((uc ?? []).map((r: any) => r.cargo_id)));
          if (cargoIds.length > 0) {
            const { data: sc } = await supabase
              .from("dp_sindicato_cargos")
              .select("sindicato_id, cargo_id")
              .in("cargo_id", cargoIds)
              .in("sindicato_id", sindIds);
            const sindByCargo = new Map<string, string[]>();
            (sc ?? []).forEach((r: any) => {
              if (!sindByCargo.has(r.cargo_id)) sindByCargo.set(r.cargo_id, []);
              sindByCargo.get(r.cargo_id)!.push(r.sindicato_id);
            });
            (uc ?? []).forEach((r: any) => {
              (sindByCargo.get(r.cargo_id) ?? []).forEach((sid) => addPar(r.unidade_id, sid));
            });
          }

          const { data: negPairs } = await supabase
            .from("dp_sindicato_negociacoes")
            .select("unidade_id, sindicato_id, sindicato_laboral_id")
            .eq("company_id", selectedCompanyId!)
            .not("unidade_id", "is", null);
          (negPairs ?? []).forEach((r: any) => {
            const sid = r.sindicato_laboral_id ?? r.sindicato_id;
            if (r.unidade_id && sid) addPar(r.unidade_id, sid);
          });
        }

        const unidadeMap = new Map(unidades.map((u) => [u.id, u.nome]));

        // Última negociação por par unidade×sindicato — 1 query só (evita N+1).
        const ultimaPorPar = new Map<string, { ano: number; mes: number }>();
        {
          const { data: todasNegs } = await supabase
            .from("dp_sindicato_negociacoes")
            .select("ano, mes, unidade_id, sindicato_id, sindicato_laboral_id")
            .eq("company_id", selectedCompanyId!)
            .not("unidade_id", "is", null)
            .not("ano", "is", null)
            .not("mes", "is", null);
          (todasNegs ?? []).forEach((n: any) => {
            const sid = n.sindicato_laboral_id ?? n.sindicato_id;
            if (!n.unidade_id || !sid) return;
            const key = `${n.unidade_id}|${sid}`;
            const atual = ultimaPorPar.get(key);
            if (!atual || n.ano > atual.ano || (n.ano === atual.ano && n.mes > atual.mes)) {
              ultimaPorPar.set(key, { ano: n.ano, mes: n.mes });
            }
          });
        }

        for (const [unidadeId, sindSet] of parByUnidade.entries()) {
          const unidadeNome = unidadeMap.get(unidadeId);
          if (!unidadeNome) continue;
          for (const sindId of sindSet) {
            const nomeSind = sindicatoNome.get(sindId) ?? "Sindicato";
            const ultima = ultimaPorPar.get(`${unidadeId}|${sindId}`) ?? null;

            const id = `negociacao-${unidadeId}-${sindId}`;
            if (!ultima) {
              results.push({
                id,
                icon: Scale,
                titulo: `Negociação coletiva pendente — ${nomeSind}`,
                subtitulo: `${unidadeNome} — nenhuma negociação cadastrada. Cadastre uma nova para renovar.`,
                tipo: "Negociação",
                unidadeNome,
                vencimento: ymd(today),
                atrasoDias: 0,
                url: `/dp/cadastros/unidades?editar=${unidadeId}&aba=sindicato`,
              });
              continue;
            }
            const anoUltimo = ultima.ano ?? 0;
            const mesUltimo = ultima.mes ?? 0;
            // Vencimento = último dia do mesmo mês da última negociação, um ano depois
            const vencimento = new Date(anoUltimo + 1, mesUltimo, 0);
            const inicioAtraso = new Date(vencimento);
            inicioAtraso.setDate(inicioAtraso.getDate() + 1);
            const dias = differenceInCalendarDays(today, inicioAtraso);
            const diasAteVencimento = differenceInCalendarDays(vencimento, today);
            if (diasAteVencimento <= cfg.alerta_negociacao_dias) {
              const mesVenc = String(mesUltimo).padStart(2, "0");
              const jaVenceu = diasAteVencimento < 0;
              results.push({
                id,
                icon: Scale,
                titulo: `Negociação coletiva pendente — ${nomeSind}`,
                subtitulo: `${unidadeNome} — última ${String(mesUltimo).padStart(2, "0")}/${anoUltimo} · ${jaVenceu ? "venceu" : "vence"} em ${mesVenc}/${anoUltimo + 1}. Cadastre nova negociação para renovar.`,
                tipo: "Negociação",
                unidadeNome,
                vencimento: ymd(vencimento),
                atrasoDias: dias,
                url: `/dp/cadastros/unidades?editar=${unidadeId}&aba=sindicato`,
              });
            }
          }
        }
      } catch (e) {
        console.warn("pendencias/negociacoes:", e);
      }

      // 6.1. Regras de folgas não cadastradas — sem elas a rotina de folgas fica travada
      try {
        const { data: regras } = await supabase
          .from("dp_config_dp")
          .select("unidade_id")
          .eq("company_id", selectedCompanyId!);
        const comRegra = new Set((regras ?? []).map((r: any) => r.unidade_id).filter(Boolean));
        const semRegra = unidades.filter((u) => !comRegra.has(u.id));
        if ((regras ?? []).length === 0) {
          results.push({
            id: "regras-folgas-empresa",
            icon: Scale,
            titulo: "Regras de folgas não cadastradas",
            subtitulo: "Sem as regras de folga o sistema não gera a folga dominical nem valida trocas. Cadastre agora.",
            tipo: "Regras",
            atrasoDias: 0,
            url: "/dp/folgas?aba=regras",
          });
        } else {
          semRegra.slice(0, 10).forEach((u) => {
            results.push({
              id: `regras-folgas-${u.id}`,
              icon: Scale,
              titulo: "Regras de folgas não cadastradas",
              subtitulo: `${u.nome} — a unidade está sem regra própria de folgas. Revise e salve as regras.`,
              tipo: "Regras",
              unidadeNome: u.nome,
              atrasoDias: 0,
              url: `/dp/folgas?aba=regras&unidade=${u.id}`,
            });
          });
        }
      } catch (e) {
        console.warn("pendencias/regras-folgas:", e);
      }


      // 6b. Conformidade do ponto (Art. 74 CLT): unidade com mais de 20 ativos sem ponto e sem justificativa.
      try {
        const ids = unidades.map((u) => u.id);
        if (ids.length) {
          const [{ data: uj }, { data: ativosRows }] = await Promise.all([
            supabase.from("dp_unidades").select("id, relogio_ponto_dispensa_justificativa").in("id", ids),
            supabase
              .from("dp_colaboradores")
              .select("unidade_id")
              .in("unidade_id", ids)
              .eq("ativo", true)
              .is("deleted_at", null)
              .is("data_desligamento", null),
          ]);
          const just = new Map((uj ?? []).map((r: any) => [r.id, r.relogio_ponto_dispensa_justificativa as string | null]));
          const cont = new Map<string, number>();
          (ativosRows ?? []).forEach((c: any) => c.unidade_id && cont.set(c.unidade_id, (cont.get(c.unidade_id) ?? 0) + 1));
          unidades.forEach((u) => {
            const ativos = cont.get(u.id) ?? 0;
            if (conformidadePonto({ possui_relogio_ponto: u.possui_relogio_ponto, relogio_ponto_dispensa_justificativa: just.get(u.id) }, ativos) !== "irregular") return;
            results.push({
              id: `ponto-art74-${u.id}`,
              icon: AlertTriangle,
              titulo: "Registro de ponto obrigatório (Art. 74 da CLT)",
              subtitulo: `${u.nome} — ${ativos} colaboradores ativos sem relógio de ponto e sem justificativa. Ative o ponto ou registre a justificativa.`,
              tipo: "Conformidade",
              unidadeNome: u.nome,
              unidadeId: u.id,
              urgente: true,
              atrasoDias: 0,
              url: `/dp/cadastros/unidades?editar=${u.id}&aba=dados`,
            });
          });
        }
      } catch (e) {
        console.warn("pendencias/ponto-art74:", e);
      }

      // 6c. Feriados municipais/estaduais: unidade sem feriado local e sem ciência do gestor.
      try {
        const ids = unidades.map((u) => u.id);
        if (ids.length) {
          const [{ data: uc }, { data: fr }] = await Promise.all([
            (supabase as any).from("dp_unidades").select("id, feriados_locais_ciente_em").in("id", ids),
            supabase.from("dp_unidade_feriados").select("unidade_id, tipo, dia, mes, ativo").in("unidade_id", ids),
          ]);
          const ciente = new Map(((uc ?? []) as any[]).map((r) => [r.id, r.feriados_locais_ciente_em as string | null]));
          const porUnidade = new Map<string, any[]>();
          (fr ?? []).forEach((f: any) => {
            const l = porUnidade.get(f.unidade_id) ?? [];
            l.push(f);
            porUnidade.set(f.unidade_id, l);
          });
          unidades.forEach((u) => {
            if (!faltaFeriadoLocal(porUnidade.get(u.id) ?? [], ciente.get(u.id))) return;
            results.push({
              id: `feriados-locais-${u.id}`,
              icon: AlertTriangle,
              titulo: "Cadastrar feriados municipais e estaduais",
              subtitulo: `${u.nome} — só tem feriados nacionais. Cadastre os feriados da cidade/estado ou confirme que não há.`,
              tipo: "Feriados",
              unidadeNome: u.nome,
              unidadeId: u.id,
              atrasoDias: 0,
              url: `/dp/cadastros/unidades?editar=${u.id}&aba=feriados`,
            });
          });
        }
      } catch (e) {
        console.warn("pendencias/feriados-locais:", e);
      }

      // 7. Férias — períodos aquisitivos com saldo perto do limite concessivo
      try {
        const limite = new Date(today);
        limite.setDate(limite.getDate() + cfg.alerta_ferias_dias);
        const { data: periodos } = await supabase
          .from("dp_ferias_periodos")
          .select("id, colaborador_id, fim_aquisitivo, limite_concessivo, dias_saldo, dp_colaboradores(nome, vinculo_label, ativo, regime)")
          .eq("company_id", selectedCompanyId!)
          .eq("controle_externo", false)
          .gt("dias_saldo", 0)
          .or(`limite_concessivo.lte.${ymd(limite)},fim_aquisitivo.lte.${hojeISO}`)
          .order("limite_concessivo", { ascending: true })
          .limit(60);
        // Para saber quem já está no segundo ano aquisitivo sem ter tirado o
        // primeiro, precisamos de todos os períodos (inclusive em aquisição).
        const { data: todosPeriodos } = await supabase
          .from("dp_ferias_periodos")
          .select("id, colaborador_id, inicio_aquisitivo, dias_saldo, controle_externo")
          .eq("company_id", selectedCompanyId!)
          .limit(2000);
        const idsAcumulo = periodosComAcumulo((todosPeriodos ?? []) as any[]);
        (periodos ?? []).forEach((p: any) => {
          // Sócio não tem férias legais; desligado não agenda férias.
          const vinculo = String(p.dp_colaboradores?.vinculo_label ?? "").toLowerCase();
          if (vinculo.includes("sóci")) return;
          if (p.dp_colaboradores?.ativo === false) return;
          if (!regimeTemFeriasLegais(p.dp_colaboradores?.regime)) return;
          const vencimento = new Date(`${p.limite_concessivo}T00:00:00`);
          let dias = differenceInCalendarDays(today, vencimento);
          const alerta = alertaPendenciaFerias({
            fimAquisitivo: p.fim_aquisitivo,
            limiteConcessivo: p.limite_concessivo,
            diasSaldo: p.dias_saldo,
            hojeISO,
            politica: feriasConfig.sinalizacaoCicloEncerrado,
            acumulo: idsAcumulo.has(p.id),
          });
          // O prazo já não cabe o descanso inteiro: conta como atraso real
          // (dias que já não caberão dentro do prazo legal).
          if (alerta.nivel === "marcacao_atrasada" && dias < 0) {
            dias = Math.max(1, (p.dias_saldo ?? 0) - Math.abs(dias));
          }
          results.push({
            id: `ferias-${p.id}`,
            icon: Palmtree,
            titulo: alerta.titulo,
            subtitulo: `${p.dp_colaboradores?.nome ?? "Colaborador"} — ${p.dias_saldo} dia(s) de saldo · ${alerta.detalhePrazo}`,
            tipo: "Férias",
            colaboradorNome: p.dp_colaboradores?.nome ?? null,
            vencimento: ymd(vencimento),
            atrasoDias: dias,
            // Ainda dentro do prazo legal, mas já em risco de pagar em dobro:
            // precisa aparecer no topo, junto do que está atrasado.
            urgente: alerta.nivel === "atencao" || alerta.nivel === "marcacao_atrasada",
            url: `/dp/ferias?colaborador=${p.colaborador_id}`,
          });
        });
      } catch (e) {
        console.warn("pendencias/ferias:", e);
      }

      // 7c. Aviso de férias sem registro/ciência e recibo de férias faltando
      try {
        const { data: gozos } = await supabase
          .from("dp_ferias_gozos")
          .select("id, colaborador_id, data_inicio, data_fim, status, aviso_em, ciente_em, dp_colaboradores(nome, ativo)")
          .eq("company_id", selectedCompanyId!)
          .in("status", ["aprovado", "em_gozo", "concluido"])
          .order("data_inicio", { ascending: true })
          .limit(200);
        const ids = (gozos ?? []).map((g: any) => g.id);
        const { data: docsFerias } = ids.length
          ? await supabase
              .from("dp_documentos")
              .select("ferias_gozo_id, tipo")
              .eq("company_id", selectedCompanyId!)
              .in("ferias_gozo_id", ids)
          : { data: [] as any[] };
        const comRecibo = new Set(
          (docsFerias ?? [])
            .filter((d: any) => d.tipo === "recibo_ferias")
            .map((d: any) => d.ferias_gozo_id as string),
        );
        (gozos ?? []).forEach((g: any) => {
          const nome = g.dp_colaboradores?.nome ?? "Colaborador";
          // Aviso: precisa sair 30 dias antes do início.
          if (!g.aviso_em && g.status === "aprovado") {
            const dias = differenceInCalendarDays(
              today,
              new Date(`${g.data_inicio}T00:00:00`),
            ) + AVISO_FERIAS_PRAZO_DIAS;
            results.push({
              id: `ferias-aviso-${g.id}`,
              icon: Palmtree,
              titulo: "Aviso de férias não registrado",
              subtitulo: `${nome} — férias começam em ${g.data_inicio.split("-").reverse().join("/")}. A lei pede aviso 30 dias antes.`,
              tipo: "Férias",
              colaboradorNome: nome,
              atrasoDias: dias,
              urgente: dias > 0,
              url: `/dp/ferias?colaborador=${g.colaborador_id}`,
            });
          }
          // Recibo emitido pela contabilidade: exigido depois do início.
          if (g.data_inicio <= hojeISO && !comRecibo.has(g.id)) {
            results.push({
              id: `ferias-recibo-${g.id}`,
              icon: FileText,
              titulo: "Recibo de férias não anexado",
              subtitulo: `${nome} — férias de ${g.data_inicio.split("-").reverse().join("/")}. Anexe o recibo emitido pela contabilidade.`,
              tipo: "Férias",
              colaboradorNome: nome,
              atrasoDias: differenceInCalendarDays(today, new Date(`${g.data_inicio}T00:00:00`)),
              url: `/dp/ferias?colaborador=${g.colaborador_id}`,
            });
          }
        });
      } catch (e) {
        console.warn("pendencias/ferias-documentos:", e);
      }

      // 7b. Licenças (maternidade/paternidade) — retorno se aproximando ou vencido
      try {
        const limiteRetorno = new Date(today);
        limiteRetorno.setDate(limiteRetorno.getDate() + LEMBRETE_RETORNO_DIAS);
        const { data: licencas } = await supabase
          .from("dp_solicitacoes")
          .select("id, colaborador_id, tipo, data_alvo, data_fim, retorno_confirmado_em, dp_colaboradores(nome, ativo)")
          .is("removido_em", null)
          .eq("company_id", selectedCompanyId!)
          .in("tipo", [...TIPOS_LICENCA])
          .eq("status", "aprovada")
          .is("retorno_confirmado_em", null)
          .not("data_fim", "is", null)
          .lte("data_alvo", hojeISO)
          .lte("data_fim", ymd(limiteRetorno))
          .order("data_fim", { ascending: true })
          .limit(30);
        (licencas ?? []).forEach((l: any) => {
          if (l.dp_colaboradores?.ativo === false) return;
          const situacao = situacaoRetorno(
            { colaborador_id: l.colaborador_id, tipo: l.tipo, data_alvo: l.data_alvo, data_fim: l.data_fim },
            today,
          );
          if (situacao !== "lembrete" && situacao !== "vencido") return;
          const fim = new Date(`${l.data_fim}T00:00:00`);
          const dias = differenceInCalendarDays(today, fim);
          const rotulo = labelAfastamento(l.tipo);
          results.push({
            id: `licenca-${l.id}`,
            icon: Baby,
            titulo: situacao === "vencido" ? `Retorno de ${rotulo.toLowerCase()} vencido` : `Retorno de ${rotulo.toLowerCase()} se aproximando`,
            subtitulo: situacao === "vencido"
              ? `${l.dp_colaboradores?.nome ?? "Colaborador"} — retorno previsto era ${format(fim, "dd/MM/yyyy")}. Confirme o retorno ou prorrogue.`
              : `${l.dp_colaboradores?.nome ?? "Colaborador"} — retorno previsto em ${format(fim, "dd/MM/yyyy")}. Prepare a reintegração.`,
            tipo: "Licença",
            colaboradorNome: l.dp_colaboradores?.nome ?? null,
            colaboradorId: l.colaborador_id,
            vencimento: ymd(fim),
            atrasoDias: dias,
            urgente: situacao === "vencido",
            url: "/dp/atestados?aba=historico",
            licenca: {
              solicitacaoId: l.id,
              tipo: l.tipo,
              dataInicio: String(l.data_alvo).slice(0, 10),
              dataFimPrevista: String(l.data_fim).slice(0, 10),
            },

          });
        });
      } catch (e) {
        console.warn("pendencias/licencas:", e);
      }

      // 9. Contingência: a rotina automática já fechou o mês vigente (23:59 do último
      // dia do mês anterior). Quem continua sem folga indica falha do sistema.
      try {
        {
          const inicioProx = new Date(anoVigente, mesVigente - 1, 1);
          const fimProx = new Date(anoVigente, mesVigente, 0);
          const [{ data: colabs }, { data: folgas }, { data: cfgs }, { data: sols }, { data: gozosMes }] = await Promise.all([
            supabase
              .from("dp_colaboradores")
              .select("id, nome, regime, vinculo_label, forma_pagamento, data_admissao, data_desligamento")
              .eq("company_id", selectedCompanyId!)
              .eq("ativo", true)
              .is("deleted_at", null),
            supabase
              .from("dp_folgas")
              .select("colaborador_id")
              .eq("company_id", selectedCompanyId!)
              .neq("status", "cancelada")
              .gte("data", ymd(inicioProx))
              .lte("data", ymd(fimProx)),
            supabase
              .from("dp_colaborador_config_trabalho")
              .select("colaborador_id, folga_fixa_dow, dias:dp_colaborador_config_dias(dow, trabalha)")
              .eq("company_id", selectedCompanyId!)
              .is("vigencia_fim", null),
            supabase
              .from("dp_solicitacoes")
              .select("colaborador_id")
              .eq("company_id", selectedCompanyId!)
              .eq("tipo", "folga")
              .eq("status", "aprovada")
              .gte("data_alvo", ymd(inicioProx))
              .lte("data_alvo", ymd(fimProx)),
            supabase
              .from("dp_ferias_gozos")
              .select("colaborador_id, data_inicio, data_fim")
              .eq("company_id", selectedCompanyId!)
              .in("status", ["aprovado", "em_gozo", "concluido"])
              .lte("data_inicio", ymd(fimProx))
              .gte("data_fim", ymd(inicioProx)),
          ]);
          // Férias que cobrem o mês inteiro dispensam a folga mensal.
          const feriasMesInteiro = new Set(
            (gozosMes ?? [])
              .filter(
                (g: any) =>
                  String(g.data_inicio).slice(0, 10) <= ymd(inicioProx) &&
                  String(g.data_fim).slice(0, 10) >= ymd(fimProx),
              )
              .map((g: any) => g.colaborador_id),
          );
          const comFolga = new Set([
            ...(folgas ?? []).map((f: any) => f.colaborador_id),
            ...(sols ?? []).map((s: any) => s.colaborador_id),
          ]);
          // Quem já não trabalha no domingo (folga fixa ou grade semanal) não precisa de folga mensal marcada.
          const semDomingo = new Set(
            (cfgs ?? [])
              .filter((c: any) =>
                c.folga_fixa_dow === 0 ||
                (Array.isArray(c.dias) && c.dias.some((d: any) => d.dow === 0 && d.trabalha === false)),
              )
              .map((c: any) => c.colaborador_id),
          );
          // Mesmo critério do banco (dp_folga_exige_descanso_fds): CLT e freelancer mensalista, sem sócios.
          const elegiveis = (colabs ?? []).filter((c: any) => {
            const r = String(c.regime ?? "clt");
            const freelaMensal = r === "freelancer" && c.forma_pagamento === "mensalista";
            if (r !== "clt" && !freelaMensal) return false;
            const v = String(c.vinculo_label ?? "").toLowerCase();
            if (v === "socio" || v === "sócio") return false;
            if (semDomingo.has(c.id)) return false;
            // Afastamento (licença/atestado longo) ou férias cobrindo o mês
            // inteiro dispensam a folga mensal — não há dias trabalhados.
            if (feriasMesInteiro.has(c.id)) return false;
            if (afastadoMesInteiro(c as ColabElegibilidade, ymd(inicioProx).slice(0, 7))) return false;
            return true;
          });
          const faltantes = elegiveis.filter((c: any) => !comFolga.has(c.id));
          const semEscala = faltantes.length;
          if (semEscala > 0) {
            const prazo = inicioProx;
            const nomes = faltantes
              .map((c: any) => String(c.nome ?? "").trim().split(/\s+/).slice(0, 2).join(" "))
              .filter(Boolean)
              .join(", ");
            results.push({
              id: `sem-folga-${anoVigente}-${mesVigente}`,
              icon: Clock,
              titulo: "Colaborador Sem Folga no Mês",
              subtitulo: `A distribuição automática não definiu folga em ${MES_NOME[inicioProx.getMonth()]} para: ${nomes}. Abra o calendário e marque o dia manualmente.`,
              tipo: "Escala",
              vencimento: ymd(prazo),
              atrasoDias: differenceInCalendarDays(today, prazo),
              url: `/dp/folgas?aba=calendario&mes=${inicioProx.getFullYear()}-${String(inicioProx.getMonth() + 1).padStart(2, "0")}`,
            });
          }
        }
      } catch (e) {
        console.warn("pendencias/escala:", e);
      }

      // 10. Lotes de importação sem unidade identificada
      try {
        const { data: lotes } = await supabase
          .from("dp_bulk_import_batches")
          .select("id, tipo, source_file_name, referencia_data, created_at, status, unidade_id")
          .eq("company_id", selectedCompanyId!)
          .is("unidade_id", null)
          .eq("status", "ready")
          .order("created_at", { ascending: true })
          .limit(10);
        const loteIds = (lotes ?? []).map((l: any) => l.id);
        const { data: itensLote } = loteIds.length
          ? await supabase
            .from("dp_bulk_import_items")
            .select("batch_id, detected_unidade_id, matched_colaborador_id, status")
            .in("batch_id", loteIds)
          : { data: [] };
        const itensPorLote = new Map<string, any[]>();
        (itensLote ?? []).forEach((item: any) => {
          const atuais = itensPorLote.get(item.batch_id) ?? [];
          atuais.push(item);
          itensPorLote.set(item.batch_id, atuais);
        });
        (lotes ?? []).forEach((l: any) => {
          const itensAtivos = (itensPorLote.get(l.id) ?? []).filter((item: any) => item.status !== "rejected");
          const todosComUnidade = itensAtivos.length > 0 && itensAtivos.every(
            (item: any) => !!item.detected_unidade_id || !!unidadeDoColab.get(item.matched_colaborador_id),
          );
          // Um lote pode ser multiunidade. Se cada página já conhece sua unidade,
          // não existe pendência de identificação do cabeçalho.
          if (todosComUnidade) return;
          const vencimento = new Date(l.created_at);
          vencimento.setDate(vencimento.getDate() + 2);
          results.push({
            id: `lote-sem-unidade-${l.id}`,
            icon: FileText,
            titulo: "Unidade não Identificada no Lote",
            subtitulo: `${l.source_file_name ?? "Importação"} (${l.tipo}) — vincule a unidade para liberar a aprovação`,
            tipo: "Importação",
            vencimento: ymd(vencimento),
            atrasoDias: differenceInCalendarDays(today, vencimento),
            url: `/dp/documentos?lote=${l.id}`,
          });
        });
      } catch (e) {
        console.warn("pendencias/lotes-unidade:", e);
      }

      // 11. Tabela anual do salário-família (INSS reajusta todo ano)
      try {
        const { data: cfgSf } = await supabase
          .from("dp_config_dp")
          .select(
            "salario_familia_cota, salario_familia_teto, salario_familia_vigencia, salario_familia_confirmado_em",
          )
          .eq("company_id", selectedCompanyId!)
          .is("unidade_id", null)
          .maybeSingle();
        const { buscarSalarioFamiliaVigente } = await import("@/lib/dp/salarioFamiliaVigente");
        const vigSf = await buscarSalarioFamiliaVigente(selectedCompanyId!);
        const sfConfig = vigSf
          ? { cota: vigSf.cota, teto: vigSf.teto, vigencia: vigSf.vigencia_inicio, confirmadoEm: vigSf.vigencia_inicio }
          : {
              cota: cfgSf?.salario_familia_cota != null ? Number(cfgSf.salario_familia_cota) : null,
              teto: cfgSf?.salario_familia_teto != null ? Number(cfgSf.salario_familia_teto) : null,
              vigencia: cfgSf?.salario_familia_vigencia ?? null,
              confirmadoEm: cfgSf?.salario_familia_confirmado_em ?? null,
            };
        if (tabelaSalarioFamiliaVencida(sfConfig, ymd(today))) {
          // Prazo prático: primeira folha do ano (fim de janeiro).
          const prazo = new Date(anoVigente, 0, 31);
          results.push({
            id: `salario-familia-${anoVigente}`,
            icon: Coins,
            titulo: "Atualizar Tabela do Salário-Família",
            subtitulo: sfConfig.vigencia
              ? `Valores de ${sfConfig.vigencia.slice(0, 4)} — confirme a cota e o teto de ${anoVigente}`
              : "Cadastre a cota por dependente e o teto de baixa renda",
            tipo: "Salário-família",
            vencimento: ymd(prazo),
            atrasoDias: differenceInCalendarDays(today, prazo),
            url: "/dp/cadastros/cargos?aba=complementos",
          });
        }
      } catch (e) {
        console.warn("pendencias/salario-familia:", e);
      }

      // 12. Documentos de dependentes (vacinação, frequência escolar, laudo)
      try {
        const { data: deps } = await supabase
          .from("dp_dependentes")
          .select(
            "id, colaborador_id, nome, data_nascimento, parentesco, cpf, deficiencia, laudo_validade, conta_irrf, conta_salario_familia, vacinacao_em, frequencia_escolar_em, cessado_em, observacao, dp_colaboradores(nome)",
          )
          .eq("company_id", selectedCompanyId!)
          .is("cessado_em", null);
        const porId = new Map(
          (deps ?? []).map((d: any) => [d.id as string, d.dp_colaboradores?.nome ?? "Colaborador"]),
        );
        const colabDoDep = new Map(
          (deps ?? []).map((d: any) => [d.id as string, d.colaborador_id as string]),
        );
        alertasDependentes((deps ?? []) as any, ymd(today)).forEach((a) => {
          const colabId = colabDoDep.get(a.dependenteId);
          results.push({
            id: `dependente-${a.dependenteId}-${a.tipo}`,
            icon: Users,
            titulo: a.titulo,
            subtitulo: `${a.nome} — dependente de ${porId.get(a.dependenteId) ?? "colaborador"}. ${a.descricao}`,
            tipo: "Dependente",
            colaboradorNome: porId.get(a.dependenteId) ?? null,
            vencimento: null,
            atrasoDias: a.severidade === "alta" ? 1 : 0,
            url: colabId
              ? `/dp/colaboradores?editar=${colabId}&aba=dependentes`
              : "/dp/colaboradores",
          });
        });
      } catch (e) {
        console.warn("pendencias/dependentes:", e);
      }

      // 13. Documentos obrigatórios de admissão faltando, vencidos ou recusados
      try {
        const [reqs, colabs, deps, vincs] = await Promise.all([
          supabase
            .from("dp_documento_requisitos")
            .select("*")
            .eq("company_id", selectedCompanyId!)
            .neq("obrigatoriedade", "desativado"),
          supabase
            .from("dp_colaboradores")
            .select(
              "id, nome, data_nascimento, regime, estado_civil, veiculo_proprio, aprendiz, possui_folha_ponto, dp_cargos(exige_cnh, exige_epi)",
            )
            .eq("company_id", selectedCompanyId!)
            .eq("ativo", true),
          supabase
            .from("dp_dependentes")
            .select("id, colaborador_id, nome, data_nascimento, deficiencia, cessado_em")
            .eq("company_id", selectedCompanyId!)
            .is("cessado_em", null),
          supabase
            .from("dp_colaborador_documentos")
            .select("*")
            .eq("company_id", selectedCompanyId!),
        ]);

        const requisitos = (reqs.data ?? []) as any[];
        if (requisitos.length > 0) {
          for (const c of (colabs.data ?? []) as any[]) {
            const itens = resolverChecklist({
              requisitos,
              colaborador: {
                id: c.id,
                data_nascimento: c.data_nascimento,
                regime: c.regime,
                estado_civil: c.estado_civil,
                veiculo_proprio: c.veiculo_proprio,
                aprendiz: c.aprendiz,
                possui_folha_ponto: c.possui_folha_ponto,
                cargo_exige_cnh: c.dp_cargos?.exige_cnh ?? false,
                cargo_exige_epi: c.dp_cargos?.exige_epi ?? false,
              },
              dependentes: ((deps.data ?? []) as any[]).filter((d) => d.colaborador_id === c.id),
              vinculos: ((vincs.data ?? []) as any[]).filter((v) => v.colaborador_id === c.id),
            });

            const resumo = resumirChecklist(itens);
            if (resumo.pendentesObrigatorios.length > 0) {
              const nomes = resumo.pendentesObrigatorios
                .slice(0, 3)
                .map((i) => tituloItem(i))
                .join(", ");
              results.push({
                id: `documentos-${c.id}`,
                icon: FileCheck2,
                titulo: `${resumo.pendentesObrigatorios.length} documento(s) obrigatório(s) de ${c.nome}`,
                subtitulo: `Faltando/irregular: ${nomes}${resumo.pendentesObrigatorios.length > 3 ? "…" : ""}`,
                tipo: "Documentos",
                colaboradorNome: c.nome,
                vencimento: null,
                atrasoDias: 1,
                url: `/dp/colaboradores?editar=${c.id}&aba=documentos`,
              });
            }
            if (resumo.aguardandoAprovacao.length > 0) {
              results.push({
                id: `documentos-aprovar-${c.id}`,
                icon: FileCheck2,
                titulo: `${resumo.aguardandoAprovacao.length} documento(s) de ${c.nome} aguardando aprovação`,
                subtitulo: "Enviados pelo colaborador — revise e aprove ou recuse.",
                tipo: "Documentos",
                colaboradorNome: c.nome,
                vencimento: null,
                atrasoDias: 0,
                url: `/dp/colaboradores?editar=${c.id}&aba=documentos`,
              });
            }
            if (resumo.vencendo.length > 0) {
              results.push({
                id: `documentos-vencendo-${c.id}`,
                icon: FileCheck2,
                titulo: `${resumo.vencendo.length} documento(s) de ${c.nome} vencendo`,
                subtitulo: resumo.vencendo.map((i) => tituloItem(i)).slice(0, 3).join(", "),
                tipo: "Documentos",
                colaboradorNome: c.nome,
                vencimento: null,
                atrasoDias: 0,
                url: `/dp/colaboradores?editar=${c.id}&aba=documentos`,
              });
            }
          }
        }
      } catch (e) {
        console.warn("pendencias/documentos:", e);
      }

      // 14. Cadastro de colaborador incompleto (campos essenciais em branco)
      try {
        const { data: colabsBase } = await supabase
          .from("dp_colaboradores")
          .select(
            "id, nome, setor_id, telefone, whatsapp, email_contato, endereco, data_nascimento, estado_civil, regime, forma_pagamento, valor_hora, valor_diaria, socio_remuneracao, cargo_id, unidade_id, recebe_em_especie",
          )
          .eq("company_id", selectedCompanyId!)
          .eq("ativo", true);
        // Campos confidenciais pela consulta segura (mascarados preservam "preenchido").
        const colabs = await mesclarConfidencial(selectedCompanyId!, (colabsBase ?? []) as any[]);

        // Salário pode vir do cargo (piso do patronal / ajuste da unidade) —
        // intermitente/horista sem valor próprio não está incompleto por isso.
        const [{ data: pisos }, { data: vinculosPatronal }] = await Promise.all([
          supabase
            .from("dp_cargo_salarios")
            .select("cargo_id, unidade_id, sindicato_patronal_id, salario_base, vigencia_inicio, vigencia_fim")
            .is("removido_em", null),
          supabase
            .from("dp_sindicato_unidades")
            .select("unidade_id, sindicato_id, dp_sindicatos!inner(tipo)")
            .eq("dp_sindicatos.tipo", "patronal"),
        ]);
        const pisosPorCargo = agruparPisosPorCargo((pisos ?? []) as any[]);
        const patronalPorUnidade = new Map<string, string>();
        for (const v of (vinculosPatronal ?? []) as any[]) {
          if (!patronalPorUnidade.has(v.unidade_id)) patronalPorUnidade.set(v.unidade_id, v.sindicato_id);
        }
        const salarioCargoDe = (cargoId: string | null, unidadeId: string | null): number | null => {
          if (!cargoId || !unidadeId) return null;
          return salarioCargoNaUnidade(
            pisosPorCargo.get(cargoId) ?? [],
            unidadeId,
            patronalPorUnidade.get(unidadeId) ?? null,
            undefined,
            { aceitarFuturo: true },
          ).valor;
        };

        const lista = (colabs ?? []) as any[];
        for (const c of lista) {
          // Só campos obrigatórios geram pendência (opcionais ficam como sugestão na ficha).
          const faltando = camposFaltandoObrigatorios(c, {
            salarioCargo: salarioCargoDe(c.cargo_id, c.unidade_id),
          });
          if (faltando.length === 0) continue;
          results.push({
            id: `cadastro-incompleto-${c.id}`,
            icon: UserCog,
            titulo: `Completar cadastro de ${c.nome}`,
            subtitulo: `Falta: ${resumoFaltando(faltando, 4)}`,
            tipo: "Cadastro de Colaborador",
            colaboradorNome: c.nome,
            vencimento: null,
            atrasoDias: 0,
            url: `/dp/colaboradores?editar=${c.id}&aba=dados`,
          });
        }
      } catch (e) {
        console.warn("pendencias/cadastro-incompleto:", e);
      }

      // Pré-Admissões que esperam uma ação do DP: revisar a ficha do candidato,
      // enviar à contabilidade ou criar o cadastro depois da ficha conferida.
      try {
        const { data: preadms } = await supabase
          .from("dp_preadmissoes")
          .select("id, candidato_nome, status, enviado_em, ficha_oficial_conferida_em, updated_at")
          .eq("company_id", selectedCompanyId!)
          .is("removido_em", null)
          .in("status", ["aguardando_revisao", "aguardando_nova_versao", "pronto_contabilidade", "registro_recebido"]);
        for (const pa of (preadms ?? []) as any[]) {
          const acao = pa.status === "registro_recebido"
            ? "Conferir a ficha oficial e criar o cadastro"
            : pa.status === "pronto_contabilidade"
              ? "Enviar a ficha à contabilidade"
              : "Revisar os dados e documentos enviados";
          const desde = pa.enviado_em || pa.updated_at;
          results.push({
            id: `preadmissao-${pa.id}`,
            icon: UserCog,
            titulo: `Pré-admissão de ${pa.candidato_nome}`,
            subtitulo: acao,
            tipo: "Pré-Admissão",
            colaboradorNome: pa.candidato_nome,
            vencimento: desde ? ymd(addDays(new Date(desde), cfg.alerta_preadmissao_dias)) : null,
            atrasoDias: desde ? differenceInCalendarDays(today, addDays(new Date(desde), cfg.alerta_preadmissao_dias)) : 0,
            url: "/dp/colaboradores/pre-admissoes",
          });
        }
      } catch (e) {
        console.warn("pendencias/preadmissao:", e);
      }

      // Recibos aguardando assinatura do colaborador além do prazo configurado.
      try {
        const { data: recs } = await supabase
          .from("dp_recibos")
          .select("id, beneficiario_nome, created_at, link_enviado_em, colaborador_id")
          .eq("company_id", selectedCompanyId!)
          .is("assinado_em", null)
          .is("cancelado_em", null)
          .is("substituido_em" as never, null)
          .limit(300);
        for (const r of (recs ?? []) as any[]) {
          const base = new Date(r.link_enviado_em || r.created_at);
          const venc = addDays(base, cfg.alerta_recibo_assinatura_dias);
          results.push({
            id: `recibo-assinatura-${r.id}`,
            icon: FileText,
            titulo: `Recibo sem assinatura — ${r.beneficiario_nome ?? "colaborador"}`,
            subtitulo: "Reenvie o link ou colete a assinatura do recibo.",
            tipo: "Assinaturas",
            colaboradorNome: r.beneficiario_nome ?? null,
            colaboradorId: r.colaborador_id ?? null,
            escopo: "pessoa",
            vencimento: ymd(venc),
            atrasoDias: differenceInCalendarDays(today, venc),
            url: "/dp/documentos/recibos",
          });
        }
      } catch (e) {
        console.warn("pendencias/recibos-assinatura:", e);
      }

      // Atas enviadas com participantes que ainda não assinaram.
      try {
        const { data: atas } = await supabase
          .from("dp_atas")
          .select("id, titulo, enviada_em, created_at")
          .eq("company_id", selectedCompanyId!)
          .eq("status", "enviada")
          .limit(200);
        const ids = ((atas ?? []) as any[]).map((a) => a.id);
        if (ids.length) {
          const { data: parts } = await supabase
            .from("dp_ata_participantes")
            .select("ata_id")
            .in("ata_id", ids)
            .is("assinado_em", null);
          const faltam = new Map<string, number>();
          ((parts ?? []) as any[]).forEach((p) => faltam.set(p.ata_id, (faltam.get(p.ata_id) ?? 0) + 1));
          for (const a of (atas ?? []) as any[]) {
            const n = faltam.get(a.id);
            if (!n) continue;
            const venc = addDays(new Date(a.enviada_em || a.created_at), cfg.alerta_ata_assinatura_dias);
            results.push({
              id: `ata-assinatura-${a.id}`,
              icon: ClipboardList,
              titulo: `Ata sem todas as assinaturas — ${a.titulo}`,
              subtitulo: `${n} participante(s) ainda não assinaram.`,
              tipo: "Assinaturas",
              escopo: "unidade",
              vencimento: ymd(venc),
              atrasoDias: differenceInCalendarDays(today, venc),
              url: "/dp/atas",
            });
          }
        }
      } catch (e) {
        console.warn("pendencias/atas-assinatura:", e);
      }

      // Contatos de emergência sem confirmação semestral.
      if (cfg.alerta_contatos_emergencia) {
        try {
          const { data: cs } = await supabase
            .from("dp_colaboradores")
            .select("id, nome, status, data_desligamento, contatos_confirmados_em, contatos_solicitado_em")
            .eq("company_id", selectedCompanyId!)
            .is("data_desligamento", null)
            .neq("status", "desligado")
            .limit(1000);
          for (const c of (cs ?? []) as any[]) {
            if (!confirmacaoVencida(c.contatos_confirmados_em, c.contatos_solicitado_em, today)) continue;
            results.push({
              id: `contatos-emergencia-${c.id}`,
              icon: Users,
              titulo: `Contatos de emergência a confirmar — ${c.nome}`,
              subtitulo: c.contatos_confirmados_em
                ? "Última confirmação há mais de 6 meses. O aviso aparece no portal do colaborador."
                : "Nunca confirmados. O aviso aparece no portal do colaborador.",
              tipo: "Cadastro de Colaborador",
              colaboradorNome: c.nome,
              colaboradorId: c.id,
              escopo: "pessoa",
              vencimento: null,
              atrasoDias: -1,
              url: `/dp/colaboradores/${c.id}`,
            });
          }
        } catch (e) {
          console.warn("pendencias/contatos-emergencia:", e);
        }
      }

      // Comprovante de pagamento em falta nos documentos de pagamento.
      // Só cobra documentos ativos a partir da data de início configurada.
      if (cfg.exigir_comprovante_pagamento) {
        try {
          const inicio = cfg.comprovante_vigencia_inicio || "2026-09-01";
          const { data: docsPagto } = await supabase
            .from("dp_documentos")
            .select("id, tipo, titulo, referencia_data, created_at, colaborador_id, comprovante_file_path, comprovante_modalidade, comprovante_pago_em, ciclo_status")
            .eq("company_id", selectedCompanyId!)
            .in("tipo", [...TIPOS_COM_COMPROVANTE] as never)
            .is("comprovante_file_path", null)
            .eq("ciclo_status", "ativo")
            .limit(500);
          const nomePorColab = new Map(colaboradoresDocs.map((c) => [c.id, c.nome]));
          const nomeUnidade = new Map(unidades.map((u) => [u.id, u.nome]));
          const diaAdiantPorUnidade = new Map(unidades.map((u) => [u.id, u.dia_adiantamento ?? null]));
          const idsResc = [...new Set(((docsPagto ?? []) as any[])
            .filter((d) => TIPOS_RESCISORIOS.has(String(d.tipo)) && d.colaborador_id)
            .map((d) => d.colaborador_id as string))];
          const deslPorColab = new Map<string, string | null>();
          if (idsResc.length) {
            const { data: desl } = await supabase
              .from("dp_colaboradores")
              .select("id, data_desligamento")
              .in("id", idsResc);
            for (const r of (desl ?? []) as any[]) deslPorColab.set(r.id, r.data_desligamento ?? null);
          }
          for (const d of (docsPagto ?? []) as any[]) {
            const referencia = String(d.referencia_data ?? d.created_at ?? "").slice(0, 10);
            if (!referencia || referencia < inicio) continue;
            // Pago em dinheiro com quitação registrada: não há comprovante bancário.
            if (d.comprovante_modalidade === "especie" && d.comprovante_pago_em) continue;
            const unidadeId = d.colaborador_id ? unidadeDoColab.get(d.colaborador_id) ?? null : null;
            // O comprovante só existe depois do pagamento: o prazo parte da data
            // prevista de pagamento do documento, não da competência.
            const vencimento = prazoComprovante({
              tipo: String(d.tipo),
              referencia,
              diaAdiantamento: unidadeId ? diaAdiantPorUnidade.get(unidadeId) ?? null : null,
              diaPagamentoFolha: cfg.alerta_contracheque_dia_mes,
              dataDesligamento: d.colaborador_id ? deslPorColab.get(d.colaborador_id) ?? null : null,
              toleranciaDias: cfg.alerta_comprovante_dias,
            });
            results.push({
              id: `comprovante-${d.id}`,
              icon: Coins,
              titulo: "Comprovante de pagamento não anexado",
              subtitulo: `${d.titulo ?? "Documento"} · ${competenciaLabel(competenciaDe(referencia))}`,
              tipo: "Comprovante de pagamento",
              colaboradorNome: d.colaborador_id ? nomePorColab.get(d.colaborador_id) ?? null : null,
              unidadeNome: unidadeId ? nomeUnidade.get(unidadeId) ?? null : null,
              colaboradorId: d.colaborador_id ?? null,
              unidadeId,
              competencia: competenciaDe(referencia),
              vencimento,
              atrasoDias: atrasoEmDias(vencimento, hojeISO),
              url: `/dp/documentos/historico?tipo=${d.tipo}`,
            });
          }
        } catch (e) {
          console.warn("pendencias/comprovante-pagamento:", e);
        }
      }

      // Pagamento de vales (VA/VT): próxima 2 dias antes, urgente no dia, atrasada depois.
      try {
        const hojeVale = ymd(today);
        const [{ data: cfgVale }, { data: apur }, { data: colabsVale }] = await Promise.all([
          supabase
            .from("dp_config_dp")
            .select("va_ativo, vt_ativo, va_dia_pagamento, vt_dia_pagamento")
            .eq("company_id", selectedCompanyId!)
            .is("unidade_id", null)
            .maybeSingle(),
          supabase
            .from("dp_va_apuracoes")
            .select("tipo, competencia")
            .eq("company_id", selectedCompanyId!)
            .not("fechado_em", "is", null)
            .gte("competencia", ymd(addDays(today, -70)).slice(0, 7) + "-01"),
          supabase
            .from("dp_colaboradores")
            .select("vale_alimentacao, vale_transporte")
            .eq("company_id", selectedCompanyId!)
            .eq("ativo", true),
        ]);
        const c = (cfgVale ?? {}) as Record<string, any>;
        const vales: Array<{ tipo: "va" | "vt"; ativo: boolean; dia: number | null; nome: string; campo: string }> = [
          { tipo: "va", ativo: c.va_ativo ?? true, dia: c.va_dia_pagamento ?? null, nome: "Vale-Alimentação", campo: "vale_alimentacao" },
          { tipo: "vt", ativo: c.vt_ativo ?? true, dia: c.vt_dia_pagamento ?? null, nome: "Vale-Transporte", campo: "vale_transporte" },
        ];
        for (const v of vales) {
          if (!v.ativo) continue;
          const qtd = ((colabsVale ?? []) as any[]).filter((x) => x[v.campo]).length;
          if (qtd === 0) continue;
          const fechadas = new Set(
            ((apur ?? []) as any[]).filter((a) => (a.tipo ?? "va") === v.tipo).map((a) => String(a.competencia).slice(0, 10)),
          );
          for (const ciclo of ciclosValePendentes({ diaPagamento: v.dia, hojeISO: hojeVale, competenciasFechadas: fechadas })) {
            const [a, m, d] = ciclo.vencimento.split("-");
            results.push({
              id: `vale-${v.tipo}-${ciclo.competencia}`,
              icon: Coins,
              titulo: `Pagamento do ${v.nome}`,
              subtitulo: `${qtd} colaborador${qtd > 1 ? "es" : ""} · pagamento em ${d}/${m}/${a}. Feche a apuração na calculadora.`,
              tipo: "Benefícios",
              competencia: ciclo.competencia,
              vencimento: ciclo.vencimento,
              atrasoDias: ciclo.atrasoDias,
              urgente: ciclo.urgente,
              url: "/dp/beneficios",
            });
          }
        }
      } catch (e) {
        console.warn("pendencias/vales:", e);
      }

      // Unidades sem calendário de feriados no ano corrente.
      try {
        if (unidades.length > 0) {
          const { data: fer } = await supabase
            .from("dp_unidade_feriados")
            .select("id, unidade_id, nome, tipo, data, dia, mes, ordinal, dia_semana, ativo")
            .eq("company_id", selectedCompanyId!)
            .eq("ativo", true);
          const comFeriado = new Set<string>();
          for (const f of (fer ?? []) as any[]) {
            if (dataDoFeriadoNoAno(f as FeriadoRegra, anoVigente)) comFeriado.add(f.unidade_id);
          }
          for (const u of unidadesSemFeriados(unidades, comFeriado)) {
            results.push({
              id: `unidade-sem-feriados-${u.id}-${anoVigente}`,
              icon: Scale,
              titulo: "Unidade sem calendário de feriados",
              subtitulo: `${u.nome} não possui feriados cadastrados para ${anoVigente}. Férias e folgas em feriado ficam sem validação.`,
              tipo: "Feriados",
              unidadeNome: u.nome,
              unidadeId: u.id,
              atrasoDias: 0,
              url: `/dp/cadastros/unidades?editar=${u.id}&aba=feriados`,
            });
          }
        }
      } catch (e) {
        console.warn("pendencias/feriados:", e);
      }




      // A apuração documental é compartilhada entre as telas e também roda
      // automaticamente às 3h (horário de São Paulo). Se alguma
      // alteração deixou o resultado marcado como desatualizado, recalcula ao abrir.
      try {
        let { data: apuracao } = await supabase
          .from("dp_pendencias_apuracoes")
          .select("apurado_em, sujo_desde")
          .eq("company_id", selectedCompanyId!)
          .maybeSingle();
        const precisaAtualizar = !apuracao?.apurado_em || new Date(apuracao.sujo_desde).getTime() > new Date(apuracao.apurado_em).getTime();
        if (precisaAtualizar) {
          setIsRefreshing(true);
          try {
            const { error } = await supabase.functions.invoke("dp-refresh-pendencias", {
              body: { companyId: selectedCompanyId },
            });
            if (!error) {
              const refreshed = await supabase
                .from("dp_pendencias_apuracoes")
                .select("apurado_em, sujo_desde")
                .eq("company_id", selectedCompanyId!)
                .maybeSingle();
              apuracao = refreshed.data;
            }
          } finally {
            setIsRefreshing(false);
          }
        }

        const { data: materializadas, error } = await supabase
          .from("dp_pendencias_materializadas")
          .select("pendencia_id, titulo, subtitulo, tipo, vencimento, atraso_dias, url, colaborador_nome, unidade_nome, colaborador_id, competencia, doc_tipo, unidade_id, escopo, pessoas, total_elegiveis")
          .eq("company_id", selectedCompanyId!);
        if (error) throw error;

        const tiposCompartilhados = new Set(["contracheque", "adiantamento", "ponto", "rescisao"]);
        for (let i = results.length - 1; i >= 0; i--) {
          if (results[i].docTipo && tiposCompartilhados.has(results[i].docTipo as string)) results.splice(i, 1);
          else if (results[i].id.startsWith("rescisao-")) results.splice(i, 1);
        }
        const icones: Record<string, LucideIcon> = {
          contracheque: FileText,
          adiantamento: Coins,
          ponto: Clock,
          rescisao: FileMinus,
        };
        for (const p of materializadas ?? []) {
          results.push({
            id: p.pendencia_id,
            icon: icones[p.doc_tipo ?? ""] ?? FileText,
            titulo: p.titulo,
            subtitulo: p.subtitulo,
            tipo: p.tipo,
            vencimento: p.vencimento,
            atrasoDias: p.atraso_dias,
            url: p.url,
            colaboradorNome: p.colaborador_nome,
            unidadeNome: p.unidade_nome,
            colaboradorId: p.colaborador_id,
            competencia: p.competencia,
            docTipo: p.doc_tipo as DocTipoColaborador | null,
            unidadeId: p.unidade_id,
            escopo: p.escopo as "unidade" | "pessoa" | undefined,
            pessoas: Array.isArray(p.pessoas) ? p.pessoas as Array<{ nome: string; desligamento: string | null }> : undefined,
            totalElegiveis: p.total_elegiveis ?? undefined,
          });
        }
      } catch (e) {
        console.warn("pendencias/materializadas:", e);
      }

      // Ordenar: atrasados primeiro, urgentes em seguida; empate → vencimento e nome.
      results.sort(compararUrgencia);

      return results;
    },
  });

  const apuracao = useQuery({
    queryKey: ["dp_pendencias_apuracao", selectedCompanyId, query.dataUpdatedAt],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("dp_pendencias_apuracoes")
        .select("apurado_em")
        .eq("company_id", selectedCompanyId!)
        .maybeSingle();
      return data?.apurado_em ?? null;
    },
  });

  const refetch = useCallback(async () => {
    if (selectedCompanyId) {
      // Atualização manual: o retrato guardado no aparelho não pode segurar
      // o quadro antigo — a próxima leitura do servidor passa a valer.
      forcarRecargaPendencias(selectedCompanyId);
      setIsRefreshing(true);
      try {
        await supabase.functions.invoke("dp-refresh-pendencias", {
          body: { companyId: selectedCompanyId },
        });
      } finally {
        setIsRefreshing(false);
      }
    }
    return query.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId]);

  return { ...query, refetch, isRefreshing, lastCalculatedAt: apuracao.data ?? null };
}

/** Alias explícito: escopo administrativo (empresa inteira). */
export const useDpPendenciasAdmin = useDpPendencias;
