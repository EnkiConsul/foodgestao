import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpPendenciasConfig, type DpPendenciasConfig } from "@/hooks/useDpPendenciasConfig";
import { differenceInCalendarDays, format } from "date-fns";
import type { LucideIcon } from "lucide-react";
import { ClipboardList, FileCheck2, FileText, Users, Coins, Clock, Scale, Palmtree, ShieldCheck, HardHat, GraduationCap } from "lucide-react";
import { resolverChecklist, resumirChecklist, tituloItem } from "@/lib/dp/documentos-requisitos";
import { alertasDependentes, tabelaSalarioFamiliaVencida } from "@/lib/dp/salarioFamilia";

export type Pendencia = {
  id: string;
  icon: LucideIcon;
  titulo: string;
  subtitulo: string;
  tipo: string;
  vencimento?: string | null;
  atrasoDias: number;
  url: string;
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
  const { config } = useDpPendenciasConfig();

  return useQuery({
    queryKey: ["dp_pendencias", selectedCompanyId, config],
    enabled: !!selectedCompanyId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
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
            vencimento: ymd(vencimento),
            atrasoDias: dias,
            url: "/dp/folgas?aba=trocas",
          });
        });
      } catch (e) {
        console.warn("pendencias/trocas:", e);
      }

      // Carregar unidades ativas (usadas nos blocos 3-6)
      let unidades: Array<{
        id: string;
        nome: string;
        possui_relogio_ponto: boolean | null;
        tem_adiantamento: boolean | null;
        dia_adiantamento: number | null;
      }> = [];
      try {
        const { data } = await supabase
          .from("dp_unidades")
          .select("id, nome, possui_relogio_ponto, tem_adiantamento, dia_adiantamento")
          .eq("company_id", selectedCompanyId!)
          .eq("ativo", true);
        unidades = (data ?? []) as any;
      } catch (e) {
        console.warn("pendencias/unidades:", e);
      }

      // Helper: colaboradores por unidade (cache local)
      const colabsByUnidade = new Map<string, string[]>();
      const getColabsByUnidade = async (unidadeId: string): Promise<string[]> => {
        if (colabsByUnidade.has(unidadeId)) return colabsByUnidade.get(unidadeId)!;
        const { data } = await supabase
          .from("dp_colaboradores")
          .select("id")
          .eq("company_id", selectedCompanyId!)
          .eq("unidade_id", unidadeId);
        const ids = (data ?? []).map((c: any) => c.id);
        colabsByUnidade.set(unidadeId, ids);
        return ids;
      };

      const hasDocsForUnidade = async (
        tipo: "contracheque" | "adiantamento" | "ponto",
        unidadeId: string,
        inicio: string,
        fim: string,
      ): Promise<boolean> => {
        const colabIds = await getColabsByUnidade(unidadeId);
        if (colabIds.length === 0) return false;
        const { count } = await supabase
          .from("dp_documentos")
          .select("id", { count: "exact", head: true })
          .eq("company_id", selectedCompanyId!)
          .eq("tipo", tipo)
          .in("colaborador_id", colabIds)
          .gte("referencia_data", inicio)
          .lte("referencia_data", fim);
        return (count ?? 0) > 0;
      };

      // 3. Contracheque não importado (mês anterior) — por unidade
      if (diaHoje >= cfg.alerta_contracheque_dia_mes) {
        try {
          const compIni = `${anoAnterior}-${String(mesAnterior).padStart(2, "0")}-01`;
          const compFim = ymd(new Date(anoAnterior, mesAnterior, 0));
          const vencimento = new Date(anoVigente, mesVigente - 1, cfg.alerta_contracheque_dia_mes);
          const dias = differenceInCalendarDays(today, vencimento);
          for (const u of unidades) {
            const importado = await hasDocsForUnidade("contracheque", u.id, compIni, compFim);
            if (importado) continue;
            results.push({
              id: `contracheque-${u.id}-${anoAnterior}-${mesAnterior}`,
              icon: FileText,
              titulo: "Contracheque não importado",
              subtitulo: `${u.nome} — ${MES_NOME[mesAnterior - 1]}/${anoAnterior}`,
              tipo: "Contracheque",
              vencimento: ymd(vencimento),
              atrasoDias: dias,
              url: "/dp/documentos/historico?tipo=contracheque",
            });
          }
        } catch (e) {
          console.warn("pendencias/contracheque:", e);
        }
      }

      // 4. Adiantamento não importado (mês vigente) — por unidade que exige adiantamento
      try {
        const compIni = `${anoVigente}-${String(mesVigente).padStart(2, "0")}-01`;
        const compFim = ymd(new Date(anoVigente, mesVigente, 0));
        for (const u of unidades) {
          if (!u.tem_adiantamento || !u.dia_adiantamento) continue;
          const diaLimite = u.dia_adiantamento + cfg.alerta_adiantamento_offset;
          if (diaHoje < diaLimite) continue;
          const importado = await hasDocsForUnidade("adiantamento", u.id, compIni, compFim);
          if (importado) continue;
          const vencimento = new Date(anoVigente, mesVigente - 1, diaLimite);
          const dias = differenceInCalendarDays(today, vencimento);
          results.push({
            id: `adiantamento-${u.id}-${anoVigente}-${mesVigente}`,
            icon: Coins,
            titulo: "Adiantamento não importado",
            subtitulo: `${u.nome} — ${MES_NOME[mesVigente - 1]}/${anoVigente}`,
            tipo: "Adiantamento",
            vencimento: ymd(vencimento),
            atrasoDias: dias,
            url: "/dp/documentos/adiantamento",
          });
        }
      } catch (e) {
        console.warn("pendencias/adiantamento:", e);
      }

      // 5. Folha de ponto não importada (mês anterior) — por unidade com relógio
      if (diaHoje >= cfg.alerta_folha_ponto_dia_mes) {
        try {
          const inicio = `${anoAnterior}-${String(mesAnterior).padStart(2, "0")}-01`;
          const fim = ymd(new Date(anoAnterior, mesAnterior, 0));
          const vencimento = new Date(anoVigente, mesVigente - 1, cfg.alerta_folha_ponto_dia_mes);
          const dias = differenceInCalendarDays(today, vencimento);
          for (const u of unidades) {
            if (!u.possui_relogio_ponto) continue;
            const importado = await hasDocsForUnidade("ponto", u.id, inicio, fim);
            if (importado) continue;
            results.push({
              id: `folha_ponto-${u.id}-${anoAnterior}-${mesAnterior}`,
              icon: Clock,
              titulo: "Folha de ponto não importada",
              subtitulo: `${u.nome} — ${MES_NOME[mesAnterior - 1]}/${anoAnterior}`,
              tipo: "Folha de Ponto",
              vencimento: ymd(vencimento),
              atrasoDias: dias,
              url: "/dp/documentos/ponto",
            });
          }
        } catch (e) {
          console.warn("pendencias/folha_ponto:", e);
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

        for (const [unidadeId, sindSet] of parByUnidade.entries()) {
          const unidadeNome = unidadeMap.get(unidadeId);
          if (!unidadeNome) continue;
          for (const sindId of sindSet) {
            const nomeSind = sindicatoNome.get(sindId) ?? "Sindicato";
            const { data: negs } = await supabase
              .from("dp_sindicato_negociacoes")
              .select("ano, mes")
              .eq("company_id", selectedCompanyId!)
              .eq("unidade_id", unidadeId)
              .or(`sindicato_laboral_id.eq.${sindId},sindicato_id.eq.${sindId}`)
              .not("ano", "is", null)
              .not("mes", "is", null)
              .order("ano", { ascending: false })
              .order("mes", { ascending: false })
              .limit(1);

            const id = `negociacao-${unidadeId}-${sindId}`;
            if (!negs || negs.length === 0) {
              results.push({
                id,
                icon: Scale,
                titulo: `Negociação coletiva pendente — ${nomeSind}`,
                subtitulo: `${unidadeNome} — nenhuma negociação cadastrada. Cadastre uma nova para renovar.`,
                tipo: "Negociação",
                vencimento: ymd(today),
                atrasoDias: 0,
                url: "/dp/cadastros/unidades",
              });
              continue;
            }
            const ultima: any = negs[0];
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
                vencimento: ymd(vencimento),
                atrasoDias: dias,
                url: "/dp/cadastros/unidades",
              });
            }
          }
        }
      } catch (e) {
        console.warn("pendencias/negociacoes:", e);
      }

      // 7. Férias — períodos aquisitivos com saldo perto do limite concessivo
      try {
        const limite = new Date(today);
        limite.setDate(limite.getDate() + cfg.alerta_ferias_dias);
        const { data: periodos } = await supabase
          .from("dp_ferias_periodos")
          .select("id, colaborador_id, limite_concessivo, dias_saldo, dp_colaboradores(nome)")
          .eq("company_id", selectedCompanyId!)
          .gt("dias_saldo", 0)
          .lte("limite_concessivo", ymd(limite))
          .order("limite_concessivo", { ascending: true })
          .limit(30);
        (periodos ?? []).forEach((p: any) => {
          const vencimento = new Date(`${p.limite_concessivo}T00:00:00`);
          const dias = differenceInCalendarDays(today, vencimento);
          const jaVenceu = dias > 0;
          results.push({
            id: `ferias-${p.id}`,
            icon: Palmtree,
            titulo: jaVenceu ? "Férias vencidas" : "Férias a vencer",
            subtitulo: `${p.dp_colaboradores?.nome ?? "Colaborador"} — ${p.dias_saldo} dia(s) de saldo · limite ${format(vencimento, "dd/MM/yyyy")}`,
            tipo: "Férias",
            vencimento: ymd(vencimento),
            atrasoDias: dias,
            url: "/dp/ferias",
          });
        });
      } catch (e) {
        console.warn("pendencias/ferias:", e);
      }

      // 8. Conformidade — ASO, EPIs e treinamentos vencendo
      try {
        const limiteAso = new Date(today);
        limiteAso.setDate(limiteAso.getDate() + cfg.alerta_aso_dias);
        const { data: exames } = await supabase
          .from("dp_exames_aso")
          .select("id, data_vencimento, tipo, dp_colaboradores(nome)")
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
            vencimento: ymd(vencimento),
            atrasoDias: dias,
            url: "/dp/conformidade",
          });
        });

        const limiteEpi = new Date(today);
        limiteEpi.setDate(limiteEpi.getDate() + cfg.alerta_epi_dias);
        const { data: entregas } = await supabase
          .from("dp_epis_entregas")
          .select("id, data_troca_prevista, dp_colaboradores(nome), dp_epis(nome)")
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
            vencimento: ymd(vencimento),
            atrasoDias: dias,
            url: "/dp/conformidade",
          });
        });

        const limiteTre = new Date(today);
        limiteTre.setDate(limiteTre.getDate() + cfg.alerta_treinamento_dias);
        const { data: parts } = await supabase
          .from("dp_treinamentos_participacoes")
          .select("id, data_vencimento, dp_colaboradores(nome), dp_treinamentos(nome)")
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
            vencimento: ymd(vencimento),
            atrasoDias: dias,
            url: "/dp/conformidade",
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
              url: "/dp/escalas",
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
        (lotes ?? []).forEach((l: any) => {
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
            url: "/dp/documentos",
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
        alertasDependentes((deps ?? []) as any, ymd(today)).forEach((a) => {
          results.push({
            id: `dependente-${a.dependenteId}-${a.tipo}`,
            icon: Users,
            titulo: a.titulo,
            subtitulo: `${a.nome} — dependente de ${porId.get(a.dependenteId) ?? "colaborador"}. ${a.descricao}`,
            tipo: "Dependente",
            vencimento: null,
            atrasoDias: a.severidade === "alta" ? 1 : 0,
            url: "/dp/colaboradores",
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
                vencimento: null,
                atrasoDias: 1,
                url: "/dp/colaboradores",
              });
            }
            if (resumo.aguardandoAprovacao.length > 0) {
              results.push({
                id: `documentos-aprovar-${c.id}`,
                icon: FileCheck2,
                titulo: `${resumo.aguardandoAprovacao.length} documento(s) de ${c.nome} aguardando aprovação`,
                subtitulo: "Enviados pelo colaborador — revise e aprove ou recuse.",
                tipo: "Documentos",
                vencimento: null,
                atrasoDias: 0,
                url: "/dp/colaboradores",
              });
            }
            if (resumo.vencendo.length > 0) {
              results.push({
                id: `documentos-vencendo-${c.id}`,
                icon: FileCheck2,
                titulo: `${resumo.vencendo.length} documento(s) de ${c.nome} vencendo`,
                subtitulo: resumo.vencendo.map((i) => tituloItem(i)).slice(0, 3).join(", "),
                tipo: "Documentos",
                vencimento: null,
                atrasoDias: 0,
                url: "/dp/colaboradores",
              });
            }
          }
        }
      } catch (e) {
        console.warn("pendencias/documentos:", e);
      }


      // Ordenar: mais atrasado primeiro; empate → vencimento mais próximo
      results.sort((a, b) => {
        if (b.atrasoDias !== a.atrasoDias) return b.atrasoDias - a.atrasoDias;
        const av = a.vencimento ? new Date(a.vencimento).getTime() : Infinity;
        const bv = b.vencimento ? new Date(b.vencimento).getTime() : Infinity;
        return av - bv;
      });

      return results;
    },
  });
}

/** Alias explícito: escopo administrativo (empresa inteira). */
export const useDpPendenciasAdmin = useDpPendencias;
