import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpPendenciasConfig, type DpPendenciasConfig } from "@/hooks/useDpPendenciasConfig";
import { differenceInCalendarDays, format } from "date-fns";
import type { LucideIcon } from "lucide-react";
import { ClipboardList, FileText, Users, Coins, Clock, Scale, Palmtree, ShieldCheck, HardHat, GraduationCap } from "lucide-react";

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
            url: "/dp/solicitacoes",
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
            url: "/dp/trocas",
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
              url: "/dp/documentos/contracheque",
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
                url: "/dp/documentos/act-cct",
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
                url: "/dp/documentos/act-cct",
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
