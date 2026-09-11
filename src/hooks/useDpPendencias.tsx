import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpPendenciasConfig, type DpPendenciasConfig } from "@/hooks/useDpPendenciasConfig";
import { useDpFeriasConfig } from "@/hooks/useDpFeriasConfig";
import { addDays, differenceInCalendarDays, format } from "date-fns";
import type { LucideIcon } from "lucide-react";
import { ClipboardList, FileCheck2, FileMinus, FileText, Users, Coins, Clock, Scale, Palmtree, ShieldCheck, HardHat, GraduationCap, UserCog, Baby } from "lucide-react";
import { LEMBRETE_RETORNO_DIAS, TIPOS_AFASTAMENTO, TIPOS_LICENCA, afastamentoCobreCompetencia, labelAfastamento, situacaoRetorno } from "@/lib/dp/licencas";
import { resolverChecklist, resumirChecklist, tituloItem } from "@/lib/dp/documentos-requisitos";
import { camposFaltandoObrigatorios, resumoFaltando } from "@/lib/dp/cadastro-completude";
import { agruparPisosPorCargo, salarioCargoNaUnidade } from "@/lib/dp/cargoSalarios";
import { alertaPendenciaFerias, periodosComAcumulo } from "@/lib/dp/ferias-direito";
import { compararUrgencia } from "@/lib/dp/pendencias";

import { alertasDependentes, tabelaSalarioFamiliaVencida } from "@/lib/dp/salarioFamilia";
import {
  atrasoEmDias,
  competenciaDe,
  competenciaLabel,
  competenciasParaCobrar,
  DOC_TIPOS_RESCISAO,
  elegivelDocumento,
  intervaloCompetencia,
  limiteMesSeguinte,
  limiteNoMes,
  somarMeses,
  type ColabElegibilidade,
  type DocTipoColaborador,
} from "@/lib/dp/pendencias-documentos";
import { ativoNaCompetencia } from "@/lib/dp/bulk-coverage";
import {
  optanteNaCompetencia,
  type AdiantamentoSolicitacao,
} from "@/lib/dp/adiantamento-opcao";

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
            "id, tipo, estado, analise_status, tratativa_status, tratativa_ponto, data_operacional, created_at, colaborador:colaborador_id(nome)",
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
              (o.tratativa_ponto && o.tratativa_status === "pendente"),
          )
          .forEach((o: any) => {
            const vencimento = new Date(o.created_at);
            vencimento.setHours(vencimento.getHours() + cfg.alerta_ocorrencia_horas);
            const dias = differenceInCalendarDays(today, vencimento);
            const titulo =
              o.estado === "aguardando_confirmacao"
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
            "id, nome, unidade_id, ativo, regime, vinculo_label, possui_folha_ponto, optante_adiantamento, data_admissao, data_desligamento",
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

      // Evidência de trabalho do intermitente: marcações de ponto na competência.
      // (Convocação aceita/escala entram pelo próprio registro de ponto.)
      const intermitentesIds = colaboradoresDocs
        .filter((c) => String(c.regime ?? "").toLowerCase() === "intermitente")
        .map((c) => c.id);
      const pontoIntermitente = new Set<string>(); // `${colab}:${comp}`
      if (intermitentesIds.length > 0) {
        try {
          const { data: pts } = await supabase
            .from("dp_pontos")
            .select("colaborador_id, data")
            .eq("company_id", selectedCompanyId!)
            .in("colaborador_id", intermitentesIds)
            .gte("data", `${somarMeses(compVigente, -24)}-01`)
            .lte("data", hojeISO);
          (pts ?? []).forEach((p: any) => {
            if (p.colaborador_id && p.data) {
              pontoIntermitente.add(`${p.colaborador_id}:${String(p.data).slice(0, 7)}`);
            }
          });
        } catch (e) {
          console.warn("pendencias/intermitente-pontos:", e);
        }
      }

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
        pontoIntermitente.has(`${colaboradorId}:${competencia}`) ||
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
      // naquela competência, ainda que não existam marcações em dp_pontos.
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

      // 5b. Rescisão não importada — pessoa desligada na competência sem TRCT/demonstrativo.
      // Prazo legal do acerto: 10 dias corridos após o desligamento.
      {
        const docs = await carregarTipo("rescisao", rangeInicio, rangeFim);
        for (const u of unidades) {
          for (const comp of compsPorUnidade.get(u.id)?.ateVigente ?? []) {
            const { faltantes } = faltantesDocumento("rescisao", docs, u, comp);
            for (const c of faltantes) {
              const desligamento = String(c.data_desligamento ?? "").slice(0, 10);
              if (!desligamento) continue;
              const vencimento = ymd(addDays(new Date(`${desligamento}T12:00:00`), 10));
              results.push({
                id: `rescisao-${c.id}-${comp.slice(0, 4)}-${Number(comp.slice(5, 7))}`,
                icon: FileMinus,
                titulo: "Rescisão não importada",
                subtitulo: `${c.nome} · ${u.nome} — ${competenciaLabel(comp)} · desligado em ${format(
                  new Date(`${desligamento}T12:00:00`),
                  "dd/MM",
                )}`,
                tipo: "Rescisão",
                colaboradorNome: c.nome,
                unidadeNome: u.nome,
                vencimento,
                atrasoDias: atrasoEmDias(vencimento, hojeISO),
                url: `/dp/documentos?tipo=trct&competencia=${comp}&unidade=${u.id}`,
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


      // 7. Férias — períodos aquisitivos com saldo perto do limite concessivo
      try {
        const limite = new Date(today);
        limite.setDate(limite.getDate() + cfg.alerta_ferias_dias);
        const { data: periodos } = await supabase
          .from("dp_ferias_periodos")
          .select("id, colaborador_id, fim_aquisitivo, limite_concessivo, dias_saldo, dp_colaboradores(nome, vinculo_label, ativo)")
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

      // 7b. Licenças (maternidade/paternidade) — retorno se aproximando ou vencido
      try {
        const limiteRetorno = new Date(today);
        limiteRetorno.setDate(limiteRetorno.getDate() + LEMBRETE_RETORNO_DIAS);
        const { data: licencas } = await supabase
          .from("dp_solicitacoes")
          .select("id, colaborador_id, tipo, data_alvo, data_fim, retorno_confirmado_em, dp_colaboradores(nome, ativo)")
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

      // 8. Conformidade — ASO, EPIs e treinamentos vencendo
      try {
        const limiteAso = new Date(today);
        limiteAso.setDate(limiteAso.getDate() + cfg.alerta_aso_dias);
        const { data: exames } = await supabase
          .from("dp_exames_aso")
          .select("id, colaborador_id, data_vencimento, tipo, dp_colaboradores(nome)")
          .eq("company_id", selectedCompanyId!)
          .not("data_vencimento", "is", null)
          .lte("data_vencimento", ymd(limiteAso))
          .order("data_vencimento", { ascending: true })
          .limit(30);
        (exames ?? []).forEach((e: any) => {
          const vencimento = new Date(`${e.data_vencimento}T00:00:00`);
          const dias = differenceInCalendarDays(today, vencimento);
          results.push({
            id: `aso-${e.id}`,
            icon: ShieldCheck,
            titulo: dias > 0 ? "Exame ocupacional vencido" : "Exame ocupacional a vencer",
            subtitulo: `${e.dp_colaboradores?.nome ?? "Colaborador"} — vence ${format(vencimento, "dd/MM/yyyy")}`,
            tipo: "ASO",
            colaboradorNome: e.dp_colaboradores?.nome ?? null,
            vencimento: ymd(vencimento),
            atrasoDias: dias,
            url: `/dp/conformidade?aba=aso&colaborador=${e.colaborador_id}`,
          });
        });

        const limiteEpi = new Date(today);
        limiteEpi.setDate(limiteEpi.getDate() + cfg.alerta_epi_dias);
        const { data: entregas } = await supabase
          .from("dp_epis_entregas")
          .select("id, colaborador_id, data_troca_prevista, dp_colaboradores(nome), dp_epis(nome)")
          .eq("company_id", selectedCompanyId!)
          .is("data_devolucao", null)
          .not("data_troca_prevista", "is", null)
          .lte("data_troca_prevista", ymd(limiteEpi))
          .order("data_troca_prevista", { ascending: true })
          .limit(30);
        (entregas ?? []).forEach((e: any) => {
          const vencimento = new Date(`${e.data_troca_prevista}T00:00:00`);
          const dias = differenceInCalendarDays(today, vencimento);
          results.push({
            id: `epi-${e.id}`,
            icon: HardHat,
            titulo: "Troca de EPI",
            subtitulo: `${e.dp_colaboradores?.nome ?? "Colaborador"} — ${e.dp_epis?.nome ?? "EPI"} · previsto ${format(vencimento, "dd/MM/yyyy")}`,
            tipo: "EPI",
            colaboradorNome: e.dp_colaboradores?.nome ?? null,
            vencimento: ymd(vencimento),
            atrasoDias: dias,
            url: `/dp/conformidade?aba=epis&colaborador=${e.colaborador_id}`,
          });
        });

        const limiteTre = new Date(today);
        limiteTre.setDate(limiteTre.getDate() + cfg.alerta_treinamento_dias);
        const { data: parts } = await supabase
          .from("dp_treinamentos_participacoes")
          .select("id, colaborador_id, data_vencimento, dp_colaboradores(nome), dp_treinamentos(nome)")
          .eq("company_id", selectedCompanyId!)
          .not("data_vencimento", "is", null)
          .lte("data_vencimento", ymd(limiteTre))
          .order("data_vencimento", { ascending: true })
          .limit(30);
        (parts ?? []).forEach((p: any) => {
          const vencimento = new Date(`${p.data_vencimento}T00:00:00`);
          const dias = differenceInCalendarDays(today, vencimento);
          results.push({
            id: `treino-${p.id}`,
            icon: GraduationCap,
            titulo: dias > 0 ? "Treinamento vencido" : "Treinamento a renovar",
            subtitulo: `${p.dp_colaboradores?.nome ?? "Colaborador"} — ${p.dp_treinamentos?.nome ?? "Treinamento"} · vence ${format(vencimento, "dd/MM/yyyy")}`,
            tipo: "Treinamento",
            colaboradorNome: p.dp_colaboradores?.nome ?? null,
            vencimento: ymd(vencimento),
            atrasoDias: dias,
            url: `/dp/conformidade?aba=treinamentos&colaborador=${p.colaborador_id}`,
          });
        });
      } catch (e) {
        console.warn("pendencias/conformidade:", e);
      }

      // 9. Escala do próximo mês — cobrar o gestor nos últimos dias do mês
      try {
        const ultimoDia = new Date(anoVigente, mesVigente, 0).getDate();
        if (diaHoje >= ultimoDia - 4) {
          const inicioProx = new Date(anoVigente, mesVigente, 1);
          const fimProx = new Date(anoVigente, mesVigente + 1, 0);
          const [{ data: colabs }, { data: folgas }] = await Promise.all([
            supabase
              .from("dp_colaboradores")
              .select("id")
              .eq("company_id", selectedCompanyId!)
              .eq("ativo", true),
            supabase
              .from("dp_folgas")
              .select("colaborador_id")
              .eq("company_id", selectedCompanyId!)
              .neq("status", "cancelada")
              .gte("data", ymd(inicioProx))
              .lte("data", ymd(fimProx)),
          ]);
          const comFolga = new Set((folgas ?? []).map((f: any) => f.colaborador_id));
          const semEscala = (colabs ?? []).filter((c: any) => !comFolga.has(c.id)).length;
          if (semEscala > 0) {
            const prazo = new Date(anoVigente, mesVigente - 1, ultimoDia);
            results.push({
              id: `escala-${anoVigente}-${mesVigente + 1}`,
              icon: Clock,
              titulo: "Definir Escala Do Próximo Mês",
              subtitulo: `${semEscala} colaborador(es) sem folgas em ${MES_NOME[inicioProx.getMonth()]} — o sistema gera automaticamente às 23:59 do dia ${ultimoDia}`,
              tipo: "Escala",
              vencimento: ymd(prazo),
              atrasoDias: differenceInCalendarDays(today, prazo),
              url: `/dp/escalas?mes=${inicioProx.getFullYear()}-${String(inicioProx.getMonth() + 1).padStart(2, "0")}`,
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
            titulo: "Unidade Não Identificada No Lote",
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
        const sfConfig = {
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
            titulo: "Atualizar Tabela Do Salário-Família",
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
        const { data: colabs } = await supabase
          .from("dp_colaboradores")
          .select(
            "id, nome, setor_id, telefone, whatsapp, email_contato, endereco, data_nascimento, estado_civil, regime, pis_nit, salario_base, forma_pagamento, valor_hora, valor_diaria, base_salarial, socio_remuneracao, cargo_id, unidade_id",
          )
          .eq("company_id", selectedCompanyId!)
          .eq("ativo", true);

        // Salário pode vir do cargo (piso do patronal / ajuste da unidade) —
        // intermitente/horista sem valor próprio não está incompleto por isso.
        const [{ data: pisos }, { data: vinculosPatronal }] = await Promise.all([
          supabase
            .from("dp_cargo_salarios")
            .select("cargo_id, unidade_id, sindicato_patronal_id, salario_base, vigencia_inicio, vigencia_fim"),
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
            tipo: "Cadastro",
            colaboradorNome: c.nome,
            vencimento: null,
            atrasoDias: 0,
            url: `/dp/colaboradores?editar=${c.id}&aba=dados`,
          });
        }
      } catch (e) {
        console.warn("pendencias/cadastro-incompleto:", e);
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

  const refetch = async () => {
    if (selectedCompanyId) {
      await supabase.functions.invoke("dp-refresh-pendencias", {
        body: { companyId: selectedCompanyId },
      });
    }
    return query.refetch();
  };

  return { ...query, refetch, lastCalculatedAt: apuracao.data ?? null };
}

/** Alias explícito: escopo administrativo (empresa inteira). */
export const useDpPendenciasAdmin = useDpPendencias;
